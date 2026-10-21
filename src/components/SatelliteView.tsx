import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Play, Pause, RefreshCw, AlertTriangle } from 'lucide-react';

// Monitoramento por satélite: GOES-19 (GOES-East), servido pelo NASA GIBS (WMTS público, sem chave).
// Horários disponíveis consultados no próprio GIBS (DescribeDomains) — nenhuma data é inventada.

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

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const PRODUCTS = {
  ir: {
    layer: 'GOES-East_ABI_Band13_Clean_Infrared',
    tms: 'GoogleMapsCompatible_Level6',
    maxNativeZoom: 6,
    label: 'Infravermelho',
    title: 'Banda 13 (infravermelho limpo) — mostra nuvens de dia e de noite',
  },
  vis: {
    layer: 'GOES-East_ABI_Band2_Red_Visible_1km',
    tms: 'GoogleMapsCompatible_Level7',
    maxNativeZoom: 7,
    label: 'Visível',
    title: 'Banda 2 (visível) — só tem imagem durante o dia',
  },
} as const;
type ProductId = keyof typeof PRODUCTS;

const FRAME_COUNT = 12; // 2 horas, imagens a cada 10 min
const REFRESH_MS = 5 * 60 * 1000;
const STALE_MIN = 60;

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

async function fetchAvailableTimes(product: ProductId): Promise<number[]> {
  const { layer, tms } = PRODUCTS[product];
  const end = new Date();
  const start = new Date(end.getTime() - 4 * 3600 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 19) + 'Z';
  const url =
    `${GIBS}/wmts.cgi?SERVICE=WMTS&REQUEST=DescribeDomains&VERSION=1.0.0` +
    `&LAYER=${layer}&TILEMATRIXSET=${tms}&TIME=${iso(start)}/${iso(end)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GIBS retornou HTTP ${res.status}`);
  const xml = await res.text();
  const domain = xml.match(/<Domain>([^<]*)<\/Domain>/)?.[1] ?? '';
  return expandDomain(domain).slice(-FRAME_COUNT);
}

const tileUrl = (product: ProductId, t: number) => {
  const { layer, tms } = PRODUCTS[product];
  const time = new Date(t).toISOString().slice(0, 19) + 'Z';
  return `${GIBS}/${layer}/default/${time}/${tms}/{z}/{y}/{x}.png`;
};

export const SatelliteView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.TileLayer[]>([]);
  const errorCountRef = useRef<number[]>([]);

  const [product, setProduct] = useState<ProductId>('ir');
  const [times, setTimes] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [frameFailed, setFrameFailed] = useState(false);

  // Mapa próprio do satélite (independente do mapa do radar)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [-27.1, -52.6],
      zoom: 5,
      minZoom: 3,
      maxZoom: 9,
      zoomControl: false,
      attributionControl: false,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd' }).addTo(map);
    map.createPane('labels');
    const labelsPane = map.getPane('labels');
    if (labelsPane) {
      labelsPane.style.zIndex = '650';
      labelsPane.style.pointerEvents = 'none';
    }
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      pane: 'labels',
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
      const list = await fetchAvailableTimes(product);
      if (list.length === 0) throw new Error('Nenhuma imagem recente publicada pelo satélite.');
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
      const layer = L.tileLayer(tileUrl(product, t), {
        maxNativeZoom: PRODUCTS[product].maxNativeZoom,
        maxZoom: 9,
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
  }, [times, product]);

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
            GOES-19 · NASA GIBS / NOAA
            <br />© CARTO · © OpenStreetMap
          </span>
        </div>
      </div>
    </div>
  );
};
