import { useEffect, useRef } from 'react';
import { useStore } from '@/store/useDesulfurizationStore';
import { generateDesulfurizationData } from '@/data/generateData';
import StatusBar from '@/components/StatusBar';
import FurnaceVisualization from '@/components/FurnaceVisualization';
import SulfurCurvePanel from '@/components/SulfurCurvePanel';
import SensorPanel from '@/components/SensorPanel';
import TimeControl from '@/components/TimeControl';

export default function Home() {
  const { data, setData, playbackState, playbackSpeed, incrementIndex } = useStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 relative">
          <FurnaceVisualization />
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
