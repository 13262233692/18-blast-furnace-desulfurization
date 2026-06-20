"""
高炉铁水脱硫数据预处理脚本 - Dask 流式计算版本
使用 Dask DataFrame 替代 Pandas 全量内存读取，支持十 GB 级 CSV
采用分块清洗 + 增量计算 + 逐块写出的零拷贝架构
"""

import os
import sys
import json
import warnings
from pathlib import Path
from typing import Optional

warnings.filterwarnings('ignore')

try:
    import dask.dataframe as dd
    from dask.distributed import Client, LocalCluster
    DASK_AVAILABLE = True
except ImportError:
    DASK_AVAILABLE = False

import pandas as pd
import numpy as np


MEMORY_TARGET = '2GB'
CHUNK_SIZE = 50_000
OUTPUT_CHUNK_SIZE = 100_000


def init_dask_cluster(n_workers: int = 4, memory_limit: str = MEMORY_TARGET) -> Optional[Client]:
    if not DASK_AVAILABLE:
        print('⚠ Dask 未安装，将使用 Pandas Chunk 流式模式')
        return None
    cluster = LocalCluster(
        n_workers=n_workers,
        threads_per_worker=2,
        memory_limit=memory_limit,
        processes=True,
    )
    client = Client(cluster)
    print(f'✓ Dask 集群启动: {client}')
    print(f'  Workers: {n_workers}, 每工作内存: {memory_limit}')
    return client


def clean_timestamps_chunk(df: pd.DataFrame, ts_col: str = 'timestamp') -> pd.DataFrame:
    df[ts_col] = pd.to_datetime(df[ts_col], errors='coerce', cache=False)
    df = df.dropna(subset=[ts_col])
    return df


def remove_outliers_chunk(df: pd.DataFrame, columns: list[str],
                          global_stats: dict[str, tuple[float, float]],
                          n_std: float = 4.0) -> pd.DataFrame:
    for col in columns:
        if col in df.columns and col in global_stats:
            mean, std = global_stats[col]
            lower = mean - n_std * std
            upper = mean + n_std * std
            df.loc[(df[col] < lower) | (df[col] > upper), col] = np.nan
    return df


def compute_global_stats_stream(filepath: str, columns: list[str]) -> dict[str, tuple[float, float]]:
    """使用 Welford 在线算法增量计算均值和方差，避免全量加载"""
    stats: dict[str, dict[str, float]] = {
        col: {'count': 0, 'mean': 0.0, 'M2': 0.0}
        for col in columns
    }

    for chunk in pd.read_csv(filepath, chunksize=CHUNK_SIZE, usecols=columns):
        for col in columns:
            if col not in chunk.columns:
                continue
            vals = chunk[col].dropna().values
            for val in vals:
                stats[col]['count'] += 1
                delta = val - stats[col]['mean']
                stats[col]['mean'] += delta / stats[col]['count']
                delta2 = val - stats[col]['mean']
                stats[col]['M2'] += delta * delta2

    result = {}
    for col, s in stats.items():
        if s['count'] > 1:
            variance = s['M2'] / (s['count'] - 1)
            std = np.sqrt(variance)
        else:
            std = 1.0
        result[col] = (s['mean'], std)
        print(f'  {col}: mean={result[col][0]:.2f}, std={result[col][1]:.2f}, n={s["count"]}')

    return result


