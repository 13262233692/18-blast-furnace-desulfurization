import { useStore } from '@/store/useDesulfurizationStore';
import { Thermometer, Wind, Gauge, Droplets } from 'lucide-react';

function GaugeCircle({
  value,
  max,
  min,
  unit,
  label,
  color,
  icon: Icon,
}: {
  value: number;
  max: number;
  min: number;
  unit: string;
  label: string;
  color: string;
  icon: React.ElementType;
}) {
  const ratio = (value - min) / (max - min);
  const angle = ratio * 270;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-[135deg]">
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="rgba(30,40,60,0.8)"
            strokeWidth="6"
            strokeDasharray="188.5 251.3"
            strokeLinecap="round"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={`${(angle / 360) * 251.3} 251.3`}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 4px ${color}60)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className="w-3.5 h-3.5 mb-0.5" style={{ color }} />
          <span className="text-sm font-bold font-rajdhani" style={{ color }}>
            {typeof value === 'number' ? value.toFixed(1) : value}
          </span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-[10px] text-gray-500">{label}</div>
        <div className="text-[9px] text-gray-600">{unit}</div>
      </div>
    </div>
  );
}

export default function SensorPanel() {
  const { currentIndex, data } = useStore();
  if (!data) return null;

  const point = data.timeSeries[currentIndex];
  if (!point) return null;

  return (
    <div className="w-full">
      <div className="px-3 py-2 border-b border-cyan-900/20">
        <h3 className="text-xs font-semibold text-cyan-400 tracking-wider uppercase">
          传感器数据
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-3 p-3">
        <GaugeCircle
          value={point.temperature}
          max={1400}
          min={1250}
          unit="°C"
          label="铁水温度"
          color="#ff4444"
          icon={Thermometer}
        />
        <GaugeCircle
          value={point.powder_flow}
          max={10}
          min={0}
          unit="kg/min"
          label="喷粉流量"
          color="#ff6b35"
          icon={Droplets}
        />
        <GaugeCircle
          value={point.argon_flow}
          max={150}
          min={0}
          unit="NL/min"
          label="氩气流量"
          color="#00d4ff"
          icon={Wind}
        />
        <GaugeCircle
          value={point.material_level}
          max={100}
          min={0}
          unit="%"
          label="料位高度"
          color="#ffd700"
          icon={Gauge}
        />
      </div>

      <div className="px-3 py-2 border-t border-cyan-900/20 mt-1">
        <h3 className="text-[10px] text-gray-500 mb-2">关键指标</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">当前硫含量</span>
            <span className="text-sm font-bold text-orange-400 font-rajdhani">
              {point.sulfur_ppm.toFixed(1)} <span className="text-[9px] text-gray-600">ppm</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">下降速率</span>
            <span className="text-sm font-bold text-cyan-400 font-rajdhani">
              {point.sulfur_rate.toFixed(2)} <span className="text-[9px] text-gray-600">ppm/s</span>
            </span>
          </div>
          <div className="w-full bg-[#111827] rounded-full h-1.5 mt-1">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-cyan-400 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, ((480 - point.sulfur_ppm) / 452) * 100))}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-gray-600">
            <span>脱硫进度</span>
            <span>{Math.max(0, Math.min(100, ((480 - point.sulfur_ppm) / 452) * 100)).toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
