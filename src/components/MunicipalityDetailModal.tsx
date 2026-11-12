import React, { useMemo, useState } from 'react';
import { X, CloudRain, ShieldAlert, Radar, Info, RefreshCw, ChevronDown, Phone, ExternalLink } from 'lucide-react';
import { MunicipalityProximityStatus, ThreatLevel } from '../utils/cellTracker';
import {
  CityForecast,
  HAZARD_LABEL,
  HazardId,
  RAIN_LEVEL_LABEL,
  RISK_LABEL,
  RiskLevel,
  maxRisk,
} from '../services/forecast';
import { CapAlert, SEVERITY_INFO, alertCoversCity, hazardsOfAlert, sortAlerts } from '../services/capAlerts';

type AlertState = { status: 'idle' | 'loading' | 'ok' | 'error'; alerts: CapAlert[]; at: number | null; error?: string };

interface MunicipalityDetailModalProps {
  cityName: string;
  state: string;
  coords: [number, number];
  ibge?: string;
  status: MunicipalityProximityStatus | null;
  forecast: CityForecast | null;
  alerts: AlertState;
  inmetAlerts: AlertState;
  onRetryAlerts: () => void;
  onClose: () => void;
}

const RISK_STYLE: Record<RiskLevel, string> = {
  baixo: 'text-emerald-300 border-emerald-400/25 bg-emerald-400/10',
  moderado: 'text-amber-300 border-amber-400/30 bg-amber-400/10',
  alto: 'text-orange-300 border-orange-400/35 bg-orange-500/15',
  muito_alto: 'text-rose-300 border-rose-400/40 bg-rose-500/15',
};

const RAIN_STYLE: Record<CityForecast['rainLevel'], string> = {
  sem_chuva: 'text-slate-300 border-white/10 bg-white/5',
  leve: 'text-sky-300 border-sky-400/30 bg-sky-400/10',
  moderada: 'text-amber-300 border-amber-400/30 bg-amber-400/10',
  forte: 'text-rose-300 border-rose-400/40 bg-rose-500/15',
};

const THREAT_STYLE: Record<ThreatLevel, { label: string; dot: string }> = {
  verde: { label: 'Normal', dot: 'bg-emerald-400' },
  amarelo: { label: 'Atenção', dot: 'bg-amber-400' },
  laranja: { label: 'Atenção elevada', dot: 'bg-orange-500' },
  vermelho: { label: 'Alerta', dot: 'bg-rose-500' },
};

const dt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const fmt = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? dt.format(new Date(t)) : '—';
};

const HAZARDS: HazardId[] = ['alagamento', 'deslizamento', 'vendaval', 'granizo', 'raios'];

const Chip: React.FC<{ className: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={`inline-flex items-center h-6 px-2 rounded-full border text-[11px] font-medium whitespace-nowrap ${className}`}>
    {children}
  </span>
);

const Section: React.FC<{ icon: React.ReactNode; title: string; right?: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  title,
  right,
  children,
}) => (
  <section className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-100">
        {icon}
        {title}
      </h3>
      {right}
    </div>
    {children}
  </section>
);

const AlertCard: React.FC<{ alert: CapAlert }> = ({ alert }) => {
  const [open, setOpen] = useState(false);
  const sev = SEVERITY_INFO[alert.severity];
  const isInmet = alert.source === 'inmet';
  const sevLabel = isInmet && alert.severityLabel ? alert.severityLabel : sev.label;
  const text = alert.headline || alert.description;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-slate-100 leading-snug">{alert.event}</p>
          <p className="text-[11px] text-slate-400">{isInmet ? 'INMET · aviso meteorológico' : alert.sender}</p>
        </div>
        <Chip className={RISK_STYLE[sev.risk]}>{sevLabel}</Chip>
      </div>
      <p className="font-mono text-[11px] text-slate-400 tabular-nums">
        {fmt(alert.onset || alert.sent)} → {fmt(alert.expires)}
      </p>
      {text && <p className={`text-[12px] text-slate-300 leading-relaxed ${open ? '' : 'line-clamp-3'}`}>{text}</p>}
      {open && alert.headline && alert.description && alert.description !== alert.headline && (
        <p className="text-[12px] text-slate-300 leading-relaxed">{alert.description}</p>
      )}
      {open && alert.instruction && (
        <p className="text-[12px] text-cyan-200/90 leading-relaxed">
          <strong className="font-semibold">O que fazer: </strong>
          {alert.instruction}
        </p>
      )}
      {open && isInmet && alert.web && (
        <a
          href={alert.web}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200"
        >
          <ExternalLink className="w-3 h-3" />
          Ver no INMET (mapa e municípios)
        </a>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200 cursor-pointer"
        aria-expanded={open}
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? 'Mostrar menos' : 'Ler alerta completo'}
      </button>
    </div>
  );
};