def align_and_resample_stream(input_file: str, output_file: str,
                              target_freq: str = '1S',
                              numeric_cols: Optional[list[str]] = None,
                              global_stats: Optional[dict] = None) -> int:
    """流式读取、清洗、重采样、逐块写出"""
    print(f'\n→ 处理 {os.path.basename(input_file)}')

    if numeric_cols is None:
        first_chunk = next(pd.read_csv(input_file, chunksize=5))
        numeric_cols = first_chunk.select_dtypes(include=[np.number]).columns.tolist()

    temp_parquet = output_file + '.tmp.parquet'
    total_rows = 0

    if DASK_AVAILABLE:
        ddf = dd.read_csv(
            input_file,
            blocksize=CHUNK_SIZE * 100,
            usecols=['timestamp'] + numeric_cols,
            dtype={col: 'float32' for col in numeric_cols},
        )
        ddf['timestamp'] = dd.to_datetime(ddf['timestamp'], errors='coerce')
        ddf = ddf.dropna(subset=['timestamp'])
        ddf = ddf.set_index('timestamp', sorted=False, npartitions='auto')

        if global_stats:
            def remove_outliers_partition(df):
                return remove_outliers_chunk(df, numeric_cols, global_stats)
            ddf = ddf.map_partitions(remove_outliers_partition)

        ddf = ddf.resample(target_freq).mean()
        ddf = ddf.interpolate(method='linear', limit=5)
        ddf = ddf.ffill(limit=3)

        ddf.to_parquet(temp_parquet, write_index=True)
        total_rows = len(ddf)

    else:
        from collections import deque
        from datetime import timedelta

        agg_buckets: dict[pd.Timestamp, dict[str, list[float]]] = {}

        for chunk_idx, chunk in enumerate(pd.read_csv(
            input_file,
            chunksize=CHUNK_SIZE,
            usecols=['timestamp'] + numeric_cols,
            dtype={col: 'float32' for col in numeric_cols},
        )):
            if chunk_idx % 10 == 0:
                mem_usage = chunk.memory_usage(deep=True).sum() / 1024 / 1024
                print(f'  Chunk {chunk_idx}: {len(chunk)} 行, 内存 {mem_usage:.1f}MB')

            chunk = clean_timestamps_chunk(chunk)
            if global_stats:
                chunk = remove_outliers_chunk(chunk, numeric_cols, global_stats)

            for _, row in chunk.iterrows():
                ts = pd.Timestamp(row['timestamp']).floor(target_freq)
                if ts not in agg_buckets:
                    agg_buckets[ts] = {col: [] for col in numeric_cols}
                for col in numeric_cols:
                    val = row[col]
                    if pd.notna(val):
                        agg_buckets[ts][col].append(float(val))

        sorted_ts = sorted(agg_buckets.keys())
        df_aligned = pd.DataFrame(index=sorted_ts)

        for col in numeric_cols:
            values = [
                np.mean(agg_buckets[ts][col]) if agg_buckets[ts][col] else np.nan
                for ts in sorted_ts
            ]
            df_aligned[col] = values

        df_aligned = df_aligned.interpolate(method='linear', limit=5)
        df_aligned = df_aligned.ffill(limit=3)
        df_aligned = df_aligned.dropna()

        df_aligned.to_parquet(temp_parquet, index=True)
        total_rows = len(df_aligned)

    print(f'  ✓ 完成: {total_rows} 行, {target_freq} 采样率')
    return total_rows


def compute_sulfur_kinetics_stream(input_parquet: str, output_parquet: str) -> int:
    """流式微积分计算"""
    print(f'\n→ 计算硫含量动力学参数')

    df = pd.read_parquet(input_parquet)
    if 'sulfur_ppm' not in df.columns:
        print('  跳过: 无硫含量数据')
        df.to_parquet(output_parquet)
        return len(df)

    n = len(df)
    dt = 1.0

    sulfur_ppm = df['sulfur_ppm'].values.astype('float32')
    sulfur_rate = np.zeros(n, dtype='float32')
    cumulative = np.zeros(n, dtype='float32')

    for i in range(1, n):
        sulfur_rate[i] = (sulfur_ppm[i] - sulfur_ppm[i-1]) / dt

    cumul = 0.0
    for i in range(n):
        cumul += abs(sulfur_rate[i]) * dt
        cumulative[i] = cumul

    df['sulfur_rate'] = sulfur_rate
    df['cumulative_desulfurization'] = cumulative

    df.to_parquet(output_parquet)
    print(f'  ✓ 完成: {n} 行')
    return n


