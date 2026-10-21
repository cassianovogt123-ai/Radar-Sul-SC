import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Play, Pause, RefreshCw, AlertTriangle } from 'lucide-react';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

// Monitoramento por satélite: GOES-19 (GOES-East). Horários consultados na própria fonte —
// nenhuma data é inventada.

export type MonitorMode = 'radar' | 'satelite';

/** Alternância Radar / Satélite (mesmo padrão visual do seletor de mapa base). */
export const MonitorModeSelector: React.FC<{ value: MonitorMode; onChange: (m: MonitorMode) => void }> = ({
  value,
  onChange,
}) => (
  <div
    role="radiogroup"
    aria-label="Tipo de monitoramento"
    className="absolute top-14 left-3 sm:top-16 sm:left-4 z-[700] glass rounded-xl p-1 flex items-center gap-0.5"
  >
    {([
      { id: 'radar', label: 'Radar Chapecó', title: 'Radar meteorológico de Chapecó (Defesa Civil SC)' },
      { id: 'satelite', label: 'Satélite GOES', title: 'Imagens do satélite GOES-19 (NASA GIBS / NOAA)' },
    ] as const).map((opt) => (
      <button
        key={opt.id}
        role="radio"
        aria-checked={value === opt.id}
        onClick={() => onChange(opt.id)}
        title={opt.title}
        className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
          value === opt.id
            ? 'bg-cyan-400/20 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]'
            : 'text-slate-300 hover:text-white hover:bg-white/10'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

// Fontes (ambas públicas, sem chave):
//  1. RealEarth (SSEC/CIMSS, Univ. de Wisconsin) — GOES-19 disco completo, chega ~10 min após a imagem.
//  2. NASA GIBS — mesmo satélite, porém publica com mais atraso; usado como reserva.
// Só entram horários cuja imagem já está completa sobre a região do radar (teste de blocos),
// para nunca mostrar uma imagem "pela metade".
const REALEARTH = 'https://realearth.ssec.wisc.edu';
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

const PRODUCTS = {
  ir: {
    label: 'Infravermelho',
    title: 'Banda 13 (infravermelho limpo) — mostra nuvens de dia e de noite',
    realearth: 'G19-ABI-FD-BAND13',
    gibs: { layer: 'GOES-East_ABI_Band13_Clean_Infrared', tms: 'GoogleMapsCompatible_Level6', maxNativeZoom: 6 },
    maxNativeZoom: 7,
  },
  vis: {
    label: 'Visível',
    title: 'Banda 2 (visível) — só tem imagem durante o dia',
    realearth: 'G19-ABI-FD-BAND02',
    gibs: { layer: 'GOES-East_ABI_Band2_Red_Visible_1km', tms: 'GoogleMapsCompatible_Level7', maxNativeZoom: 7 },
    maxNativeZoom: 8,
  },
} as const;
type ProductId = keyof typeof PRODUCTS;
type SourceId = 'realearth' | 'gibs';
const SOURCE_LABEL: Record<SourceId, string> = {
  realearth: 'GOES-19 · SSEC RealEarth',
  gibs: 'GOES-19 · NASA GIBS / NOAA',
};

const FRAME_COUNT = 12; // 2 horas, imagens a cada 10 min
const REFRESH_MS = 2 * 60 * 1000;
const STALE_MIN = 60;
const RADAR_CENTER: [number, number] = [-27.0968, -52.618];

const brt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const utc = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });

function parseIsoDuration(d: string): number {
  const m = d.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return ((+(m[1] || 0) * 60 + +(m[2] || 0)) * 60 + +(m[3] || 0)) * 1000;
}

/** Expande o domínio de tempo do GIBS ("ini/fim/PT10M" ou instantes, separados por vírgula). */
function expandDomain(domain: string): number[] {
  const out: number[] = [];
  for (const part of domain.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [a, b, p] = part.split('/');
    const start = Date.parse(a);
    if (!b) {
      if (!isNaN(start)) out.push(start);
      continue;
    }
    const end = Date.parse(b);
    const step = parseIsoDuration(p || 'PT10M');
    if (isNaN(start) || isNaN(end) || step <= 0) continue;
    for (let t = start; t <= end; t += step) out.push(t);
  }
  return Array.from(new Set(out)).sort((x, y) => x - y);
}

/** GET de texto: fetch normal; no APK, se o WebView bloquear, usa o HTTP nativo do Capacitor. */
async function getText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({ url, responseType: 'text', connectTimeout: 10000, readTimeout: 15000 });
      if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    }
    throw err;
  }
}

