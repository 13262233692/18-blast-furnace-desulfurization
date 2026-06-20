import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useStore } from '@/store/useDesulfurizationStore';

export default function SulfurCurvePanel() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const { currentIndex, data } = useStore();

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current, 'dark');
    chartInstanceRef.current = chart;

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, []);

  useEffect(() => {
    if (!chartInstanceRef.current || !data) return;
    const chart = chartInstanceRef.current;

    const timeData = data.timeSeries.map((p) => {
      const m = Math.floor(p.time / 60);
      const s = p.time % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    });
    const sulfurData = data.timeSeries.map((p) => p.sulfur_ppm);
    const rateData = data.timeSeries.map((p) => p.sulfur_rate);
    const integralData: number[] = [];
    let sum = 0;
    for (let i = 0; i < rateData.length; i++) {
      if (i > 0) {
        sum += Math.abs(rateData[i]) * (data.timeSeries[i].time - data.timeSeries[i - 1].time);
      }
      integralData.push(Math.round(sum * 100) / 100);
    }

    chart.setOption({
      backgroundColor: 'transparent',
      animation: false,
      grid: {
        top: 45,
        right: 65,
        bottom: 30,
        left: 55,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(10,14,23,0.9)',
        borderColor: 'rgba(0,212,255,0.3)',
        textStyle: { color: '#e0e0e0', fontSize: 11 },
      },
      legend: {
        top: 5,
        textStyle: { color: '#8a8fa0', fontSize: 10 },
        itemWidth: 14,
        itemHeight: 8,
      },
      xAxis: {
        type: 'category',
        data: timeData,
        axisLine: { lineStyle: { color: 'rgba(0,212,255,0.2)' } },
        axisLabel: {
          color: '#5a6070',
          fontSize: 9,
          interval: 149,
          formatter: (v: string) => v,
        },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          name: '硫含量 (ppm)',
          nameTextStyle: { color: '#ff6b35', fontSize: 10, padding: [0, 0, 0, -20] },
          axisLine: { lineStyle: { color: 'rgba(255,107,53,0.3)' } },
          axisLabel: { color: '#ff6b35', fontSize: 9 },
          splitLine: { lineStyle: { color: 'rgba(255,107,53,0.06)' } },
          min: 0,
          max: 520,
        },
        {
          type: 'value',
          name: '下降速率 (ppm/s)',
          nameTextStyle: { color: '#00d4ff', fontSize: 10, padding: [0, -20, 0, 0] },
          axisLine: { lineStyle: { color: 'rgba(0,212,255,0.3)' } },
          axisLabel: { color: '#00d4ff', fontSize: 9 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '硫含量',
          type: 'line',
          yAxisIndex: 0,
          data: sulfurData,
          smooth: 0.3,
          symbol: 'none',
          lineStyle: { color: '#ff6b35', width: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(255,107,53,0.25)' },
              { offset: 1, color: 'rgba(255,107,53,0)' },
            ]),
          },
        },
        {
          name: '下降速率 (dS/dt)',
          type: 'line',
          yAxisIndex: 1,
          data: rateData,
          smooth: 0.4,
          symbol: 'none',
          lineStyle: { color: '#00d4ff', width: 1.5 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(0,212,255,0.1)' },
              { offset: 1, color: 'rgba(0,212,255,0)' },
            ]),
          },
        },
        {
          name: '累计脱硫量 (∫|dS/dt|dt)',
          type: 'line',
          yAxisIndex: 0,
          data: integralData,
          smooth: 0.3,
          symbol: 'none',
          lineStyle: { color: '#ffd700', width: 1, type: 'dashed' },
        },
      ],
    }, true);
  }, [data]);

  useEffect(() => {
    if (!chartInstanceRef.current || !data) return;
    const chart = chartInstanceRef.current;

    chart.setOption({
      series: data.timeSeries.map(() => ({
        markLine: {
          silent: true,
          symbol: 'none',
          animation: false,
          data: [
            {
              xAxis: currentIndex,
              lineStyle: {
                color: '#ffffff',
                width: 1.5,
                type: 'solid',
                opacity: 0.7,
              },
              label: { show: false },
            },
          ],
        },
      })),
    });
  }, [currentIndex, data]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 border-b border-cyan-900/20">
        <h3 className="text-xs font-semibold text-cyan-400 tracking-wider uppercase">
          硫含量分析曲线
        </h3>
        <p className="text-[10px] text-gray-500 mt-0.5">
          硫含量 (ppm) · 下降速率 dS/dt · 累计脱硫量 ∫|dS/dt|dt
        </p>
      </div>
      <div ref={chartRef} className="flex-1 min-h-0" />
    </div>
  );
}