def generate_particle_coordinates_parquet(
    input_parquet: str,
    output_bin: str,
    lance_x: float = 0.0,
    lance_y: float = 3.5,
    max_particles_per_frame: int = 2000,
) -> int:
    """
    预生成粒子坐标，输出为二进制 Float32Array
    格式: [frame_count, max_particles, particle_stride] +
          每帧 [particle_count, padding, (x, y, concentration, size) * max_particles]
    """
    print(f'\n→ 预生成粒子坐标 (二进制输出)')

    df = pd.read_parquet(input_parquet)
    n_frames = len(df)
    particle_stride = 4

    header = np.array([n_frames, max_particles_per_frame, particle_stride], dtype='int32')

    total_floats = n_frames * (2 + max_particles_per_frame * particle_stride)
    bin_data = np.zeros(total_floats, dtype='float32')

    powder_flow = df.get('powder_flow', df.get('sulfur_ppm', np.zeros(n_frames))).values
    argon_flow = df.get('argon_flow', np.ones(n_frames) * 100).values

    rng = np.random.default_rng(42)

    for frame_idx in range(n_frames):
        pf = powder_flow[frame_idx]
        af = argon_flow[frame_idx]

        frame_offset = frame_idx * (2 + max_particles_per_frame * particle_stride)
        intensity = min(1.0, float(pf) / 9.0) if pf > 0 else 0
        active_count = int(max_particles_per_frame * intensity)

        bin_data[frame_offset] = active_count
        bin_data[frame_offset + 1] = 0

        if active_count > 0:
            spread_x = 1.2 * intensity
            spread_y = 1.5 * intensity

            angles = rng.uniform(-np.pi * 0.4, np.pi * 0.4, active_count)
            distances = rng.uniform(0, 1, active_count) * spread_y
            rand_extra = rng.uniform(0, 1, active_count)

            x = lance_x + np.sin(angles) * distances * spread_x
            y = lance_y - distances

            in_iron = (y < 1.5) & (np.abs(x) < 1.2)
            concentration = np.where(
                in_iron,
                (0.6 + 0.4 * (1 - distances / spread_y)) * intensity,
                0.3 * intensity
            )
            size = (2 + rand_extra * 4) * (0.5 + concentration * 0.5)

            particle_base = frame_offset + 2
            for i in range(active_count):
                idx = particle_base + i * particle_stride
                bin_data[idx] = float(x[i])
                bin_data[idx + 1] = float(max(-2.5, y[i]))
                bin_data[idx + 2] = float(concentration[i])
                bin_data[idx + 3] = float(size[i])

        if frame_idx % 100 == 0:
            print(f'  Frame {frame_idx}/{n_frames}: {active_count} 粒子')

    output_path = Path(output_bin)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_bin, 'wb') as f:
        header.tofile(f)
        bin_data.tofile(f)

    file_size = output_path.stat().st_size / 1024 / 1024
    print(f'  ✓ 完成: {file_size:.1f}MB 二进制文件')
    return n_frames


