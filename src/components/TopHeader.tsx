import React from 'react';
import { RefreshCw, Volume2, VolumeX, ShieldAlert, FileText } from 'lucide-react';
import { ConnectionStatus } from '../types/radar';

interface TopHeaderProps {
  connectionStatus: ConnectionStatus;
  isAudioEnabled: boolean;
  isMuted: boolean;
  dataAgeMinutes: number | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  onToggleAudio: () => void;
  onOpenSourceModal: () => void;
  activeSourceId: string;
  onSelectSource: (sourceId: string) => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  connectionStatus,
  isAudioEnabled,
  isMuted,
  dataAgeMinutes,
  isRefreshing,
  onRefresh,
  onToggleAudio,
  onOpenSourceModal,
  activeSourceId,
  onSelectSource,
}) => {
  const getStatusText = () => {
    switch (connectionStatus) {
      case 'conectado':
        return {
          label: 'Conectado',
          color: 'text-emerald-400',
          dot: 'bg-emerald-400',
        };
      case 'atualizando':
        return {
          label: 'Atualizando...',
          color: 'text-amber-400',
          dot: 'bg-amber-400',
        };
      case 'desatualizado':
        return {
          label: 'Dados desatualizados',
          color: 'text-orange-400',
          dot: 'bg-orange-400',
        };
      case 'indisponivel':
        return {
          label: 'Indisponível',
          color: 'text-rose-400',
          dot: 'bg-rose-400',
        };
    }
  };

  const status = getStatusText();

  return (
    <header className="h-14 bg-slate-950/95 border-b border-slate-800/80 px-4 md:px-6 flex items-center justify-between gap-8 shrink-0 z-30 select-none">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="/"
          className="text-base md:text-lg font-bold tracking-tight text-slate-100 hover:text-cyan-400 transition-colors whitespace-nowrap"
        >
          Radar Sul SC
        </a>
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-mono">
          <span className={`w-2 h-2 rounded-full ${status.dot}`} />
          <span className={status.color}>{status.label}</span>
          {dataAgeMinutes !== null && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400 tabular-nums">
                {dataAgeMinutes === 0 ? 'tempo real' : `${dataAgeMinutes}m atrás`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Zone 2: Clean single-line navigation tabs / source selector */}
      <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-slate-400">
        <button
          onClick={() => onSelectSource('defesa_civil_chapeco')}
          className={`whitespace-nowrap transition-colors hover:text-slate-200 pb-0.5 border-b-2 ${
            activeSourceId === 'defesa_civil_chapeco'
              ? 'text-cyan-400 border-cyan-400 font-semibold'
              : 'border-transparent text-slate-400'
          }`}
        >
          Radar Chapecó (Oeste SC)
        </button>

        <button
          onClick={() => onSelectSource('defesa_civil_mosaico')}
          className={`whitespace-nowrap transition-colors hover:text-slate-200 pb-0.5 border-b-2 ${
            activeSourceId === 'defesa_civil_mosaico'
              ? 'text-cyan-400 border-cyan-400 font-semibold'
              : 'border-transparent text-slate-400'
          }`}
        >
          Mosaico Regional SC
        </button>

        <button
          onClick={() => onSelectSource('rainviewer_composite')}
          className={`whitespace-nowrap transition-colors hover:text-slate-200 pb-0.5 border-b-2 ${
            activeSourceId === 'rainviewer_composite'
              ? 'text-cyan-400 border-cyan-400 font-semibold'
              : 'border-transparent text-slate-400'
          }`}
        >
          Doppler Continental
        </button>

        <button
          onClick={onOpenSourceModal}
          className="whitespace-nowrap transition-colors hover:text-slate-200 text-slate-400 flex items-center gap-1"
        >
          <FileText className="w-3.5 h-3.5 text-slate-500" />
          <span>Fontes Oficiais & Guia</span>
        </button>
      </nav>

      {/* Zone 3: Primary action & audio quick toggle */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={onToggleAudio}
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
            isAudioEnabled && !isMuted
              ? 'bg-cyan-950/40 border-cyan-700/80 text-cyan-300 hover:bg-cyan-900/50'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
          }`}
          title={
            isAudioEnabled
              ? isMuted
                ? 'Alertas silenciados temporariamente'
                : 'Alerta sonoro ATIVADO (clique para silenciar)'
              : 'Alerta sonoro DESATIVADO (clique para ativar)'
          }
        >
          {isAudioEnabled && !isMuted ? (
            <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
          ) : (
            <VolumeX className="w-3.5 h-3.5 text-slate-500" />
          )}
          <span className="hidden sm:inline">
            {isAudioEnabled ? (isMuted ? 'Silenciado' : 'Alerta Ativo') : 'Alerta Mudo'}
          </span>
        </button>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shadow-sm hover:shadow-cyan-900/30"
          title="Consultar servidor meteorológico agora"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Atualizar Agora</span>
        </button>
      </div>
    </header>
  );
};
