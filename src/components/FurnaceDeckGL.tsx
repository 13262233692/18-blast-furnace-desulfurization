import { useEffect, useRef, useMemo, useCallback } from 'react';
import { useStore } from '@/store/useDesulfurizationStore';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, LineLayer, PolygonLayer } from '@deck.gl/layers';
import { COORDINATE_SYSTEM, OrthographicView } from '@deck.gl/core';
import {
  createParticleBuffer,
  generateParticlesInPlace,
  copyPrecomputedFrame,
  loadPrecomputedParticles,
  concentrationToRGBA,
  type ParticleBuffer,
  type PrecomputedParticleData,
  PARTICLE_STRIDE,
} from '@/data/particleBuffer';
import type { TimeSeriesPoint, FurnaceProfile } from '@/data/types';

const MAX_PARTICLES = 4000;

const FURNACE_OUTLINE: [number, number][] = [
  [-3.0, 6.0], [-2.6, 5.5], [-2.2, 5.0], [-1.9, 4.5], [-1.7, 4.0],
  [-1.55, 3.5], [-1.45, 3.0], [-1.4, 2.5], [-1.38, 2.0], [-1.37, 1.5],
  [-1.37, 1.0], [-1.38, 0.5], [-1.4, 0.0], [-1.45, -0.5], [-1.55, -1.0],
  [-1.7, -1.5], [-1.9, -2.0], [-2.2, -2.5], [-2.6, -3.0], [-3.0, -3.5],
  [-3.5, -3.8], [-4.0, -4.0],
  [4.0, -4.0], [3.5, -3.8], [3.0, -3.5], [2.6, -3.0], [2.2, -2.5],
  [1.9, -2.0], [1.7, -1.5], [1.55, -1.0], [1.45, -0.5], [1.4, 0.0],
  [1.38, 0.5], [1.37, 1.0], [1.37, 1.5], [1.38, 2.0], [1.4, 2.5],
  [1.45, 3.0], [1.55, 3.5], [1.7, 4.0], [1.9, 4.5], [2.2, 5.0],
  [2.6, 5.5], [3.0, 6.0],
];

const FURNACE_INNER = FURNACE_OUTLINE.map(([x, y]) => [x * 0.92, y * 0.92 + 0.05] as [number, number]);

const HOT_METAL_SURFACE: [number, number][] = [
  [-1.3, 1.3], [-1.1, 1.2], [-0.9, 1.35], [-0.5, 1.45], [0.0, 1.5],
  [0.5, 1.45], [0.9, 1.35], [1.1, 1.2], [1.3, 1.3],
];

const IRON_BODY: [number, number][] = [
  [-1.3, 1.3], [-1.1, 1.2], [-0.9, 1.35], [-0.5, 1.45], [0.0, 1.5],
  [0.5, 1.45], [0.9, 1.35], [1.1, 1.2], [1.3, 1.3],
  [1.3, -3.5], [-1.3, -3.5],
];

const LANCE_PATH: [number, number][] = [
  [0.0, 6.5], [0.0, 5.5], [0.0, 4.5], [0.0, 3.5], [0.0, 2.0], [0.0, 1.8],
];

interface ParticleLayerDatum {
  [key: string]: unknown;
}