export const MunicipalityDetailModal: React.FC<MunicipalityDetailModalProps> = ({
  cityName,
  state,
  coords,
  ibge,
  status,
  forecast,
  alerts,
  inmetAlerts,
  onRetryAlerts,
  onClose,
}) => {
  const cityAlerts = useMemo(
    () =>
      sortAlerts(
        [...alerts.alerts, ...inmetAlerts.alerts].filter((a) => alertCoversCity(a, cityName, state, coords, ibge))
      ),
    [alerts.alerts, inmetAlerts.alerts, cityName, state, coords, ibge]
  );
  const loadingAny = alerts.status === 'loading' || inmetAlerts.status === 'loading';
  const bothFailed = alerts.status === 'error' && !alerts.at && inmetAlerts.status === 'error' && !inmetAlerts.at;

  // Risco por desastre = o maior entre a estimativa da previsão e os alertas oficiais
  const risks = useMemo(() => {
    const out = {} as Record<HazardId, { level: RiskLevel; official: boolean }>;
    for (const h of HAZARDS) out[h] = { level: forecast?.risks[h] ?? 'baixo', official: false };
    for (const a of cityAlerts) {
      const lvl = SEVERITY_INFO[a.severity].risk;
      for (const h of hazardsOfAlert(a)) {
        const merged = maxRisk(out[h].level, lvl);
        out[h] = { level: merged, official: out[h].official || merged === lvl };
      }
    }
    return out;
  }, [forecast, cityAlerts]);

  const threat = status ? THREAT_STYLE[status.threatLevel] : null;

  return (
    <div
      className="fixed inset-0 z-[900] flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label={`Detalhes de ${cityName}`}
        className="bg-[#0a1324] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col shadow-2xl text-slate-200"
      >
        {/* Cabeçalho */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-50 truncate">
              {cityName} <span className="text-slate-400 font-normal">· {state}</span>
            </h2>
            <p className="text-[11px] text-slate-500 font-mono">
              {coords[0].toFixed(3)}°, {coords[1].toFixed(3)}°
            </p>
          </div>
          <button onClick={onClose} className="btn btn-icon" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-5 overflow-y-auto">
          {/* Previsão */}
          <Section icon={<CloudRain className="w-4 h-4 text-sky-300" />} title="Previsão de chuva">
            {forecast ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip className={RAIN_STYLE[forecast.rainLevel]}>{RAIN_LEVEL_LABEL[forecast.rainLevel]}</Chip>
                  <span className="text-[12px] text-slate-300">
                    {forecast.rainProbability6h}% de chance nas próximas 6 h
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['Próx. 6 h', `${forecast.sum6h} mm`],
                    ['Próx. 24 h', `${forecast.sum24h} mm`],
                    ['Rajadas', `${forecast.maxGust24h} km/h`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">{k}</p>
                      <p className="font-mono text-[13px] text-slate-100 tabular-nums">{v}</p>
                    </div>
                  ))}
                </div>
                {forecast.peakTime && (
                  <p className="text-[11px] text-slate-400">
                    Pico previsto por volta das {forecast.peakTime} ({forecast.maxRate24h} mm/h)
                    {forecast.thunder24h ? ' · possibilidade de trovoadas' : ''}.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-slate-400">Carregando previsão…</p>
            )}
          </Section>

          {/* Alertas oficiais */}
          <Section
            icon={<ShieldAlert className="w-4 h-4 text-amber-300" />}
            title="Alertas oficiais"
            right={
              !loadingAny && (
                <button onClick={onRetryAlerts} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer">
                  <RefreshCw className="w-3 h-3" />
                  Atualizar
                </button>
              )
            }
          >
            {cityAlerts.length > 0 && (
              <div className="space-y-2">
                {cityAlerts.map((a) => (
                  <AlertCard key={a.id} alert={a} />
                ))}
              </div>
            )}
            {cityAlerts.length === 0 &&
              (loadingAny || (alerts.status === 'idle' && inmetAlerts.status === 'idle') ? (
                <p className="text-[12px] text-slate-400">Consultando Defesa Civil e INMET…</p>
              ) : bothFailed ? (
                <p className="text-[12px] text-amber-300">Não foi possível consultar os alertas agora.</p>
              ) : (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2.5 text-[12px] text-emerald-200">
                  Nenhum alerta ativo para {cityName} neste momento.
                </div>
              ))}
            <div className="space-y-0.5 text-[10px] text-slate-500 font-mono">
              <p>
                Defesa Civil (IDAP):{' '}
                {alerts.status === 'loading'
                  ? 'consultando…'
                  : alerts.at
                  ? `consultado às ${dt.format(new Date(alerts.at)).slice(-5)}`
                  : alerts.status === 'error'
                  ? `indisponível (${alerts.error})`
                  : '—'}
              </p>
              <p>
                INMET:{' '}
                {inmetAlerts.status === 'loading'
                  ? 'consultando…'
                  : inmetAlerts.at
                  ? `consultado às ${dt.format(new Date(inmetAlerts.at)).slice(-5)}`
                  : inmetAlerts.status === 'error'
                  ? 'indisponível agora'
                  : '—'}
              </p>
            </div>
          </Section>

          {/* Risco por desastre */}
          <Section icon={<ShieldAlert className="w-4 h-4 text-rose-300" />} title="Risco por tipo de desastre (24 h)">
            <div className="rounded-xl border border-white/10 divide-y divide-white/5">
              {HAZARDS.map((h) => (
                <div key={h} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-[12px] text-slate-200">{HAZARD_LABEL[h]}</span>
                  <span className="flex items-center gap-1.5">
                    {risks[h].official && <span className="text-[10px] text-amber-300/90">alerta oficial</span>}
                    <Chip className={RISK_STYLE[risks[h].level]}>{RISK_LABEL[risks[h].level]}</Chip>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Estimativa do app a partir da previsão (chuva, rajadas, trovoadas e chuva acumulada nos últimos 3 dias), elevada
              quando há alerta oficial. Não substitui a Defesa Civil.
            </p>
          </Section>

          {/* Radar agora */}
          {status && threat && (
            <Section icon={<Radar className="w-4 h-4 text-cyan-300" />} title="Radar de Chapecó agora">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${threat.dot}`} />
                <span className="text-[12px] font-medium text-slate-100">{status.threatTitle || threat.label}</span>
              </div>
              <p className="text-[12px] text-slate-400">{status.threatDescription}</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Célula mais próxima', status.distanceKm !== null ? `${status.distanceKm} km` : '—'],
                  ['Refletividade', status.closestCell ? `${status.closestCell.maxDbz} dBZ` : '—'],
                  ['Deslocamento', status.speedKmh !== null ? `${status.speedKmh} km/h ${status.directionText}` : status.directionText || '—'],
                  ['Chegada estimada', status.etaText || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">{k}</p>
                    <p className="font-mono text-[12px] text-slate-100 truncate">{v}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-slate-400 leading-relaxed">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-cyan-300" />
            <p>
              Fontes: previsão Open-Meteo; alertas oficiais da Defesa Civil (feed nacional IDAP, inclui as Defesas Civis
              estaduais) e avisos meteorológicos do INMET; radar Defesa Civil SC. Em emergência ligue{' '}
              <a href="tel:199" className="inline-flex items-center gap-0.5 text-cyan-300 font-medium">
                <Phone className="w-3 h-3" />
                199
              </a>{' '}
              (Defesa Civil) ou 193 (Bombeiros).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
