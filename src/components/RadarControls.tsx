import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Sliders, Eye, EyeOff } from 'lucide-react';
import { RadarFrame } from '../types/radar';

interface RadarControlsProps {
  frames: RadarFrame[];
  currentFrameIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  opacity: number;
  showRangeCircles: boolean;
  onSelectFrameIndex: (index: number) => void;
  onTogglePlay: () => void;
  onStepBackward: () => void;
  onStepForward: () => void;
  onChangeSpeed: (speed: number) => void;
  onChangeOpacity: (opacity: number) => void;
  onToggleRangeCircles: () => void;
}

export const RadarControls: React.FC<RadarControlsProps> = ({
  frames,
  currentFrameIndex,
  isPlaying,
  playbackSpeed,
  opacity,
  showRangeCircles,
  onSelectFrameIndex,
  onTogglePlay,
  onStepBackward,
  onStepForward,
  onChangeSpeed,
  onChangeOpacity,
  onToggleRangeCircles,
}) => {
  const currentFrame = frames[currentFrameIndex];
  const totalFrames = frames.length;

  return (
    <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl p-3 md:p-4 shadow-2xl flex flex-col gap-3">
      {/* Top info row: Frame observation timestamp */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Varredura:</span>
          {currentFrame ? (
            <div className="flex items-center gap-2 font-mono">
              <span className="text-cyan-300 font-semibold tabular-nums text-sm">
                {currentFrame.brtDisplay.split(',')[1]?.trim() || currentFrame.brtDisplay}
              </span>
              <span className="text-slate-500 text-[11px]">
                ({currentFrame.utcDisplay})
              </span>
              <span className="text-slate-500 text-[11px]">·</span>
              <span className="text-slate-400 text-[11px]">
                {currentFrameIndex === totalFrames - 1
                  ? 'Mais recente'
                  : `Frame ${currentFrameIndex + 1}/${totalFrames}`}
              </span>
            </div>
          ) : (
            <span className="text-slate-500 italic">Nenhuma observação carregada</span>
          )}
        </div>

        {/* Speed toggle pills/buttons */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          {[0.5, 1, 2].map((s) => (
            <button
              key={s}
              onClick={() => onChangeSpeed(s)}
              className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors ${
                playbackSpeed === s
                  ? 'bg-cyan-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={`Velocidade de reprodução ${s}x`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Timeline scrubber slider */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            value={currentFrameIndex}
            onChange={(e) => onSelectFrameIndex(Number(e.target.value))}
            disabled={totalFrames <= 1}
            className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Timeline tick marks */}
        <div className="flex justify-between text-[10px] text-slate-500 font-mono px-0.5">
          <span>{frames[0]?.brtDisplay.split(',')[1]?.trim() || 'Início'}</span>
          <span>{frames[totalFrames - 1]?.brtDisplay.split(',')[1]?.trim() || 'Agora'}</span>
        </div>
      </div>

      {/* Bottom controls row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/80">
        {/* Playback action buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onStepBackward}
            disabled={currentFrameIndex <= 0}
            className="p-2 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 rounded-lg transition-colors"
            title="Quadro anterior"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={onTogglePlay}
            disabled={totalFrames <= 1}
            className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg font-medium transition-all shadow-md shadow-cyan-950 flex items-center gap-1.5 text-xs"
            title={isPlaying ? 'Pausar animação' : 'Iniciar animação da varredura'}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4" />
                <span>Pausar</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Animar</span>
              </>
            )}
          </button>

          <button
            onClick={onStepForward}
            disabled={currentFrameIndex >= totalFrames - 1}
            className="p-2 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 rounded-lg transition-colors"
            title="Próximo quadro"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Opacity and Layer toggles */}
        <div className="flex items-center gap-4 text-xs text-slate-300">
          {/* Opacity slider */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px]">Opacidade:</span>
            <input
              type="range"
              min={10}
              max={100}
              value={opacity}
              onChange={(e) => onChangeOpacity(Number(e.target.value))}
              className="w-20 accent-cyan-400 h-1 bg-slate-800 rounded cursor-pointer"
            />
            <span className="font-mono text-slate-400 text-[11px] tabular-nums w-7">
              {opacity}%
            </span>
          </div>

          {/* Range rings toggle */}
          <button
            onClick={onToggleRangeCircles}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] transition-colors border ${
              showRangeCircles
                ? 'bg-slate-800 border-slate-700 text-cyan-300'
                : 'bg-transparent border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Exibir ou ocultar círculos de alcance do radar (50, 100, 200, 250 km)"
          >
            {showRangeCircles ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>Raios 250km</span>
          </button>
        </div>
      </div>
    </div>
  );
};
