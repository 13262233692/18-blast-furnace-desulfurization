export interface TimeSeriesPoint {
  time: number;
  sulfur_ppm: number;
  sulfur_rate: number;
  temperature: number;
  powder_flow: number;
  argon_flow: number;
  material_level: number;
}

export interface Particle {
  x: number;
  y: number;
  concentration: number;
  velocity: number;
  age: number;
  size: number;
}

export interface FurnaceProfile {
  outline: [number, number][];
  innerWall: [number, number][];
  lancePosition: [number, number];
  lancePath: [number, number][];
  hotMetalSurface: [number, number][];
  sensorPositions: {
    id: string;
    x: number;
    y: number;
    type: 'temperature' | 'flow' | 'level';
  }[];
}

export interface DesulfurizationData {
  timeSeries: TimeSeriesPoint[];
  totalDuration: number;
  frameCount: number;
  furnace: FurnaceProfile;
}

export type PlaybackState = 'playing' | 'paused';

export interface AppState {
  currentIndex: number;
  playbackState: PlaybackState;
  playbackSpeed: number;
  data: DesulfurizationData | null;
  setCurrentIndex: (index: number) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setPlaybackSpeed: (speed: number) => void;
  setData: (data: DesulfurizationData) => void;
  incrementIndex: () => void;
}
