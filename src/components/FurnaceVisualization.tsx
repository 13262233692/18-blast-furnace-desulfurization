import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/store/useDesulfurizationStore';
import { generateParticles } from '@/data/generateData';
import type { Particle } from '@/data/types';

const FURNACE_OUTLINE = [
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

const FURNACE_INNER = FURNACE_OUTLINE.map(([x, y]) => [x * 0.92, y * 0.92 + 0.05]);

const HOT_METAL_SURFACE = [
  [-1.1, 1.2], [-0.9, 1.35], [-0.5, 1.45], [0.0, 1.5],
  [0.5, 1.45], [0.9, 1.35], [1.1, 1.2],
];

const LANCE_PATH = [[0.0, 6.5], [0.0, 5.5], [0.0, 4.5], [0.0, 3.5], [0.0, 2.0], [0.0, 1.8]];

const GRID_LINES_H = Array.from({ length: 21 }, (_, i) => {
  const y = -5 + i * 0.6;
  return [[-5, y], [5, y]] as [number, number][];
});

const GRID_LINES_V = Array.from({ length: 21 }, (_, i) => {
  const x = -5 + i * 0.5;
  return [[x, -5], [x, 7]] as [number, number][];
});

function concentrationToColor(c: number): string {
  if (c > 0.7) return 'rgba(255,107,53,0.95)';
  if (c > 0.4) return 'rgba(255,165,0,0.85)';
  if (c > 0.2) return 'rgba(255,215,0,0.7)';
  return 'rgba(0,212,255,0.5)';
}

export default function FurnaceVisualization() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const { currentIndex, data } = useStore();

  const drawScene = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!data) return;

    ctx.clearRect(0, 0, width, height);

    const scale = Math.min(width / 12, height / 14);
    const offsetX = width / 2;
    const offsetY = height * 0.55;

    const toScreen = (x: number, y: number): [number, number] => [
      offsetX + x * scale,
      offsetY - y * scale,
    ];

    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(0,212,255,0.04)';
    ctx.lineWidth = 0.5;
    for (const line of GRID_LINES_H) {
      const [x1, y1] = toScreen(line[0][0], line[0][1]);
      const [x2, y2] = toScreen(line[1][0], line[1][1]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    for (const line of GRID_LINES_V) {
      const [x1, y1] = toScreen(line[0][0], line[0][1]);
      const [x2, y2] = toScreen(line[1][0], line[1][1]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    const drawPath = (points: number[][], strokeStyle: string, lineWidth: number, fill?: string) => {
      ctx.beginPath();
      const [sx, sy] = toScreen(points[0][0], points[0][1]);
      ctx.moveTo(sx, sy);
      for (let i = 1; i < points.length; i++) {
        const [px, py] = toScreen(points[i][0], points[i][1]);
        ctx.lineTo(px, py);
      }
      if (fill) {
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    };

    drawPath(FURNACE_OUTLINE, 'rgba(0,212,255,0.35)', 2.5, 'rgba(15,25,45,0.6)');
    drawPath(FURNACE_INNER, 'rgba(0,212,255,0.15)', 1);

    const ironGrad = ctx.createLinearGradient(
      offsetX - 1.5 * scale, offsetY,
      offsetX + 1.5 * scale, offsetY - 2 * scale
    );
    ironGrad.addColorStop(0, 'rgba(180,40,20,0.25)');
    ironGrad.addColorStop(0.5, 'rgba(220,80,30,0.3)');
    ironGrad.addColorStop(1, 'rgba(180,40,20,0.2)');

    ctx.beginPath();
    const ironSurfaceLeft = toScreen(-1.3, 1.3);
    ctx.moveTo(ironSurfaceLeft[0], ironSurfaceLeft[1]);
    for (const p of HOT_METAL_SURFACE) {
      const [px, py] = toScreen(p[0], p[1]);
      ctx.lineTo(px, py);
    }
    const ironBottomRight = toScreen(1.3, -3.5);
    const ironBottomLeft = toScreen(-1.3, -3.5);
    ctx.lineTo(ironBottomRight[0], ironBottomRight[1]);
    ctx.lineTo(ironBottomLeft[0], ironBottomLeft[1]);
    ctx.closePath();
    ctx.fillStyle = ironGrad;
    ctx.fill();

    const point = data.timeSeries[currentIndex];
    if (point) {
      const surfaceGlow = ctx.createRadialGradient(
        offsetX, offsetY - 1.5 * scale, 0,
        offsetX, offsetY - 1.5 * scale, scale * 1.5
      );
      const glowIntensity = Math.min(1, point.temperature / 1360);
      surfaceGlow.addColorStop(0, `rgba(255,100,30,${0.15 * glowIntensity})`);
      surfaceGlow.addColorStop(0.5, `rgba(255,60,10,${0.08 * glowIntensity})`);
      surfaceGlow.addColorStop(1, 'rgba(255,60,10,0)');
      ctx.fillStyle = surfaceGlow;
      ctx.fillRect(0, 0, width, height);
    }

    drawPath(HOT_METAL_SURFACE, 'rgba(255,140,50,0.6)', 1.5);

    const drawLance = () => {
      ctx.beginPath();
      for (let i = 0; i < LANCE_PATH.length; i++) {
        const [px, py] = toScreen(LANCE_PATH[i][0], LANCE_PATH[i][1]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(150,160,180,0.8)';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(200,210,230,0.4)';
      ctx.lineWidth = 6;
      ctx.stroke();

      const tip = toScreen(LANCE_PATH[LANCE_PATH.length - 1][0], LANCE_PATH[LANCE_PATH.length - 1][1]);
      const tipGlow = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], 12);
      tipGlow.addColorStop(0, 'rgba(0,212,255,0.6)');
      tipGlow.addColorStop(1, 'rgba(0,212,255,0)');
      ctx.fillStyle = tipGlow;
      ctx.fillRect(tip[0] - 12, tip[1] - 12, 24, 24);
    };
    drawLance();

    const particles = particlesRef.current;
    for (const p of particles) {
      const [sx, sy] = toScreen(p.x, p.y);
      const color = concentrationToColor(p.concentration);
      const size = p.size * (scale / 80);

      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (p.concentration > 0.5) {
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 3);
        glow.addColorStop(0, color.replace(/[\d.]+\)$/, '0.3)'));
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(sx - size * 3, sy - size * 3, size * 6, size * 6);
      }
    }

    const sensorPositions = data.furnace.sensorPositions;
    for (const sensor of sensorPositions) {
      const [sx, sy] = toScreen(sensor.x, sensor.y);
      const sensorColor = sensor.type === 'temperature' ? '#ff4444' :
        sensor.type === 'flow' ? '#00d4ff' : '#ffd700';

      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fillStyle = sensorColor;
      ctx.fill();

      const sensorGlow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 8);
      sensorGlow.addColorStop(0, sensorColor + '40');
      sensorGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sensorGlow;
      ctx.fillRect(sx - 8, sy - 8, 16, 16);

      ctx.font = '9px monospace';
      ctx.fillStyle = 'rgba(200,210,230,0.6)';
      ctx.fillText(sensor.id, sx + 6, sy - 4);
    }

    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(0,212,255,0.4)';
    const labels = [
      { text: '炉顶', x: 0, y: 6.5 },
      { text: '炉身', x: 2.5, y: 4.0 },
      { text: '炉腰', x: 2.0, y: 2.0 },
      { text: '炉腹', x: 2.0, y: 0.0 },
      { text: '炉缸', x: 2.5, y: -2.5 },
      { text: '铁水', x: -0.3, y: 0.5 },
    ];
    for (const label of labels) {
      const [lx, ly] = toScreen(label.x, label.y);
      ctx.fillText(label.text, lx, ly);
    }
  }, [data, currentIndex]);

  useEffect(() => {
    if (!data) return;
    particlesRef.current = generateParticles(currentIndex, data.timeSeries, data.furnace, 600);
  }, [currentIndex, data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
      ctx.scale(dpr, dpr);
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement!);

    const animate = () => {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx, canvas.width / dpr, canvas.height / dpr);
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      observer.disconnect();
    };
  }, [drawScene]);

  return (
    <div className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute top-3 left-4 text-xs text-cyan-500/60 font-mono">
        高炉纵切面 · 脱硫粉剂浓度分布
      </div>
      <div className="absolute bottom-3 left-4 flex items-center gap-4 text-[10px] font-mono">
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
    </div>
  );
}
