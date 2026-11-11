import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { ArrowDown, ArrowUp, Minus, RefreshCw, X } from 'lucide-react';
import { HYDRO_STATIONS, HydroSummary, HydroTrend, fetchHydroStation } from '../services/hydro';

const REFRESH_MS = 10 * 60 * 1000; // a ANA publica a cada 15 min
const STALE_MS = 3 * 3600 * 1000;
const CENTER: [number, number] = [-26.95, -52.75];

const TREND: Record<HydroTrend, { label: string; color: string; Icon: typeof ArrowUp }> = {
  subindo: { label: 'Subindo', color: '#fbbf24', Icon: ArrowUp },
  descendo: { label: 'Descendo', color: '#38bdf8', Icon: ArrowDown },
  estavel: { label: 'Estável', color: '#94a3b8', Icon: Minus },
};

const fmtM = (cm: number | null | undefined) => (cm == null ? '–' : `${(cm / 100).toFixed(2).replace('.', ',')} m`);
const fmtCm = (cm: number | null) => (cm == null ? '–' : `${cm > 0 ? '+' : ''}${Math.round(cm)} cm`);
const fmtMm = (mm: number) => `${mm.toFixed(1).replace('.', ',')} mm`;
const fmtTime = (t: number) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(t));

/** Rios: nível, vazão e chuva das estações da ANA/SGB, atualizando sozinho enquanto a tela está aberta. */
export const HydroView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const [data, setData] = useState<Record<string, HydroSummary | 'erro'>>({});
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(
      HYDRO_STATIONS.map((s) => fetchHydroStation(s).then((r) => [s.cod, r] as const, () => [s.cod, 'erro' as const] as const))
    );
    setData((prev) => {
      const next = { ...prev };
      // falha pontual não apaga o último dado bom
      for (const [cod, r] of results) if (r !== 'erro' || !next[cod]) next[cod] = r;
      return next;
    });
    setLoadedAt(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // Mapa próprio (mesmo fundo escuro do satélite)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: CENTER, zoom: 8, minZoom: 5, maxZoom: 13, zoomControl: false, attributionControl: false });
    const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
    L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 16 }).addTo(map);
    L.tileLayer(`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 16 }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    // enquadra as estações acima do painel de baixo
    map.fitBounds(L.latLngBounds(HYDRO_STATIONS.map((s) => [s.lat, s.lon] as [number, number])), {
      paddingTopLeft: [24, 130],
      paddingBottomRight: [24, Math.round(window.innerHeight * 0.48) + 24],
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Marcadores com nível e tendência
  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    group.clearLayers();
    for (const s of HYDRO_STATIONS) {
      const d = data[s.cod];
      const sum = d && d !== 'erro' ? d : null;
      const stale = !sum?.last || Date.now() - sum.last.t > STALE_MS;
      const tr = sum?.trend && !stale ? TREND[sum.trend] : null;
      const color = tr?.color ?? '#64748b';
      const arrow = tr ? (sum!.trend === 'subindo' ? '▲' : sum!.trend === 'descendo' ? '▼' : '■') : '';
      const html = `<div style="display:flex;align-items:center;gap:6px;transform:translate(-7px,-7px)">
        <span style="flex:none;display:block;width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #050b18;box-shadow:0 0 0 2px ${color}55"></span>
        <span style="white-space:nowrap;font:600 11px/1.2 ui-monospace,monospace;color:#e2e8f0;background:#050b18d9;border:1px solid ${s.cod === selected ? '#22d3ee' : '#ffffff22'};border-radius:8px;padding:2px 6px">${s.nome} ${stale ? '<span style="color:#64748b">sem dado</span>' : `${fmtM(sum!.last!.nivelCm)} <span style="color:${color}">${arrow}</span>`}</span>
      </div>`;
      L.marker([s.lat, s.lon], { icon: L.divIcon({ html, className: '', iconSize: [0, 0] }), keyboard: true, title: `${s.nome} – ${s.rio}` })
        .on('click', () => setSelected(s.cod))
        .addTo(group);
    }
  }, [data, selected]);

  const sel = selected ? data[selected] : null;
  const selSum = sel && sel !== 'erro' ? sel : null;
  const selStation = HYDRO_STATIONS.find((s) => s.cod === selected);

  return (
    <div className="absolute inset-0 z-[600] bg-[#050b18]">
      <div ref={containerRef} className="absolute inset-0 z-0" />

      <div className="absolute inset-x-0 bottom-0 z-[650] p-3 sm:p-4 pointer-events-none flex justify-start">
        <div className="glass pointer-events-auto rounded-2xl w-full sm:w-[26rem] max-h-[48dvh] flex flex-col" style={{ background: 'rgba(10, 19, 36, 0.96)' }}>
          <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
            <div className="min-w-0 flex-1 leading-tight">
              <span className="eyebrow block">Rios · ANA / SGB · a cada 15 min</span>
              <span className="text-[11px] text-slate-400 font-mono">
                {loadedAt ? `Atualizado ${fmtTime(loadedAt)}` : 'Carregando estações…'}
              </span>
            </div>
            <button className="btn btn-icon" onClick={load} disabled={loading} aria-label="Atualizar agora" title="Atualizar agora">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {selected && (
              <button className="btn btn-icon" onClick={() => setSelected(null)} aria-label="Voltar à lista">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="overflow-y-auto overscroll-contain px-3.5 pb-3.5">
            {selStation ? (
              <StationDetail station={selStation} sum={selSum} failed={sel === 'erro'} />
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {HYDRO_STATIONS.map((s) => {
                  const d = data[s.cod];
                  const sum = d && d !== 'erro' ? d : null;
                  const stale = !sum?.last || Date.now() - sum.last.t > STALE_MS;
                  const tr = sum?.trend && !stale ? TREND[sum.trend] : null;
                  return (
                    <li key={s.cod}>
                      <button className="w-full flex items-center gap-3 py-2 text-left cursor-pointer" onClick={() => {
                        setSelected(s.cod);
                        mapRef.current?.panTo([s.lat, s.lon]);
                      }}>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] text-white truncate">{s.nome}</span>
                          <span className="block text-[11px] text-slate-400">{s.rio}</span>
                        </span>
                        <span className="text-right">
                          <span className="block font-mono text-[13px] text-slate-100">{stale ? '–' : fmtM(sum!.last!.nivelCm)}</span>
                          <span className="block text-[11px]" style={{ color: tr?.color ?? '#64748b' }}>
                            {d === 'erro' && !sum ? 'indisponível' : stale ? 'sem dado recente' : `${tr?.label ?? ''} ${fmtCm(sum!.d24h)} em 24 h`}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-[10px] text-slate-500">
              Fonte: Rede Hidrometeorológica Nacional (ANA / Serviço Geológico do Brasil), estações telemétricas. Nível = régua da estação, não é cota de inundação. Siga sempre a Defesa Civil.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const StationDetail: React.FC<{ station: (typeof HYDRO_STATIONS)[number]; sum: HydroSummary | null; failed: boolean }> = ({ station, sum, failed }) => {
  if (!sum) return <p className="text-[12px] text-slate-400 py-3">{failed ? 'Não foi possível obter os dados desta estação agora.' : 'Carregando…'}</p>;
  const tr = sum.trend ? TREND[sum.trend] : null;
  const pts = sum.readings.filter((r) => r.nivelCm != null);
  const W = 300, H = 90;
  let path = '';
  let bars: { x: number; h: number }[] = [];
  if (pts.length > 1) {
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    const lo = Math.min(...pts.map((p) => p.nivelCm!)), hi = Math.max(...pts.map((p) => p.nivelCm!));
    const span = Math.max(hi - lo, 10);
    const x = (t: number) => ((t - t0) / Math.max(t1 - t0, 1)) * W;
    path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${(H - 8 - ((p.nivelCm! - lo) / span) * (H - 16)).toFixed(1)}`).join(' ');
    const maxRain = Math.max(...sum.readings.map((r) => r.chuvaMm ?? 0), 2);
    bars = sum.readings.filter((r) => (r.chuvaMm ?? 0) > 0).map((r) => ({ x: x(r.t), h: ((r.chuvaMm ?? 0) / maxRain) * 30 }));
  }
  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold text-white">{station.nome}</div>
          <div className="text-[11px] text-slate-400">{station.rio} · estação {station.cod}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[22px] text-white leading-none">{fmtM(sum.last?.nivelCm)}</div>
          {tr && (
            <div className="mt-1 inline-flex items-center gap-1 text-[12px]" style={{ color: tr.color }}>
              <tr.Icon className="w-3.5 h-3.5" /> {tr.label}
            </div>
          )}
        </div>
      </div>

      {path && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24 rounded-xl bg-white/[0.03] border border-white/10" preserveAspectRatio="none" aria-label="Nível nas últimas 48 horas">
          {bars.map((b, i) => (
            <rect key={i} x={b.x - 0.8} y={H - b.h} width={1.6} height={b.h} fill="#38bdf8" opacity={0.55} />
          ))}
          <path d={path} fill="none" stroke="#22d3ee" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
        </svg>
      )}

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ['1 h', fmtCm(sum.d1h)],
          ['6 h', fmtCm(sum.d6h)],
          ['24 h', fmtCm(sum.d24h)],
          ['Vazão', sum.last?.vazao != null ? `${Math.round(sum.last.vazao).toLocaleString('pt-BR')} m³/s` : '–'],
          ['Chuva 1 h', fmtMm(sum.chuva1h)],
          ['Chuva 24 h', fmtMm(sum.chuva24h)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white/[0.04] border border-white/10 py-1.5">
            <dt className="text-[10px] text-slate-400">{k}</dt>
            <dd className="font-mono text-[12px] text-slate-100">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-slate-400">Última leitura: {sum.last ? fmtTime(sum.last.t) : '–'} · linha = nível (48 h), barras = chuva</p>
    </div>
  );
};
