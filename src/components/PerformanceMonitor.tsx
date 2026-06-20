import { useEffect, useRef, useState } from 'react';

interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  particleCount: number;
  memory: number;
}

export default function PerformanceMonitor({ particleCount }: { particleCount: number }) {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    frameTime: 0,
    particleCount: 0,
    memory: 0,
  });

  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const animRef = useRef<number>(0);

  useEffect(() => {
    const measure = () => {
      frameCountRef.current++;
      const now = performance.now();
      const elapsed = now - lastTimeRef.current;

      if (elapsed >= 500) {
        const fps = Math.round((frameCountRef.current * 1000) / elapsed);
        const frameTime = elapsed / frameCountRef.current;
        const memory = (performance as any).memory
          ? Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024)
          : 0;

        setMetrics({
          fps,
          frameTime: Math.round(frameTime * 100) / 100,
          particleCount,
          memory,
        });

        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      animRef.current = requestAnimationFrame(measure);
    };

    animRef.current = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(animRef.current);
  }, [particleCount]);

  const fpsColor = metrics.fps >= 55 ? 'text-green-400' : metrics.fps >= 30 ? 'text-yellow-400' : 'text-red-400';
  const ftColor = metrics.frameTime <= 16 ? 'text-green-400' : metrics.frameTime <= 33 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="absolute top-12 right-4 bg-[#0a0e17]/80 backdrop-blur-sm border border-cyan-900/30 rounded-md p-2.5 text-[10px] font-mono min-w-[160px] z-10">
      <div className="text-cyan-400/70 uppercase tracking-wider text-[9px] mb-1.5 font-semibold">性能监控</div>
      <div className="space-y-0.5">
        <div className="flex justify-between items-center">
          <span className="text-gray-500">FPS</span>
          <span className={`font-bold font-rajdhani text-sm ${fpsColor}`}>{metrics.fps}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-500">帧时</span>
          <span className={`font-bold font-rajdhani text-sm ${ftColor}`}>{metrics.frameTime} ms</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-500">粒子</span>
          <span className="font-bold font-rajdhani text-sm text-orange-400">{particleCount}</span>
        </div>
        {metrics.memory > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-gray-500">内存</span>
            <span className="font-bold font-rajdhani text-sm text-cyan-400">{metrics.memory} MB</span>
          </div>
        )}
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-cyan-900/20">
        <div className="w-full h-1 bg-[#111827] rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${fpsColor.replace('text-', 'bg-')}`}
            style={{ width: `${Math.min(100, (metrics.fps / 60) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
