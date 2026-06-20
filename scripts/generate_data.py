"""
高炉铁水脱硫数据预处理脚本
使用 Pandas + NumPy 处理现场传感器CSV数据
清洗时间戳、对齐采样率、计算微积分、输出前端JSON
"""

import pandas as pd
import numpy as np
import json
import os
from pathlib import Path


def clean_timestamps(df: pd.DataFrame, ts_col: str = 'timestamp') -> pd.DataFrame:
    df[ts_col] = pd.to_datetime(df[ts_col], errors='coerce')
    df = df.dropna(subset=[ts_col])
    df = df.sort_values(ts_col).reset_index(drop=True)
    return df


def remove_outliers(df: pd.DataFrame, columns: list[str], n_std: float = 4.0) -> pd.DataFrame:
    for col in columns:
        if col in df.columns:
            mean = df[col].mean()
            std = df[col].std()
            lower = mean - n_std * std
            upper = mean + n_std * std
            df.loc[(df[col] < lower) | (df[col] > upper), col] = np.nan
    return df


def align_sampling_rates(dfs: dict[str, pd.DataFrame], target_freq: str = '1S') -> pd.DataFrame:
    resampled = {}
    for name, df in dfs.items():
        df = df.set_index('timestamp')
        df_resampled = df.resample(target_freq).mean()
        df_resampled = df_resampled.interpolate(method='linear', limit=5)
        df_resampled = df_resampled.fillna(method='ffill', limit=3)
        resampled[name] = df_resampled

    aligned = pd.concat(resampled.values(), axis=1)
    aligned = aligned.interpolate(method='linear', limit=5)
    aligned = aligned.fillna(method='ffill', limit=3)
    aligned = aligned.dropna()
    aligned = aligned.reset_index()
    return aligned


def compute_sulfur_kinetics(sulfur_ppm: np.ndarray, dt: float = 1.0) -> tuple[np.ndarray, np.ndarray]:
    sulfur_rate = np.gradient(sulfur_ppm, dt)
    cumulative_desulfurization = np.cumsum(np.abs(sulfur_rate) * dt)
    return sulfur_rate, cumulative_desulfurization


def generate_particle_coordinates(
    lance_x: float, lance_y: float,
    powder_flow: float, argon_flow: float,
    n_particles: int = 600,
    seed: int = 42
) -> list[dict]:
    if powder_flow < 0.1:
        return []

    rng = np.random.default_rng(seed)
    intensity = min(1.0, powder_flow / 9.0)
    active_count = int(n_particles * intensity)

    spread_x = 1.2 * intensity
    spread_y = 1.5 * intensity

    angles = rng.uniform(-np.pi * 0.4, np.pi * 0.4, active_count)
    distances = rng.uniform(0, 1, active_count) * spread_y

    x = lance_x + np.sin(angles) * distances * spread_x
    y = lance_y - distances

    concentrations = np.where(
        (y < 1.5) & (np.abs(x) < 1.2),
        (0.6 + 0.4 * (1 - distances / spread_y)) * intensity,
        0.3 * intensity
    )

    particles = []
    for i in range(active_count):
        particles.append({
            'x': round(float(x[i]), 4),
            'y': round(float(max(-2.5, y[i])), 4),
            'concentration': round(float(concentrations[i]), 4),
            'velocity': round(float(rng.uniform(0.5, 2.5) * intensity), 4),
        })

    return particles


