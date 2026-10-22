import React, { useEffect, useRef, useState } from 'react';
import { FastForward, Pause, Play, Loader2 } from 'lucide-react';
import { NOWCAST_LEADS_MIN, NowcastResult } from '../utils/nowcast';

interface NowcastControlProps {
  /** null enquanto calcula pela primeira vez */
  result: NowcastResult | null;
  isComputing: boolean;
  /** 0 = varredura real ("Agora"); >0 = minutos à frente */
  leadMin: number;
  onChangeLead: (leadMin: number) => void;
}

const hhmm = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const formatNowcastLabel = (leadMin: number, validAt: number) =>
  `PREVISÃO +${leadMin} min · ~${hhmm.format(new Date(validAt))} · estimativa`;

export const NowcastControl: React.FC<NowcastControlProps> = ({ result, isComputing, leadMin, onChangeLead }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const steps = [0, ...NOWCAST_LEADS_MIN];
  const ready = !!result && result.ok;

  // Fecha o painel ao tocar fora dele (a previsão selecionada continua no mapa)
  useEffect(() => {
    if (!isOpen) return;
    const close = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [isOpen]);

  // Animação: Agora → +10 → … → +60 → Agora
  useEffect(() => {
    if (!isPlaying || !ready) return;
    const id = setInterval(() => {
      const i = steps.indexOf(leadMin);
      onChangeLead(steps[(i + 1) % steps.length]);
    }, 900);
    return () => clearInterval(id);
  }, [isPlaying, ready, leadMin, onChangeLead]);

  useEffect(() => {
    if (!ready) setIsPlaying(false);
  }, [ready]);

  const active = leadMin > 0;

  return (
    <div ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        data-active={isOpen || active}
        className="btn btn-icon sm:w-auto sm:px-3"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={active ? `Previsão de +${leadMin} minutos em exibição` : 'Previsão imediata do radar'}
        title="Previsão imediata: para onde a chuva vai nos próximos 60 min"
      >
        <FastForward className={`w-4 h-4 ${active ? 'text-amber-300' : ''}`} />
        <span className="hidden sm:inline">{active ? `+${leadMin} min` : 'Previsão'}</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Previsão imediata"
          className="absolute bottom-full right-0 mb-2 w-80 max-w-full glass bg-[#0a1324]/95 rounded-2xl p-3 flex flex-col gap-3 shadow-xl"
        >
          <div className="leading-tight">
            <span className="block text-[13px] font-medium text-slate-100">Previsão imediata (até 60 min)</span>
            <span className="block text-[11px] text-slate-400">
              Empurra os ecos atuais na direção em que estão andando
            </span>
          </div>

          <div role="radiogroup" aria-label="Horizonte da previsão" className="grid grid-cols-6 gap-1">
            {steps.map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={leadMin === s}
                disabled={s > 0 && !ready}
                onClick={() => {
                  setIsPlaying(false);
                  onChangeLead(s);
                }}
                className={`h-8 rounded-lg text-[11px] font-mono font-medium transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                  leadMin === s
                    ? s === 0
                      ? 'bg-cyan-400/20 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]'
                      : 'bg-amber-400/15 text-amber-100 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.5)]'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {s === 0 ? 'Agora' : `+${s}`}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={!ready}
            className="btn justify-center"
            aria-pressed={isPlaying}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlaying ? 'Pausar animação' : 'Animar próxima hora'}</span>
          </button>

          <div className="text-[11px] leading-snug">
            {isComputing && !result ? (
              <span className="flex items-center gap-1.5 text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculando o movimento dos ecos…
              </span>
            ) : result?.ok ? (
              <span className="text-slate-300">
                Ecos indo para <b className="text-slate-100">{result.motion.headingText}</b> a{' '}
                <b className="text-slate-100 font-mono">{result.motion.speedKmh} km/h</b>
                <span className="text-slate-500"> · encaixe {Math.round(result.motion.confidence * 100)}%</span>
              </span>
            ) : (
              <span className="text-slate-400">{result?.reason ?? 'Aguardando a primeira varredura.'}</span>
            )}
          </div>

          <p className="text-[11px] leading-snug text-slate-500">
            É uma estimativa: não prevê células que nascem, crescem ou se dissipam. Quadros previstos aparecem
            listrados, com o selo "PREVISÃO". Siga sempre os avisos da Defesa Civil e do INMET.
          </p>
        </div>
      )}
    </div>
  );
};
