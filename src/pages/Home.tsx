import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useDesulfurizationStore';
import { generateDesulfurizationData } from '@/data/generateData';
import StatusBar from '@/components/StatusBar';
import FurnaceDeckGL from '@/components/FurnaceDeckGL';
import SulfurCurvePanel from '@/components/SulfurCurvePanel';
import SensorPanel from '@/components/SensorPanel';
import TimeControl from '@/components/TimeControl';
import PerformanceMonitor from '@/components/PerformanceMonitor';

export default function Home() {
  const { data, setData, playbackState, playbackSpeed, incrementIndex, currentIndex } = useStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeParticleCount, setActiveParticleCount] = useState(0);
  const [showPerf, setShowPerf] = useState(true);

  useEffect(() => {
    if (!data) {
      const generated = generateDesulfurizationData();
      setData(generated);
    }
  }, [data, setData]);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (playbackState === 'playing') {
      const interval = Math.max(16, Math.round(1000 / (60 * playbackSpeed)));
      timerRef.current = setInterval(() => {
        incrementIndex();
      }, interval);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [playbackState, playbackSpeed, incrementIndex]);

  useEffect(() => {
    if (!data) return;
    const point = data.timeSeries[currentIndex];
    if (!point) return;
    const intensity = Math.min(1, point.powder_flow / 9);
    setActiveParticleCount(Math.floor(2000 * intensity));
  }, [data, currentIndex]);

  if (!data) {
    return (
      <div className="w-screen h-screen bg-[#0a0e17] flex items-center justify-center">
        <div className="text-cyan-400 font-rajdhani text-lg animate-pulse">
          正在初始化脱硫数据引擎...
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-[#0a0e17] flex flex-col overflow-hidden">
      <StatusBar />

      <div className="flex-1 flex min-h-0 relative">
        <div className="flex-1 min-w-0 relative">
          <FurnaceDeckGL />
          {showPerf && <PerformanceMonitor particleCount={activeParticleCount} />}
          <button
            onClick={() => setShowPerf(!showPerf)}
            className="absolute top-12 left-4 bg-[#0a0e17]/80 backdrop-blur-sm border border-cyan-900/30 rounded px-2 py-1 text-[10px] text-cyan-400/70 hover:text-cyan-300 z-10 font-mono"
          >
            {showPerf ? '隐藏性能' : '显示性能'}
          </button>
        </div>

        <div className="w-[380px] flex flex-col border-l border-cyan-900/20 bg-[#0a0e17]/80">
          <div className="flex-1 min-h-0">
            <SulfurCurvePanel />
          </div>
          <div className="border-t border-cyan-900/20">
            <SensorPanel />
          </div>
        </div>
      </div>

      <TimeControl />
    </div>
  );
}
