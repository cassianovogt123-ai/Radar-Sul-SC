import React from 'react';
import { X, Navigation, CloudRain, Clock, AlertTriangle, ShieldCheck, Compass, Info } from 'lucide-react';
import { MunicipalityProximityStatus, ThreatLevel } from '../utils/cellTracker';

interface MunicipalityDetailModalProps {
  status: MunicipalityProximityStatus | null;
  onClose: () => void;
}

export const MunicipalityDetailModal: React.FC<MunicipalityDetailModalProps> = ({ status, onClose }) => {
  if (!status) return null;

  const getThreatBadge = (level: ThreatLevel) => {
    switch (level) {
      case 'verde':
        return {
          label: 'Verde · Condição Normal',
          sub: 'Sem células relevantes em rota de aproximação',
          color: 'text-emerald-400 border-emerald-800/80 bg-emerald-950/40',
          dot: 'bg-emerald-400',
        };
      case 'amarelo':
        return {
          label: 'Amarelo · Atenção Preventiva',
          sub: 'Célula de precipitação detectada com possível aproximação',
          color: 'text-amber-400 border-amber-800/80 bg-amber-950/40',
          dot: 'bg-amber-400',
        };
      case 'laranja':
        return {
          label: 'Laranja · Atenção Elevada',
          sub: 'Aproximação estimada de chuva moderada a forte',
          color: 'text-orange-400 border-orange-800/80 bg-orange-950/40',
          dot: 'bg-orange-500',
        };
      case 'vermelho':
        return {
          label: 'Vermelho · Alerta de Tempestade / Iminência',
          sub: 'Núcleo de alta intensidade (≥48 dBZ) ou chuva severa sobre o município',
          color: 'text-rose-400 border-rose-800/80 bg-rose-950/40',
          dot: 'bg-rose-500',
        };
    }
  };

  const badge = getThreatBadge(status.threatLevel);

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${badge.dot} shadow`} />
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
                <span>{status.cityName}</span>
                <span className="text-xs font-mono text-slate-400 font-normal">({status.state})</span>
              </h2>
              <span className="text-[11px] text-slate-400 font-mono">
                Lat {status.coords[0].toFixed(4)}° · Lon {status.coords[1].toFixed(4)}°
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 text-xs leading-relaxed max-h-[75vh] overflow-y-auto">
          {/* Threat Banner */}
          <div className={`p-3.5 rounded-xl border ${badge.color} space-y-1`}>
            <div className="font-semibold text-xs flex items-center justify-between">
              <span>{badge.label}</span>
              <span className="text-[10px] uppercase font-mono tracking-wider opacity-80">
                Nível de Atenção
              </span>
            </div>
            <p className="text-[11px] opacity-90">{status.threatDescription}</p>
          </div>

          {/* Observed vs Estimated Telemetry Cards */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Distância */}
            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-400 font-mono uppercase">Distância da Célula</span>
              <div className="text-base font-bold text-slate-100 font-mono">
                {status.distanceKm !== null ? `${status.distanceKm} km` : '—'}
              </div>
              <span className="text-[10px] text-slate-500">
                {status.effectiveEdgeDistanceKm !== null
                  ? status.effectiveEdgeDistanceKm === 0
                    ? 'Chuva no local'
                    : `Borda a ${status.effectiveEdgeDistanceKm} km`
                  : 'Sem células no radar'}
              </span>
            </div>

            {/* Refletividade */}
            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-400 font-mono uppercase">Refletividade Máxima</span>
              <div className="text-base font-bold text-cyan-300 font-mono">
                {status.closestCell ? `${status.closestCell.maxDbz} dBZ` : '—'}
              </div>
              <span className="text-[10px] text-slate-500">
                {status.closestCell
                  ? status.closestCell.maxDbz >= 45
                    ? 'Chuva forte / granizo'
                    : status.closestCell.maxDbz >= 30
                    ? 'Chuva moderada'
                    : 'Precipitação leve'
                  : 'Céu limpo no radar'}
              </span>
            </div>

            {/* Deslocamento */}
            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-400 font-mono uppercase">Deslocamento</span>
              <div className="text-xs font-semibold text-slate-200 truncate">
                {status.speedKmh !== null ? `${status.speedKmh} km/h` : 'Em observação'}
              </div>
              <span className="text-[10px] text-slate-400 truncate block">
                {status.directionText}
              </span>
            </div>

            {/* Tempo de Chegada (ETA) */}
            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-400 font-mono uppercase">Tempo Estimado (ETA)</span>
              <div className="text-xs font-semibold text-amber-300 truncate font-mono">
                {status.etaText}
              </div>
              <span className="text-[10px] text-slate-500">
                {status.movementTrend === 'aproximando' ? 'Projeção linear' : status.movementTrendText}
              </span>
            </div>
          </div>

          {/* Separation of Observed Facts vs Projections */}
          <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl text-[11px] text-slate-400 space-y-1.5">
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold text-xs">
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              <span>Transparência Científica</span>
            </div>
            <p>
              <strong>Dados Observados:</strong> Posição e refletividade em dBZ captadas pela varredura física do Radar de Chapecó (Defesa Civil SC / SIFAP) às {status.lastObservationTime}.
            </p>
            <p>
              <strong>Estimativas Calculadas:</strong> Velocidade, rumo e tempo de chegada (ETA) são projeções computadas pela variação espacial de centróides entre varreduras sucessivas. Células convectivas podem se intensificar, dissipar ou mudar de direção abruptamente.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
