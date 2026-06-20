import { useStore } from '@/store/useDesulfurizationStore';
import { Play, Pause, SkipBack, FastForward } from 'lucide-react';

const SPEEDS = [0.5, 1, 2, 4, 8];

export default function TimeControl() {
  const { currentIndex, playbackState, playbackSpeed, data, setCurrentIndex, setPlaybackState, setPlaybackSpeed } = useStore();

  if (!data) return null;

  const progress = (currentIndex / data.frameCount) * 100;
  const minutes = Math.floor(currentIndex / 60);
  const seconds = currentIndex % 60;
  const currentTimeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const totalMin = Math.floor(data.frameCount / 60);
  const totalSec = data.frameCount % 60;
  const totalTimeStr = `${String(totalMin).padStart(2, '0')}:${String(totalSec).padStart(2, '0')}`;

  const handleSliderClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const newIndex = Math.floor(ratio * data.frameCount);
    setCurrentIndex(Math.max(0, Math.min(data.frameCount - 1, newIndex)));
  };

  const handlePlayPause = () => {
    if (playbackState === 'playing') {
      setPlaybackState('paused');
    } else {
      if (currentIndex >= data.frameCount - 1) {
        setCurrentIndex(0);
      }
      setPlaybackState('playing');
    }
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setPlaybackState('paused');
  };

  return (
    <div className="h-16 bg-[#0a0e17]/95 border-t border-cyan-900/30 flex items-center px-6 gap-4 backdrop-blur-sm">
      <button
        onClick={handleReset}
        className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-cyan-900/20 transition-colors text-gray-400 hover:text-cyan-300"
      >
        <SkipBack className="w-4 h-4" />
      </button>

      <button
        onClick={handlePlayPause}
        className="w-10 h-10 flex items-center justify-center rounded-full bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors text-cyan-300"
      >
        {playbackState === 'playing' ? (
          <Pause className="w-5 h-5" />
        ) : (
          <Play className="w-5 h-5 ml-0.5" />
        )}
      </button>

      <span className="text-sm font-mono text-cyan-300 font-rajdhani min-w-[52px]">
        {currentTimeStr}
      </span>

      <div
        className="flex-1 h-2 bg-[#111827] rounded-full cursor-pointer relative group"
        onClick={handleSliderClick}
      >
        <div
          className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-cyan-600 to-orange-500 transition-all"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg shadow-cyan-500/30 transition-all group-hover:scale-125"
          style={{ left: `calc(${progress}% - 6px)` }}
        />
        <div
          className="absolute top-0 left-0 h-full w-px bg-cyan-400/40 transition-all"
          style={{ left: `${8}%` }}
        />
        <div
          className="absolute top-0 left-0 h-full w-px bg-orange-400/40 transition-all"
          style={{ left: `${55}%` }}
        />
        <div
          className="absolute top-0 left-0 h-full w-px bg-yellow-400/40 transition-all"
          style={{ left: `${78}%` }}
        />
      </div>

      <span className="text-sm font-mono text-gray-500 font-rajdhani min-w-[52px]">
        {totalTimeStr}
      </span>

      <div className="flex items-center gap-1 ml-2">
        <FastForward className="w-3.5 h-3.5 text-gray-500" />
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            onClick={() => setPlaybackSpeed(speed)}
            className={`px-2 py-0.5 text-xs rounded font-mono transition-colors ${
              playbackSpeed === speed
                ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/30'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>
    </div>
  );
}