def process_pipeline(data_dir: str, output_dir: str):
    print("Step 1: Reading CSV files...")
    dfs = {}
    csv_files = {
        'temperature': 'temperature_sensors.csv',
        'powder_flow': 'powder_flow_sensors.csv',
        'argon_flow': 'argon_flow_sensors.csv',
        'material_level': 'material_level_sensors.csv',
        'sulfur': 'sulfur_analysis.csv',
    }

    for name, filename in csv_files.items():
        filepath = os.path.join(data_dir, filename)
        if os.path.exists(filepath):
            chunks = []
            for chunk in pd.read_csv(filepath, chunksize=100000):
                chunk = clean_timestamps(chunk)
                chunks.append(chunk)
            dfs[name] = pd.concat(chunks, ignore_index=True)
            print(f"  Loaded {name}: {len(dfs[name])} records")

    if not dfs:
        print("No CSV files found. Generating sample data instead.")
        return generate_sample_data(output_dir)

    print("Step 2: Removing outliers...")
    for name, df in dfs.items():
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        dfs[name] = remove_outliers(df, numeric_cols)

    print("Step 3: Aligning sampling rates to 1Hz...")
    aligned = align_sampling_rates(dfs, target_freq='1S')

    print("Step 4: Computing sulfur kinetics...")
    if 'sulfur_ppm' in aligned.columns:
        sulfur_rate, cumul = compute_sulfur_kinetics(aligned['sulfur_ppm'].values)
        aligned['sulfur_rate'] = sulfur_rate
        aligned['cumulative_desulfurization'] = cumul

    print("Step 5: Generating output JSON...")
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    records = aligned.to_dict(orient='records')
    with open(output_path / 'timeseries.json', 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False)

    print(f"Done. Output {len(records)} records to {output_path / 'timeseries.json'}")
    return aligned


def generate_sample_data(output_dir: str):
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    n_frames = 900
    S0, Sf = 480, 28
    k1, k2 = 0.004, 0.0025

    timestamps = pd.date_range('2024-06-18 08:00:00', periods=n_frames, freq='1S')

    sulfur_ppm = np.zeros(n_frames)
    powder_flow = np.zeros(n_frames)
    argon_flow = np.zeros(n_frames)

    for i in range(n_frames):
        progress = i / n_frames
        if progress < 0.08:
            phase = progress / 0.08
            sulfur_ppm[i] = S0 - phase * 5
            powder_flow[i] = 0
            argon_flow[i] = 15 + phase * 85
        elif progress < 0.55:
            sulfur_ppm[i] = (S0 - 5) * np.exp(-k1 * i * 1.8) + Sf
            phase = (progress - 0.08) / 0.47
            powder_flow[i] = 6.5 + 2.5 * np.sin(phase * np.pi)
            argon_flow[i] = 100 + 30 * np.sin(phase * np.pi * 0.7)
        elif progress < 0.78:
            sulfur_ppm[i] = max(Sf + 10,
                (S0 - 5) * np.exp(-k1 * i * 1.8) * np.exp(-k2 * (i - n_frames * 0.55) * 0.5))
            phase = (progress - 0.55) / 0.23
            powder_flow[i] = 6.5 * (1 - phase * 0.7)
            argon_flow[i] = 110 + 20 * np.sin(phase * np.pi)
        else:
            phase = (progress - 0.78) / 0.22
            sulfur_ppm[i] = Sf + 8 * (1 - phase * 0.6)
            powder_flow[i] = max(0, 2.0 * (1 - phase))
            argon_flow[i] = 80 * (1 - phase * 0.4)

    sulfur_rate, cumul = compute_sulfur_kinetics(sulfur_ppm)
    temperature = 1320 + 40 * np.sin(np.linspace(0, np.pi * 1.5, n_frames)) - \
                  np.linspace(0, 25, n_frames)
    material_level = 85 - np.linspace(0, 15, n_frames) + \
                     5 * np.sin(np.linspace(0, np.pi * 2, n_frames))

    df = pd.DataFrame({
        'timestamp': timestamps,
        'sulfur_ppm': np.round(sulfur_ppm, 2),
        'sulfur_rate': np.round(sulfur_rate, 2),
        'cumulative_desulfurization': np.round(cumul, 2),
        'temperature': np.round(temperature, 1),
        'powder_flow': np.round(np.maximum(0, powder_flow), 2),
        'argon_flow': np.round(np.maximum(0, argon_flow), 1),
        'material_level': np.round(np.clip(material_level, 0, 100), 1),
    })

    records = df.to_dict(orient='records')
    with open(output_path / 'sample_timeseries.json', 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, default=str)

    print(f"Sample data generated: {len(records)} records")
    return df


if __name__ == '__main__':
    import sys
    data_dir = sys.argv[1] if len(sys.argv) > 1 else './data/csv'
    output_dir = sys.argv[2] if len(sys.argv) > 2 else './public/data'
    process_pipeline(data_dir, output_dir)