export default function FurnaceDeckGL() {
  const { currentIndex, data } = useStore();
  const deckRef = useRef<any>(null);
  const particleBufferRef = useRef<ParticleBuffer | null>(null);
  const precomputedRef = useRef<PrecomputedParticleData | null>(null);
  const particleDataRef = useRef<ParticleLayerDatum[] | null>(null);
  const attributesRef = useRef<Record<string, { value: Float32Array | Uint8Array; size: number }> | null>(null);
  const layerUpdateCounterRef = useRef(0);

  const currentPoint = data?.timeSeries[currentIndex];
  const furnace = data?.furnace;

  const initialViewState = useMemo(() => ({
    main: {
      target: [0, 1, 0],
      zoom: 3.5,
      minZoom: 2,
      maxZoom: 8,
    },
  }), []);

  const views = useMemo(() => [
    new OrthographicView({
      id: 'main',
      controller: true,
    }),
  ], []);

  useEffect(() => {
    particleBufferRef.current = createParticleBuffer(MAX_PARTICLES);
    particleDataRef.current = Array(MAX_PARTICLES).fill(null).map(() => ({}));

    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Uint8Array(MAX_PARTICLES * 4);
    const sizes = new Float32Array(MAX_PARTICLES);

    attributesRef.current = {
      getPosition: { value: positions, size: 3 },
      getColor: { value: colors, size: 4 },
      getRadius: { value: sizes, size: 1 },
    };

    (async () => {
      const precomputed = await loadPrecomputedParticles('/data/particles.bin');
      if (precomputed) {
        precomputedRef.current = precomputed;
        console.log(`✓ 预计算粒子数据已加载: ${precomputed.frameCount} 帧, 每帧最多 ${precomputed.maxParticlesPerFrame} 粒子`);
      }
    })();

    return () => {
      particleBufferRef.current = null;
      particleDataRef.current = null;
      attributesRef.current = null;
      precomputedRef.current = null;
    };
  }, []);

  const updateParticleAttributes = useCallback((point: TimeSeriesPoint, furnaceProfile: FurnaceProfile, lod: number = 0) => {
    const buffer = particleBufferRef.current;
    const attrs = attributesRef.current;
    if (!buffer || !attrs) return;

    const precomputed = precomputedRef.current;
    if (precomputed) {
      copyPrecomputedFrame(precomputed, currentIndex, buffer, lod);
    } else {
      generateParticlesInPlace(
        currentIndex,
        point.powder_flow,
        point.argon_flow,
        furnaceProfile.lancePosition[0],
        furnaceProfile.lancePosition[1],
        buffer,
        MAX_PARTICLES,
        lod
      );
    }

    const positions = attrs.getPosition.value as Float32Array;
    const colors = attrs.getColor.value as Uint8Array;
    const sizes = attrs.getRadius.value as Float32Array;
    const srcView = buffer.float32View;
    const activeCount = buffer.activeCount;

    for (let i = 0; i < activeCount; i++) {
      const srcIdx = i * PARTICLE_STRIDE;
      const posIdx = i * 3;
      const colIdx = i * 4;

      positions[posIdx] = srcView[srcIdx];
      positions[posIdx + 1] = srcView[srcIdx + 1];
      positions[posIdx + 2] = 0;

      const concentration = srcView[srcIdx + 2];
      const [r, g, b, a] = concentrationToRGBA(concentration);
      colors[colIdx] = Math.floor(r * 255);
      colors[colIdx + 1] = Math.floor(g * 255);
      colors[colIdx + 2] = Math.floor(b * 255);
      colors[colIdx + 3] = Math.floor(a * 255);

      sizes[i] = srcView[srcIdx + 3] * 15;
    }

    for (let i = activeCount; i < MAX_PARTICLES; i++) {
      const posIdx = i * 3;
      const colIdx = i * 4;
      positions[posIdx + 2] = -10000;
      colors[colIdx + 3] = 0;
      sizes[i] = 0;
    }

    layerUpdateCounterRef.current++;
  }, [currentIndex]);

  useEffect(() => {
    if (currentPoint && furnace && attributesRef.current) {
      updateParticleAttributes(currentPoint, furnace, 0);
    }
  }, [currentIndex, currentPoint, furnace, updateParticleAttributes]);

  const layers = useMemo(() => {
    const result: any[] = [];

    result.push(new PolygonLayer({
      id: 'furnace-outline',
      data: [{ polygon: FURNACE_OUTLINE }],
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      filled: true,
      getFillColor: [15, 25, 45, 160],
      stroked: true,
      getLineColor: [0, 212, 255, 90],
      getLineWidth: 2.5,
      lineWidthUnits: 'pixels',
      updateTriggers: {},
    }));

    result.push(new LineLayer({
      id: 'furnace-inner',
      data: FURNACE_INNER.map((p, i) => ({
        sourcePosition: [p[0], p[1], 0],
        targetPosition: [FURNACE_INNER[(i + 1) % FURNACE_INNER.length][0], FURNACE_INNER[(i + 1) % FURNACE_INNER.length][1], 0],
      })),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getColor: [0, 212, 255, 40],
      getWidth: 1,
      widthUnits: 'pixels',
    }));

    result.push(new PolygonLayer({
      id: 'iron-body',
      data: [{ polygon: IRON_BODY }],
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      filled: true,
      getFillColor: [180, 40, 20, 50],
      stroked: false,
    }));

    result.push(new LineLayer({
      id: 'iron-surface',
      data: HOT_METAL_SURFACE.map((p, i) => ({
        sourcePosition: [p[0], p[1], 0],
        targetPosition: [HOT_METAL_SURFACE[(i + 1) % HOT_METAL_SURFACE.length][0], HOT_METAL_SURFACE[(i + 1) % HOT_METAL_SURFACE.length][1], 0],
      })),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getColor: [255, 140, 50, 150],
      getWidth: 1.5,
      widthUnits: 'pixels',
    }));

    result.push(new LineLayer({
      id: 'lance',
      data: LANCE_PATH.map((p, i) => i < LANCE_PATH.length - 1 ? {
        sourcePosition: [p[0], p[1], 0],
        targetPosition: [LANCE_PATH[i + 1][0], LANCE_PATH[i + 1][1], 0],
      } : null).filter(Boolean) as any[],
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getColor: [150, 160, 180, 200],
      getWidth: 4,
      widthUnits: 'pixels',
    }));

    if (furnace?.sensorPositions) {
      result.push(new ScatterplotLayer({
        id: 'sensors',
        data: furnace.sensorPositions.map(s => ({
          position: [s.x, s.y, 0],
          color: s.type === 'temperature' ? [255, 68, 68, 200] :
                 s.type === 'flow' ? [0, 212, 255, 200] : [255, 215, 0, 200],
          label: s.id,
        })),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPosition: (d: any) => d.position,
        getFillColor: (d: any) => d.color,
        getRadius: 5,
        radiusUnits: 'pixels',
      }));
    }

    if (attributesRef.current && particleDataRef.current) {
      result.push(new ScatterplotLayer({
        id: 'desulfurization-particles',
        data: particleDataRef.current,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        pickable: false,
        opacity: 1,
        radiusScale: 1,
        radiusMinPixels: 0.5,
        radiusMaxPixels: 8,
        updateTriggers: {
          getPosition: layerUpdateCounterRef.current,
          getColor: layerUpdateCounterRef.current,
          getRadius: layerUpdateCounterRef.current,
        },
        attributes: attributesRef.current,
        parameters: {
          depthTest: false,
          blend: true,
          blendFunc: [770, 1],
        },
        transitions: {
          getPosition: 0,
          getColor: 0,
          getRadius: 0,
        },
      }));
    }

    return result;
  }, [furnace]);

  return (
    <div className="w-full h-full relative">
      <DeckGL
        ref={(deck) => { deckRef.current = deck; }}
        views={views}
        initialViewState={initialViewState as any}
        layers={layers}
        controller={{ dragPan: true, dragRotate: false, scrollZoom: true, doubleClickZoom: true }}
        style={{ background: '#060a12' }}
      >
        <div className="absolute top-3 left-4 text-xs text-cyan-500/60 font-mono pointer-events-none">
          高炉纵切面 · 脱硫粉剂浓度分布 · Deck.gl WebGL 引擎
        </div>

        {currentPoint && (
          <div className="absolute top-3 right-4 text-right text-[10px] font-mono pointer-events-none">
            <div className="text-gray-500">帧 <span className="text-cyan-400 font-rajdhani">{currentIndex}</span></div>
            <div className="text-gray-500">粒子 <span className="text-orange-400 font-rajdhani">{particleBufferRef.current?.activeCount || 0}</span></div>
            <div className="text-gray-500">喷粉 <span className="text-yellow-400 font-rajdhani">{currentPoint.powder_flow.toFixed(1)} kg/min</span></div>
          </div>
        )}

        <div className="absolute bottom-3 left-4 flex items-center gap-4 text-[10px] font-mono pointer-events-none">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#ff6b35]" /> 高浓度
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#ffa500]" /> 中浓度
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#ffd700]" /> 低浓度
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#00d4ff]" /> 扩散区
          </span>
        </div>

        <FurnaceLabels />
      </DeckGL>
    </div>
  );
}

function FurnaceLabels() {
  const labels = useMemo(() => [
    { text: '炉顶', x: 0, y: 6.5 },
    { text: '炉身', x: 2.5, y: 4.0 },
    { text: '炉腰', x: 2.0, y: 2.0 },
    { text: '炉腹', x: 2.0, y: 0.0 },
    { text: '炉缸', x: 2.5, y: -2.5 },
    { text: '铁水', x: -0.3, y: 0.5 },
  ], []);

  return (
    <div className="absolute inset-0 pointer-events-none text-[11px] font-mono text-cyan-500/40">
      <svg className="w-full h-full" viewBox="-5 -7 10 14" preserveAspectRatio="xMidYMid meet">
        {labels.map((l, i) => (
          <text key={i} x={l.x} y={-l.y} textAnchor="middle" fill="rgba(0,212,255,0.4)" fontSize="0.25">
            {l.text}
          </text>
        ))}
      </svg>
    </div>
  );
}
