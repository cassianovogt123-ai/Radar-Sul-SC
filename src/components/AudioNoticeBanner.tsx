import React from 'react';
import { Volume2, X } from 'lucide-react';

interface AudioNoticeBannerProps {
  onEnable: () => void;
  onDismiss: () => void;
}

export const AudioNoticeBanner: React.FC<AudioNoticeBannerProps> = ({ onEnable, onDismiss }) => {
  return (
    <div className="bg-cyan-950/90 border-b border-cyan-800/80 px-4 py-2 text-xs text-cyan-200 flex items-center justify-between gap-3 shadow-md z-40">
      <div className="flex items-center gap-2">
        <Volume2 className="w-4 h-4 text-cyan-400 shrink-0" />
        <span>
          <strong>Alertas Sonoros:</strong> O navegador requer uma interação inicial para autorizar a reprodução de áudio. Clique para habilitar o aviso sonoro único de novos ecos de chuva.
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onEnable}
          className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-md transition-colors text-xs whitespace-nowrap shadow"
        >
          Habilitar Áudio
        </button>
        <button
          onClick={onDismiss}
          className="p-1 text-cyan-400 hover:text-cyan-200 rounded transition-colors"
          title="Fechar aviso"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
