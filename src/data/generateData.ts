import type { DesulfurizationData, TimeSeriesPoint, Particle, FurnaceProfile } from './types';

function createFurnaceProfile(): FurnaceProfile {
  const outline: [number, number][] = [
    [-3.0, 6.0],
    [-2.6, 5.5],
    [-2.2, 5.0],
    [-1.9, 4.5],
    [-1.7, 4.0],
    [-1.55, 3.5],
    [-1.45, 3.0],
    [-1.4, 2.5],
    [-1.38, 2.0],
    [-1.37, 1.5],
    [-1.37, 1.0],
    [-1.38, 0.5],
    [-1.4, 0.0],
    [-1.45, -0.5],
    [-1.55, -1.0],
    [-1.7, -1.5],
    [-1.9, -2.0],
    [-2.2, -2.5],
    [-2.6, -3.0],
    [-3.0, -3.5],
    [-3.5, -3.8],
    [-4.0, -4.0],
    [4.0, -4.0],
    [3.5, -3.8],
    [3.0, -3.5],
    [2.6, -3.0],
    [2.2, -2.5],
    [1.9, -2.0],
    [1.7, -1.5],
    [1.55, -1.0],
    [1.45, -0.5],
    [1.4, 0.0],
    [1.38, 0.5],
    [1.37, 1.0],
    [1.37, 1.5],
    [1.38, 2.0],
    [1.4, 2.5],
    [1.45, 3.0],
    [1.55, 3.5],
    [1.7, 4.0],
    [1.9, 4.5],
    [2.2, 5.0],
    [2.6, 5.5],
    [3.0, 6.0],
  ];

  const innerWall: [number, number][] = outline.map(([x, y]) => [
    x * 0.92,
    y * 0.92 + 0.05,
  ]);

  const hotMetalSurface: [number, number][] = [
    [-1.1, 1.2],
    [-0.9, 1.35],
    [-0.5, 1.45],
    [0.0, 1.5],
    [0.5, 1.45],
    [0.9, 1.35],
    [1.1, 1.2],
  ];

  const lancePosition: [number, number] = [0.0, 3.5];
  const lancePath: [number, number][] = [
    [0.0, 6.5],
    [0.0, 5.5],
    [0.0, 4.5],
    [0.0, 3.5],
    [0.0, 2.5],
    [0.0, 1.8],
  ];

  const sensorPositions = [
    { id: 'T-001', x: -1.0, y: 1.0, type: 'temperature' as const },
    { id: 'T-002', x: 0.8, y: 0.5, type: 'temperature' as const },
    { id: 'T-003', x: -0.5, y: -0.5, type: 'temperature' as const },
    { id: 'F-001', x: 0.0, y: 2.0, type: 'flow' as const },
    { id: 'F-002', x: 0.3, y: 1.5, type: 'flow' as const },
    { id: 'L-001', x: -1.2, y: 1.3, type: 'level' as const },
  ];

  return { outline, innerWall, lancePosition, lancePath, hotMetalSurface, sensorPositions };
}

