export const PARTICLE_STRIDE = 4;

export interface ParticleBuffer {
  float32View: Float32Array;
  uint32View: Uint32Array;
  byteView: Uint8Array;
  buffer: ArrayBuffer;
  maxParticles: number;
  activeCount: number;
  frameHeaderStride: number;
}

export interface PrecomputedParticleData {
  frameCount: number;
  maxParticlesPerFrame: number;
  stride: number;
  frameHeaderStride: number;
  float32View: Float32Array;
  int32View: Int32Array;
}

export function createParticleBuffer(maxParticles: number): ParticleBuffer {
  const totalFloats = maxParticles * PARTICLE_STRIDE;
  const buffer = new ArrayBuffer(totalFloats * 4);
  return {
    buffer,
    float32View: new Float32Array(buffer),
    uint32View: new Uint32Array(buffer),
    byteView: new Uint8Array(buffer),
    maxParticles,
    activeCount: 0,
    frameHeaderStride: 2,
  };
}

export function generateParticlesInPlace(
  timeIndex: number,
  powderFlow: number,
  argonFlow: number,
  lanceX: number,
  lanceY: number,
  outBuffer: ParticleBuffer,
  maxParticles: number = 2000,
  lodLevel: number = 0
): void {
  const intensity = Math.min(1.0, powderFlow / 9.0);
  const lodFactor = Math.max(0.25, 1.0 - lodLevel * 0.25);
  const activeCount = Math.floor(maxParticles * intensity * lodFactor);

  outBuffer.activeCount = activeCount;

  if (activeCount === 0) {
    return;
  }

  const view = outBuffer.float32View;
  const spreadX = 1.2 * intensity;
  const spreadY = 1.5 * intensity;

  const seedBase = timeIndex * 0.17;

  for (let i = 0; i < activeCount; i++) {
    const idx = i * PARTICLE_STRIDE;

    const seed1 = i * 7.31 + seedBase;
    const seed2 = seed1 * 1.73 + 0.5;
    const seed3 = seed1 * 2.37 + 1.2;
    const seed4 = seed1 * 3.14 + 2.1;

    const rand1 = Math.abs(Math.sin(seed1));
    const rand2 = Math.abs(Math.sin(seed2));
    const rand3 = Math.abs(Math.sin(seed3));
    const rand4 = Math.abs(Math.sin(seed4));

    const angle = (rand1 - 0.5) * Math.PI * 0.8;
    const dist = rand2 * spreadY * (0.3 + 0.7 * rand3);

    const x = lanceX + Math.sin(angle) * dist * spreadX;
    const y = lanceY - dist + Math.sin(timeIndex * 0.05 + i * 0.3) * 0.1;
    const yClamped = Math.max(-2.5, y);

    const isInIron = y < 1.5 && Math.abs(x) < 1.2;
    const concentration = isInIron
      ? (0.6 + 0.4 * (1 - dist / spreadY)) * intensity
      : 0.3 * intensity;

    const size = (2 + rand4 * 4) * (0.5 + concentration * 0.5);

    view[idx] = x;
    view[idx + 1] = yClamped;
    view[idx + 2] = concentration;
    view[idx + 3] = size;
  }
}

export async function loadPrecomputedParticles(url: string): Promise<PrecomputedParticleData | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();

    const headerView = new Int32Array(arrayBuffer, 0, 3);
    const frameCount = headerView[0];
    const maxParticlesPerFrame = headerView[1];
    const stride = headerView[2];

    const dataOffset = 12;
    const dataBytes = arrayBuffer.slice(dataOffset);
    const float32View = new Float32Array(dataBytes);
    const int32View = new Int32Array(dataBytes);

    const frameHeaderStride = 2 + maxParticlesPerFrame * stride;

    return {
      frameCount,
      maxParticlesPerFrame,
      stride,
      frameHeaderStride,
      float32View,
      int32View,
    };
  } catch (e) {
    console.warn('加载预计算粒子失败，将使用实时计算:', e);
    return null;
  }
}

export function copyPrecomputedFrame(
  precomputed: PrecomputedParticleData,
  frameIndex: number,
  outBuffer: ParticleBuffer,
  lodLevel: number = 0
): void {
  if (frameIndex < 0 || frameIndex >= precomputed.frameCount) {
    outBuffer.activeCount = 0;
    return;
  }

  const frameOffset = frameIndex * precomputed.frameHeaderStride;
  let activeCount = precomputed.int32View[frameOffset];

  const lodFactor = Math.max(0.25, 1.0 - lodLevel * 0.25);
  activeCount = Math.floor(activeCount * lodFactor);

  outBuffer.activeCount = activeCount;

  if (activeCount === 0) {
    return;
  }

  const srcOffset = frameOffset + 2;
  const dstView = outBuffer.float32View;
  const srcView = precomputed.float32View;

  for (let i = 0; i < activeCount; i++) {
    const srcIdx = srcOffset + i * precomputed.stride;
    const dstIdx = i * PARTICLE_STRIDE;
    dstView[dstIdx] = srcView[srcIdx];
    dstView[dstIdx + 1] = srcView[srcIdx + 1];
    dstView[dstIdx + 2] = srcView[srcIdx + 2];
    dstView[dstIdx + 3] = srcView[srcIdx + 3];
  }
}

export function concentrationToRGBA(concentration: number): [number, number, number, number] {
  if (concentration > 0.7) {
    return [255 / 255, 107 / 255, 53 / 255, 0.95];
  }
  if (concentration > 0.4) {
    return [255 / 255, 165 / 255, 0 / 255, 0.85];
  }
  if (concentration > 0.2) {
    return [255 / 255, 215 / 255, 0 / 255, 0.7];
  }
  return [0 / 255, 212 / 255, 255 / 255, 0.5];
}
