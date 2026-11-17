import React, { useEffect, useRef, useState } from 'react';
import { Clock, Pause, Play, Loader2 } from 'lucide-react';
import { NOWCAST_LEADS_MIN, NowcastResult, RainArrival } from '../utils/nowcast';
import type { CityForecast } from '../services/forecast';

// Linha do tempo única do radar de Chapecó:
// passado (varreduras reais da última hora) → Agora → previsão imediata (+10 a +60 min),
// e embaixo a previsão hora a hora das próximas 24 h (Open-Meteo) para a cidade.
// Valor do passo: minutos em relação à varredura atual (negativo = passado, 0 = agora, positivo = previsão).

interface NowcastControlProps {
  /** null enquanto calcula pela primeira vez */
  result: NowcastResult | null;
  isComputing: boolean;
  /** passo em exibição (minutos; 0 = varredura real "Agora") */
  leadMin: number;
  onChangeLead: (leadMin: number) => void;
  /** varreduras reais anteriores disponíveis (minutos negativos, da mais antiga para a mais nova) */
  pastSteps?: number[];
  cityName?: string;
  arrival?: RainArrival | null;
  forecast?: CityForecast | null;
}

const hhmm = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const formatNowcastLabel = (leadMin: number, validAt: number) =>
  `PREVISÃO +${leadMin} min · ~${hhmm.format(new Date(validAt))} · estimativa`;

export const formatPastLabel = (agoMin: number, at: number) =>
  `OBSERVADO há ${agoMin} min · ${hhmm.format(new Date(at))} · radar de Chapecó`;

const stepLabel = (s: number) => (s === 0 ? 'Agora' : s > 0 ? `+${s}` : `${s}`);

function arrivalText(cityName: string, arrival: RainArrival | null | undefined, forecast: CityForecast | null | undefined): string {
  if (arrival?.kind === 'agora') return `Chovendo agora em ${cityName}, segundo o radar.`;
  if (arrival?.kind === 'radar')
    return `Pelo movimento dos ecos, a chuva pode chegar a ${cityName} em ~${arrival.leadMin} min (por volta das ${hhmm.format(new Date(arrival.validAt))}).`;
  const head = arrival ? 'Sem chuva chegando pelo radar na próxima hora' : 'Radar ainda calculando';
  if (forecast?.peakTime && forecast.sum24h >= 1)
    return `${head}. O modelo prevê ${forecast.sum24h} mm nas próximas 24 h, com pico por volta das ${forecast.peakTime}.`;
  if (forecast) return `${head}. O modelo não prevê chuva relevante nas próximas 24 h.`;
  return `${head}.`;
}

export const NowcastControl: React.FC<NowcastControlProps> = ({
  result,
  isComputing,
  leadMin,
  onChangeLead,
  pastSteps = [],
  cityName = 'Chapecó',
  arrival = null,
  forecast = null,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const ready = !!result && result.ok;
  const steps = [...pastSteps, 0, ...(ready ? NOWCAST_LEADS_MIN : [])];
  const idx = Math.max(0, steps.indexOf(leadMin));

  // Fecha o painel ao tocar fora dele (o passo selecionado continua no mapa)
  useEffect(() => {
    if (!isOpen) return;
    const close = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [isOpen]);

  // Animação: passado → Agora → +60 → volta ao início
  useEffect(() => {
    if (!isPlaying || steps.length < 2) return;
    const id = setInterval(() => onChangeLead(steps[(idx + 1) % steps.length]), 900);
    return () => clearInterval(id);
  }, [isPlaying, idx, steps.join(','), onChangeLead]);

  // se o passo escolhido sumiu (nova varredura chegou), volta para Agora
  useEffect(() => {
    if (!steps.includes(leadMin)) onChangeLead(0);
  }, [steps.join(','), leadMin, onChangeLead]);

  const active = leadMin !== 0;
  const hours = forecast?.hourly24 ?? [];
  const maxMm = Math.max(2, ...hours.map((h) => h.mm));

  return (
    <div ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        data-active={isOpen || active}
        className="btn btn-icon sm:w-auto sm:px-3"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={active ? `Linha do tempo em ${stepLabel(leadMin)} minutos` : 'Linha do tempo do radar'}
        title="Linha do tempo: última hora do radar, agora e a próxima hora"
      >
        <Clock className={`w-4 h-4 ${leadMin > 0 ? 'text-amber-300' : leadMin < 0 ? 'text-sky-300' : ''}`} />
        <span className="hidden sm:inline">{active ? `${stepLabel(leadMin)} min` : 'Tempo'}</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Linha do tempo"
          className="absolute bottom-full right-0 mb-2 w-80 max-w-full glass bg-[#0a1324]/95 rounded-2xl p-3 flex flex-col gap-3 shadow-xl"
        >
          <div className="leading-tight">
            <span className="block text-[13px] font-medium text-slate-100">Linha do tempo</span>
            <span className="block text-[11px] text-slate-400">Última hora do radar · agora · próxima hora</span>
          </div>

          <div className="space-y-1">
            <input
              type="range"
              min={0}
              max={Math.max(0, steps.length - 1)}
              value={idx}
              onChange={(e) => {
                setIsPlaying(false);
                onChangeLead(steps[Number(e.target.value)]);
              }}
              disabled={steps.length < 2}
              aria-label="Momento exibido no mapa"
              aria-valuetext={`${stepLabel(leadMin)} minutos`}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-sky-300">{pastSteps.length ? `${pastSteps[0]} min` : 'sem passado'}</span>
              <span className={leadMin === 0 ? 'text-cyan-200 font-semibold' : 'text-slate-400'}>
                {active ? `${stepLabel(leadMin)} min` : 'Agora'}
              </span>
              <span className="text-amber-300">{ready ? '+60 min' : 'previsão…'}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setIsPlaying(!isPlaying)} disabled={steps.length < 2} className="btn justify-center flex-1" aria-pressed={isPlaying}>
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Pausar' : 'Animar'}</span>
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                onChangeLead(0);
              }}
              disabled={leadMin === 0}
              className="btn justify-center"
            >
              Agora
            </button>
          </div>

          <p className="text-[12px] leading-snug text-slate-200">{arrivalText(cityName, arrival, forecast)}</p>

          {hours.length > 0 && (
            <div className="space-y-1" aria-label={`Chuva prevista hora a hora em ${cityName}`}>
              <div className="flex items-end gap-[2px] h-10">
                {hours.map((h, i) => (
                  <div
                    key={i}
                    title={`${h.hour}h · ${h.mm} mm · ${h.prob}%`}
                    className={`flex-1 rounded-t-sm ${h.mm >= 7.6 ? 'bg-rose-400' : h.mm >= 2.5 ? 'bg-amber-300' : h.mm >= 0.2 ? 'bg-sky-400' : 'bg-white/10'}`}
                    style={{ height: `${Math.max(6, (h.mm / maxMm) * 100)}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>{hours[0].hour}h</span>
                <span>próximas 24 h (modelo)</span>
                <span>{hours[hours.length - 1].hour}h</span>
              </div>
            </div>
          )}

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
            Passado = varreduras reais. Futuro = estimativa (quadros listrados, selo "PREVISÃO"): não prevê células que
            nascem ou se dissipam. Siga sempre os avisos da Defesa Civil e do INMET.
          </p>
        </div>
      )}
    </div>
  );
};