function generateTimeSeries(frameCount: number): TimeSeriesPoint[] {
  const data: TimeSeriesPoint[] = [];
  const S0 = 480;
  const Sf = 28;
  const k1 = 0.004;
  const k2 = 0.0025;

  for (let i = 0; i < frameCount; i++) {
    const t = i;
    const progress = t / frameCount;

    let sulfur_ppm: number;
    let powder_flow: number;
    let argon_flow: number;

    if (progress < 0.08) {
      const phase = progress / 0.08;
      sulfur_ppm = S0 - phase * 5;
      powder_flow = 0;
      argon_flow = 15 + phase * 85;
    } else if (progress < 0.55) {
      const phase = (progress - 0.08) / 0.47;
      sulfur_ppm = (S0 - 5) * Math.exp(-k1 * t * 1.8) + Sf;
      powder_flow = 6.5 + 2.5 * Math.sin(phase * Math.PI) + (Math.random() - 0.5) * 0.8;
      argon_flow = 100 + 30 * Math.sin(phase * Math.PI * 0.7) + (Math.random() - 0.5) * 5;
    } else if (progress < 0.78) {
      const phase = (progress - 0.55) / 0.23;
      sulfur_ppm = Math.max(Sf + 10, (S0 - 5) * Math.exp(-k1 * t * 1.8) * Math.exp(-k2 * (t - frameCount * 0.55) * 0.5));
      powder_flow = 6.5 * (1 - phase * 0.7) + (Math.random() - 0.5) * 0.5;
      argon_flow = 110 + 20 * Math.sin(phase * Math.PI) + (Math.random() - 0.5) * 3;
    } else {
      const phase = (progress - 0.78) / 0.22;
      sulfur_ppm = Sf + 8 * (1 - phase * 0.6) + (Math.random() - 0.5) * 2;
      powder_flow = Math.max(0, 2.0 * (1 - phase));
      argon_flow = 80 * (1 - phase * 0.4) + (Math.random() - 0.5) * 3;
    }

    sulfur_ppm = Math.max(Sf - 5, sulfur_ppm);

    const temperature = 1320 + 40 * Math.sin(progress * Math.PI * 1.5) - progress * 25 + (Math.random() - 0.5) * 3;
    const material_level = 85 - progress * 15 + 5 * Math.sin(progress * Math.PI * 2) + (Math.random() - 0.5) * 2;

    data.push({
      time: t,
      sulfur_ppm: Math.round(sulfur_ppm * 100) / 100,
      sulfur_rate: 0,
      temperature: Math.round(temperature * 10) / 10,
      powder_flow: Math.round(Math.max(0, powder_flow) * 100) / 100,
      argon_flow: Math.round(Math.max(0, argon_flow) * 10) / 10,
      material_level: Math.round(Math.max(0, Math.min(100, material_level)) * 10) / 10,
    });
  }

  for (let i = 1; i < data.length; i++) {
    const dt = data[i].time - data[i - 1].time;
    if (dt > 0) {
      data[i].sulfur_rate = Math.round(((data[i].sulfur_ppm - data[i - 1].sulfur_ppm) / dt) * 100) / 100;
    }
  }

  return data;
}

export function generateParticles(
  timeIndex: number,
  timeSeries: TimeSeriesPoint[],
  furnace: FurnaceProfile,
  particleCount: number = 600
): Particle[] {
  const point = timeSeries[timeIndex];
  if (!point || point.powder_flow <= 0.1) return [];

  const particles: Particle[] = [];
  const intensity = Math.min(1, point.powder_flow / 9);
  const activeCount = Math.floor(particleCount * intensity);

  const [lx, ly] = furnace.lancePosition;
  const spreadX = 1.2 * intensity;
  const spreadY = 1.5 * intensity;

  for (let i = 0; i < activeCount; i++) {
    const seed = i * 7.31 + timeIndex * 0.17;
    const rand1 = Math.abs(Math.sin(seed)) ;
    const rand2 = Math.abs(Math.sin(seed * 1.73 + 0.5));
    const rand3 = Math.abs(Math.sin(seed * 2.37 + 1.2));
    const rand4 = Math.abs(Math.sin(seed * 3.14 + 2.1));

    const angle = (rand1 - 0.5) * Math.PI * 0.8;
    const dist = rand2 * spreadY * (0.3 + 0.7 * rand3);

    const x = lx + Math.sin(angle) * dist * spreadX;
    const y = ly - dist + Math.sin(timeIndex * 0.05 + i * 0.3) * 0.1;

    const isInIron = y < 1.5 && Math.abs(x) < 1.2;
    const concentration = isInIron ? (0.6 + 0.4 * (1 - dist / spreadY)) * intensity : 0.3 * intensity;

    particles.push({
      x,
      y: Math.max(-2.5, y),
      concentration: Math.round(concentration * 100) / 100,
      velocity: Math.round((0.5 + rand4 * 2.0) * intensity * 100) / 100,
      age: rand3,
      size: (2 + rand4 * 4) * (0.5 + concentration * 0.5),
    });
  }

  return particles;
}

export function generateDesulfurizationData(): DesulfurizationData {
  const frameCount = 900;
  const furnace = createFurnaceProfile();
  const timeSeries = generateTimeSeries(frameCount);

  return {
    timeSeries,
    totalDuration: frameCount,
    frameCount,
    furnace,
  };
}
