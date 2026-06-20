import { useStore } from '@/store/useDesulfurizationStore';
import { Thermometer, Wind, Gauge, Activity, Flame, Clock } from 'lucide-react';

export default function StatusBar() {
  const { currentIndex, data } = useStore();
  if (!data) return null;

  const point = data.timeSeries[currentIndex];
  if (!point) return null;

  const progress = (currentIndex / data.frameCount) * 100;

  let phase = '待机';
  let phaseColor = 'text-gray-400';
  if (progress < 8) {
    phase = '吹氩启动';
    phaseColor = 'text-cyan-400';
  } else if (progress < 55) {
    phase = '喷粉脱硫';
    phaseColor = 'text-orange-400';
  } else if (progress < 78) {
    phase = '持续搅拌';
    phaseColor = 'text-yellow-400';
  } else {
    phase = '后搅取样';
    phaseColor = 'text-green-400';
  }

  const minutes = Math.floor(currentIndex / 60);
  const seconds = currentIndex % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="h-14 bg-[#0a0e17]/95 border-b border-cyan-900/30 flex items-center px-6 gap-6 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <Flame className="w-5 h-5 text-orange-500" />
        <span className="text-sm text-gray-400">炉次</span>
        <span className="text-base font-semibold text-white font-rajdhani tracking-wide">BF-2024-0618-A3</span>
      </div>

      <div className="w-px h-6 bg-cyan-900/40" />

      <div className="flex items-center gap-2">
        <Activity className={`w-4 h-4 ${phaseColor}`} />
        <span className="text-sm text-gray-400">阶段</span>
        <span className={`text-sm font-semibold ${phaseColor}`}>{phase}</span>
      </div>

      <div className="w-px h-6 bg-cyan-900/40" />

      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-cyan-400" />
        <span className="text-sm text-gray-400">运行时长</span>
        <span className="text-base font-semibold text-cyan-300 font-rajdhani">{timeStr}</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-1.5">
          <Thermometer className="w-4 h-4 text-red-400" />
          <span className="text-xs text-gray-500">铁水温度</span>
          <span className="text-sm font-semibold text-red-300 font-rajdhani">{point.temperature}°C</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wind className="w-4 h-4 text-cyan-400" />
          <span className="text-xs text-gray-500">氩气流量</span>
          <span className="text-sm font-semibold text-cyan-300 font-rajdhani">{point.argon_flow} NL/min</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Gauge className="w-4 h-4 text-orange-400" />
          <span className="text-xs text-gray-500">喷粉量</span>
          <span className="text-sm font-semibold text-orange-300 font-rajdhani">{point.powder_flow} kg/min</span>
        </div>
      </div>
    </div>
  );
}