/** "20261021.133020" -> timestamp UTC */
function parseRealEarthTime(s: string): number {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})\.(\d{2})(\d{2})(\d{2})$/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
}
const pad = (n: number) => String(n).padStart(2, '0');
function realEarthStamp(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}/${pad(d.getUTCHours())}${pad(
    d.getUTCMinutes()
  )}${pad(d.getUTCSeconds())}`;
}

async function listTimes(source: SourceId, product: ProductId): Promise<number[]> {
  const p = PRODUCTS[product];
  if (source === 'realearth') {
    const txt = await getText(`${REALEARTH}/api/times?products=${p.realearth}`);
    const json = JSON.parse(txt);
    const raw: string[] = json?.[p.realearth] || [];
    return raw.map(parseRealEarthTime).filter((t) => !isNaN(t)).sort((a, b) => a - b);
  }
  const end = new Date();
  const start = new Date(end.getTime() - 4 * 3600 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 19) + 'Z';
  const xml = await getText(
    `${GIBS}/wmts.cgi?SERVICE=WMTS&REQUEST=DescribeDomains&VERSION=1.0.0` +
      `&LAYER=${p.gibs.layer}&TILEMATRIXSET=${p.gibs.tms}&TIME=${iso(start)}/${iso(end)}`
  );
  const domain = xml.match(/<Domain>([^<]*)<\/Domain>/)?.[1] ?? '';
  return expandDomain(domain);
}

function tileUrl(source: SourceId, product: ProductId, t: number): string {
  const p = PRODUCTS[product];
  if (source === 'realearth') {
    return `${REALEARTH}/tiles/${p.realearth}/${realEarthStamp(t)}/{z}/{x}/{y}.png`;
  }
  const time = new Date(t).toISOString().slice(0, 19) + 'Z';
  return `${GIBS}/${p.gibs.layer}/default/${time}/${p.gibs.tms}/{z}/{y}/{x}.png`;
}

function loadImage(url: string, timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = '';
      resolve(false);
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth > 0);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

/** A imagem desse horário já está completa sobre a região do radar? (3×3 blocos no zoom 5) */
async function isFrameComplete(source: SourceId, product: ProductId, t: number): Promise<boolean> {
  const tpl = tileUrl(source, product, t);
  const z = 5;
  const n = 2 ** z;
  const cx = Math.floor(((RADAR_CENTER[1] + 180) / 360) * n);
  const latRad = (RADAR_CENTER[0] * Math.PI) / 180;
  const cy = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  const jobs: Promise<boolean>[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const url = tpl.replace('{z}', String(z)).replace('{x}', String(cx + dx)).replace('{y}', String(cy + dy));
      jobs.push(loadImage(url));
    }
  }
  const results = await Promise.all(jobs);
  return results.every(Boolean);
}

/** Lista os últimos horários publicados e descarta os que ainda não estão completos. */
async function fetchReadyTimes(source: SourceId, product: ProductId): Promise<number[]> {
  const all = (await listTimes(source, product)).filter((t) => Date.now() - t < 6 * 3600 * 1000);
  // do mais novo para o mais antigo, até achar o primeiro horário completo (no máx. 6 tentativas)
  let lastReady = -1;
  for (let i = all.length - 1, tries = 0; i >= 0 && tries < 6; i--, tries++) {
    if (await isFrameComplete(source, product, all[i])) {
      lastReady = i;
      break;
    }
  }
  if (lastReady < 0) return [];
  return all.slice(0, lastReady + 1).slice(-FRAME_COUNT);
}

export const SatelliteView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.TileLayer[]>([]);
  const errorCountRef = useRef<number[]>([]);

  const [product, setProduct] = useState<ProductId>('ir');
  const [times, setTimes] = useState<number[]>([]);
  const [source, setSource] = useState<SourceId>('realearth');
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [frameFailed, setFrameFailed] = useState(false);

  // Mapa próprio do satélite (independente do mapa do radar)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: RADAR_CENTER,
      zoom: 6,
      minZoom: 3,
      maxZoom: 10,
      zoomControl: false,
      attributionControl: false,
    });
    // Mapa base escuro + nomes/limites por cima das nuvens (Esri, sem chave de API)
    const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
    L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 16 }).addTo(map);
    map.createPane('labels');
    const labelsPane = map.getPane('labels');
    if (labelsPane) {
      labelsPane.style.zIndex = '650';
      labelsPane.style.pointerEvents = 'none';
    }
    L.tileLayer(`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, {
      maxNativeZoom: 16,
      pane: 'labels',
    }).addTo(map);
    // Referência do radar de Chapecó (alcance de 250 km) para comparar com o satélite
    L.circle(RADAR_CENTER, {
      radius: 250000,
      pane: 'labels',
      color: '#22d3ee',
      weight: 1.5,
      opacity: 0.7,
      dashArray: '4 6',
      fill: false,
      interactive: false,
    }).addTo(map);
    L.circleMarker(RADAR_CENTER, {
      radius: 4,
      pane: 'labels',
      color: '#082f49',
      weight: 1.5,
      fillColor: '#22d3ee',
      fillOpacity: 1,
      interactive: false,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const loadTimes = useCallback(async () => {
    setStatus((s) => (s === 'ok' ? s : 'loading'));
    try {
      // Fonte mais rápida primeiro; se falhar ou estiver atrás, usa a reserva
      let best: { src: SourceId; list: number[] } | null = null;
      let lastErr: any = null;
      for (const src of ['realearth', 'gibs'] as SourceId[]) {
        try {
          const list = await fetchReadyTimes(src, product);
          if (list.length && (!best || list[list.length - 1] > best.list[best.list.length - 1])) {
            best = { src, list };
          }
          // RealEarth recente (< 30 min) já é o melhor possível; não precisa consultar o GIBS
          if (src === 'realearth' && list.length && Date.now() - list[list.length - 1] < 30 * 60000) break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (!best) throw lastErr || new Error('Nenhuma imagem recente publicada pelo satélite.');
      const { src, list } = best;
      setSource(src);
      setTimes((prev) => (prev.join() === list.join() ? prev : list));
      setStatus('ok');
    } catch (err: any) {
      setTimes([]);
      setErrorMsg(err?.message || 'Falha ao consultar as imagens de satélite.');
      setStatus('error');
    }
  }, [product]);

  useEffect(() => {
    setTimes([]);
    setStatus('loading');
    loadTimes();
    const id = setInterval(loadTimes, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadTimes]);

  // (Re)cria as camadas de cada horário
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layersRef.current.forEach((l) => map.removeLayer(l));
    errorCountRef.current = times.map(() => 0);
    layersRef.current = times.map((t, i) => {
      const layer = L.tileLayer(tileUrl(source, product, t), {
        maxNativeZoom: source === 'gibs' ? PRODUCTS[product].gibs.maxNativeZoom : PRODUCTS[product].maxNativeZoom,
        maxZoom: 10,
        opacity: 0,
        zIndex: 300,
      });
      layer.on('tileerror', () => {
        errorCountRef.current[i] = (errorCountRef.current[i] || 0) + 1;
      });
      layer.addTo(map);
      return layer;
    });
    setIndex(Math.max(0, times.length - 1));
    setIsPlaying(false);
  }, [times, product, source]);

  // Mostra só o horário selecionado
  useEffect(() => {
    layersRef.current.forEach((l, i) => l.setOpacity(i === index ? 0.85 : 0));
    const current = layersRef.current[index];
    if (!current) return;
    const check = () => setFrameFailed((errorCountRef.current[index] || 0) > 0 && !current.isLoading());
    check();
    current.on('load', check);
    return () => {
      current.off('load', check);
    };
  }, [index, times]);

  // Animação
  useEffect(() => {
    if (!isPlaying || times.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % times.length), 700);
    return () => clearInterval(id);
  }, [isPlaying, times.length]);

  const currentTime = times[index];
  const ageMin = currentTime ? Math.max(0, Math.round((Date.now() - currentTime) / 60000)) : null;
  const latestAgeMin = times.length ? Math.round((Date.now() - times[times.length - 1]) / 60000) : null;
  const isStale = latestAgeMin !== null && latestAgeMin > STALE_MIN;

  return (
    <div className="absolute inset-0 z-[600] bg-slate-950">
      <div ref={containerRef} className="w-full h-full z-0" />

      {status === 'error' && (
        <div className="absolute inset-0 z-[650] grid place-items-center p-4 bg-[#050b18]/80">
          <div className="glass rounded-2xl p-4 max-w-sm text-center">
            <AlertTriangle className="w-5 h-5 text-amber-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-100 mb-1">Imagens de satélite indisponíveis</p>
            <p className="text-[12px] text-slate-400 mb-3">{errorMsg.replace(/\.?$/, '.')} Nenhuma imagem antiga está sendo exibida.</p>
            <button onClick={loadTimes} className="btn mx-auto">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Tentar de novo</span>
            </button>
          </div>
        </div>
      )}

      {status === 'loading' && (
        <div className="absolute inset-0 z-[650] grid place-items-center pointer-events-none">
          <span className="glass rounded-xl px-3 py-2 font-mono text-[12px] text-slate-300">Carregando satélite…</span>
        </div>
      )}

      {/* Painel inferior: horário, animação e tipo de imagem */}
      <div className="absolute inset-x-3 bottom-3 sm:inset-x-4 sm:bottom-4 z-[660] flex flex-col gap-2 sm:items-end">
        {status === 'ok' && currentTime && (
          <div className="glass rounded-2xl p-2 flex flex-col gap-2 sm:w-[420px]">
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="leading-tight font-mono tabular-nums">
                <span className="block text-[13px] font-medium text-slate-100">{brt.format(new Date(currentTime))} BRT</span>
                <span className="block text-[11px] text-slate-500">
                  {utc.format(new Date(currentTime))} UTC · há {ageMin} min
                </span>
              </div>
              {isStale ? (
                <span className="inline-flex items-center h-7 px-2.5 rounded-full border text-[11px] font-medium text-orange-300 border-orange-400/25 bg-orange-400/10">
                  Desatualizado
                </span>
              ) : (
                <span className="inline-flex items-center h-7 px-2.5 rounded-full border text-[11px] font-medium text-emerald-300 border-emerald-400/25 bg-emerald-400/10">
                  {index === times.length - 1 ? 'Mais recente' : `${index + 1}/${times.length}`}
                </span>
              )}
            </div>
            {frameFailed && (
              <p className="px-1 text-[11px] text-amber-300">Algumas partes desta imagem não foram carregadas pela fonte.</p>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                data-active={isPlaying}
                className="btn"
                aria-pressed={isPlaying}
                disabled={times.length < 2}
                title="Animar as últimas 2 horas"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'Pausar' : 'Animar'}</span>
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(0, times.length - 1)}
                value={index}
                onChange={(e) => {
                  setIsPlaying(false);
                  setIndex(Number(e.target.value));
                }}
                className="range-cyan flex-1"
                style={{ ['--fill' as string]: `${times.length > 1 ? (index / (times.length - 1)) * 100 : 100}%` }}
                aria-label="Horário da imagem de satélite"
              />
            </div>
          </div>
        )}

        <div className="glass rounded-2xl p-2 flex items-center justify-between gap-2 sm:w-[420px]">
          <div role="radiogroup" aria-label="Tipo de imagem de satélite" className="flex items-center gap-0.5">
            {(Object.keys(PRODUCTS) as ProductId[]).map((id) => (
              <button
                key={id}
                role="radio"
                aria-checked={product === id}
                onClick={() => setProduct(id)}
                title={PRODUCTS[id].title}
                className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  product === id
                    ? 'bg-cyan-400/20 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {PRODUCTS[id].label}
              </button>
            ))}
          </div>
          <span className="font-mono text-[10px] text-slate-500 text-right leading-tight">
            {SOURCE_LABEL[source]}
            <br />© Esri
          </span>
        </div>
      </div>
    </div>
  );
};