def process_pipeline_dask(data_dir: str, output_dir: str,
                          use_dask: bool = True,
                          precompute_particles: bool = True):
    print('=' * 70)
    print('  高炉脱硫数据处理流水线 - Dask 流式计算版本')
    print('=' * 70)

    if use_dask and DASK_AVAILABLE:
        client = init_dask_cluster()
    else:
        client = None
        print('⚠ 运行模式: Pandas Chunk 流式 (无 Dask)')

    try:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        csv_files = {
            'temperature': 'temperature_sensors.csv',
            'powder_flow': 'powder_flow_sensors.csv',
            'argon_flow': 'argon_flow_sensors.csv',
            'material_level': 'material_level_sensors.csv',
            'sulfur': 'sulfur_analysis.csv',
        }

        available_files = {}
        for name, filename in csv_files.items():
            filepath = os.path.join(data_dir, filename)
            if os.path.exists(filepath):
                available_files[name] = filepath
                size = os.path.getsize(filepath) / 1024 / 1024
                print(f'\n✓ 发现 {name}: {filename} ({size:.1f}MB)')

        if not available_files:
            print('\n⚠ 未发现CSV文件，使用生成模式')
            return generate_sample_data_stream(output_dir)

        print(f'\n{"="*70}')
        print('Step 1: 增量计算全局统计量 (Welford 算法)')
        print('='*70)
        global_stats = {}
        for name, filepath in available_files.items():
            first_chunk = next(pd.read_csv(filepath, chunksize=5))
            numeric_cols = first_chunk.select_dtypes(include=[np.number]).columns.tolist()
            print(f'\n→ {name}:')
            stats = compute_global_stats_stream(filepath, numeric_cols)
            global_stats.update(stats)

        print(f'\n{"="*70}')
        print('Step 2: 分块清洗 + 重采样对齐')
        print('='*70)
        aligned_parquets = []
        for name, filepath in available_files.items():
            first_chunk = next(pd.read_csv(filepath, chunksize=5))
            numeric_cols = first_chunk.select_dtypes(include=[np.number]).columns.tolist()
            out_parquet = os.path.join(output_dir, f'aligned_{name}.parquet')
            align_and_resample_stream(
                filepath, out_parquet,
                target_freq='1S',
                numeric_cols=numeric_cols,
                global_stats=global_stats,
            )
            aligned_parquets.append(out_parquet)

        print(f'\n{"="*70}')
        print('Step 3: 合并对齐后的数据')
        print('='*70)
        merged = None
        for pq in aligned_parquets:
            df = pd.read_parquet(pq)
            if merged is None:
                merged = df
            else:
                merged = merged.join(df, how='outer', rsuffix='_dup')
                dup_cols = [c for c in merged.columns if c.endswith('_dup')]
                merged = merged.drop(columns=dup_cols)

        merged = merged.interpolate(method='linear', limit=5)
        merged = merged.ffill(limit=3)
        merged = merged.dropna()
        merged = merged.reset_index()

        merged_path = os.path.join(output_dir, 'timeseries_aligned.parquet')
        merged.to_parquet(merged_path, index=False)
        print(f'✓ 合并完成: {len(merged)} 行')

        print(f'\n{"="*70}')
        print('Step 4: 计算硫含量动力学参数')
        print('='*70)
        kinetics_path = os.path.join(output_dir, 'timeseries_kinetics.parquet')
        compute_sulfur_kinetics_stream(merged_path, kinetics_path)

        print(f'\n{"="*70}')
        print('Step 5: 输出 JSON 时间序列')
        print('='*70)
        df_final = pd.read_parquet(kinetics_path)
        records = []
        for idx, row in df_final.iterrows():
            if idx % OUTPUT_CHUNK_SIZE == 0 and idx > 0:
                print(f'  输出 {idx}/{len(df_final)} 行')
            records.append({
                'time': int(idx),
                'timestamp': str(row['timestamp']),
                'sulfur_ppm': float(row.get('sulfur_ppm', 0)),
                'sulfur_rate': float(row.get('sulfur_rate', 0)),
                'cumulative_desulfurization': float(row.get('cumulative_desulfurization', 0)),
                'temperature': float(row.get('temperature', 0)),
                'powder_flow': float(row.get('powder_flow', 0)),
                'argon_flow': float(row.get('argon_flow', 0)),
                'material_level': float(row.get('material_level', 0)),
            })

        json_path = os.path.join(output_dir, 'timeseries.json')
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(records, f, ensure_ascii=False)
        json_size = os.path.getsize(json_path) / 1024 / 1024
        print(f'✓ JSON 输出: {json_size:.1f}MB, {len(records)} 条')

        if precompute_particles:
            print(f'\n{"="*70}')
            print('Step 6: 预生成粒子坐标二进制文件')
            print('='*70)
            bin_path = os.path.join(output_dir, 'particles.bin')
            generate_particle_coordinates_parquet(
                kinetics_path, bin_path,
                max_particles_per_frame=2000,
            )

        print(f'\n{"="*70}')
        print('✓ 流水线完成')
        print(f'  时间序列: {len(df_final)} 行 @ 1Hz')
        print(f'  输出目录: {output_dir}')
        print('='*70)

        for tmp in Path(output_dir).glob('*.tmp.parquet'):
            tmp.unlink()
        for tmp in Path(output_dir).glob('aligned_*.parquet'):
            tmp.unlink()

        return df_final

    finally:
        if client is not None:
            client.close()


def generate_sample_data_stream(output_dir: str):
    print('\n' + '='*70)
    print('  生成模拟数据')
    print('='*70)

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    n_frames = 900
    S0, Sf = 480, 28
    k1, k2 = 0.004, 0.0025

    t = np.arange(n_frames, dtype='float32')
    progress = t / n_frames

    sulfur_ppm = np.where(
        progress < 0.08,
        S0 - (progress / 0.08) * 5,
        np.where(
            progress < 0.55,
            (S0 - 5) * np.exp(-k1 * t * 1.8) + Sf,
            np.where(
                progress < 0.78,
                np.maximum(Sf + 10,
                    (S0 - 5) * np.exp(-k1 * t * 1.8) * np.exp(-k2 * (t - n_frames * 0.55) * 0.5)),
                Sf + 8 * (1 - (progress - 0.78) / 0.22 * 0.6)
            )
        )
    )
    sulfur_ppm = np.maximum(Sf - 5, sulfur_ppm) + np.random.randn(n_frames) * 0.3

    phase1 = np.clip(progress / 0.08, 0, 1)
    phase2 = np.clip((progress - 0.08) / 0.47, 0, 1)
    phase3 = np.clip((progress - 0.55) / 0.23, 0, 1)
    phase4 = np.clip((progress - 0.78) / 0.22, 0, 1)

    powder_flow = np.where(
        progress < 0.08, 0,
        np.where(
            progress < 0.55,
            6.5 + 2.5 * np.sin(phase2 * np.pi),
            np.where(
                progress < 0.78,
                6.5 * (1 - phase3 * 0.7),
                np.maximum(0, 2.0 * (1 - phase4))
            )
        )
    ) + np.random.randn(n_frames) * 0.3

    argon_flow = np.where(
        progress < 0.08,
        15 + phase1 * 85,
        np.where(
            progress < 0.55,
            100 + 30 * np.sin(phase2 * np.pi * 0.7),
            np.where(
                progress < 0.78,
                110 + 20 * np.sin(phase3 * np.pi),
                80 * (1 - phase4 * 0.4)
            )
        )
    ) + np.random.randn(n_frames) * 2

    temperature = 1320 + 40 * np.sin(progress * np.pi * 1.5) - \
                  progress * 25 + np.random.randn(n_frames) * 1.5
    material_level = 85 - progress * 15 + 5 * np.sin(progress * np.pi * 2) + \
                     np.random.randn(n_frames)

    sulfur_rate = np.zeros(n_frames, dtype='float32')
    cumulative = np.zeros(n_frames, dtype='float32')
    for i in range(1, n_frames):
        sulfur_rate[i] = (sulfur_ppm[i] - sulfur_ppm[i-1]) / 1.0
    cumul = 0.0
    for i in range(n_frames):
        cumul += abs(sulfur_rate[i]) * 1.0
        cumulative[i] = cumul

    df = pd.DataFrame({
        'time': np.arange(n_frames, dtype='int32'),
        'sulfur_ppm': np.round(sulfur_ppm, 2).astype('float32'),
        'sulfur_rate': np.round(sulfur_rate, 2).astype('float32'),
        'cumulative_desulfurization': np.round(cumulative, 2).astype('float32'),
        'temperature': np.round(temperature, 1).astype('float32'),
        'powder_flow': np.round(np.maximum(0, powder_flow), 2).astype('float32'),
        'argon_flow': np.round(np.maximum(0, argon_flow), 1).astype('float32'),
        'material_level': np.round(np.clip(material_level, 0, 100), 1).astype('float32'),
    })

    parquet_path = output_path / 'timeseries_kinetics.parquet'
    df.to_parquet(parquet_path, index=False)
    print(f'✓ Parquet 输出: {parquet_path.stat().st_size/1024/1024:.1f}MB')

    records = df.to_dict(orient='records')
    json_path = output_path / 'timeseries.json'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, default=str)
    print(f'✓ JSON 输出: {json_path.stat().st_size/1024/1024:.1f}MB')

    bin_path = output_path / 'particles.bin'
    generate_particle_coordinates_parquet(
        str(parquet_path), str(bin_path),
        max_particles_per_frame=2000,
    )

    print(f'\n✓ 模拟数据生成完成: {n_frames} 帧')
    return df


if __name__ == '__main__':
    data_dir = sys.argv[1] if len(sys.argv) > 1 else './data/csv'
    output_dir = sys.argv[2] if len(sys.argv) > 2 else './public/data'
    use_dask = '--no-dask' not in sys.argv

    process_pipeline_dask(data_dir, output_dir, use_dask=use_dask)
