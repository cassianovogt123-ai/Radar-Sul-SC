import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Browser } from '@capacitor/browser';
import { getText } from './SatelliteView';

// Imagens Sentinel-2 / Landsat estilo Copernicus Browser, dentro do app.
// Fonte: NASA GIBS (camadas HLS, 30 m, sem chave) + catálogo CMR da NASA para saber
// quais dias têm imagem sobre a área visível e quanto de nuvem tinha.
// HLS só existe em projeção geográfica no GIBS, por isso este mapa usa EPSG:4326.
// Sentinel-2 em 10 m (3x mais nítido que o HLS de 30 m): Microsoft Planetary Computer (grátis, sem chave),
// imagem "visual" (cor natural) já pronta, servida na grade WorldCRS84Quad, que bate com o EPSG:4326 do Leaflet.
const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
const CMR = 'https://cmr.earthdata.nasa.gov/search/granules.json';
const PC = 'https://planetarycomputer.microsoft.com/api';
const CENTER: [number, number] = [-27.1, -53.2];
const DIAS = 90;

const SATS = {
  s2: { label: 'Sentinel-2 · 10 m', layer: 'HLS_S30_Nadir_BRDF_Adjusted_Reflectance', cmr: 'HLSS30' },
  l8: { label: 'Landsat 8/9', layer: 'HLS_L30_Nadir_BRDF_Adjusted_Reflectance', cmr: 'HLSL30' },
} as const;
type SatId = keyof typeof SATS;
type Dia = { dia: string; nuvem: number | null };

const COPERNICUS =
  'https://browser.dataspace.copernicus.eu/?zoom=9&lat=-27.1&lng=-53.2&datasetId=S2_L2A_CDAS&layerId=1_TRUE_COLOR&date=latest';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const fmtDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Dias (UTC) com imagem cobrindo o centro do mapa, do mais novo ao mais antigo, com a nuvem da cena.
 *  Pelo centro (e não pela área toda) para não listar dias em que o satélite só pegou uma beirada da tela. */
async function buscarDias(sat: SatId, c: L.LatLng): Promise<Dia[]> {
  const ponto = `${clamp(c.lng, -180, 180).toFixed(4)},${clamp(c.lat, -90, 90).toFixed(4)}`;
  const fim = new Date();
  const ini = new Date(fim.getTime() - DIAS * 864e5);
  const url =
    `${CMR}?short_name=${SATS[sat].cmr}&version=2.0&provider=LPCLOUD&point=${ponto}` +
    `&temporal=${ini.toISOString()},${fim.toISOString()}&sort_key=-start_date&page_size=500`;
  const json = JSON.parse(await getText(url));
  const porDia = new Map<string, number | null>();
  for (const g of json?.feed?.entry ?? []) {
    const dia = String(g.time_start ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;
    const n = g.cloud_cover != null && !isNaN(Number(g.cloud_cover)) ? Number(g.cloud_cover) : null;
    const antes = porDia.get(dia);
    if (antes === undefined || (n != null && (antes == null || n < antes))) porDia.set(dia, n);
  }
  return [...porDia].map(([dia, nuvem]) => ({ dia, nuvem })).sort((x, y) => (x.dia < y.dia ? 1 : -1));
}

/** Dias com Sentinel-2 (10 m) no centro do mapa, pelo catálogo do Planetary Computer. */
async function buscarDiasS2(c: L.LatLng): Promise<Dia[]> {
  const fim = new Date();
  const ini = new Date(fim.getTime() - DIAS * 864e5);
  const res = await fetch(`${PC}/stac/v1/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a'],
      intersects: { type: 'Point', coordinates: [clamp(c.lng, -180, 180), clamp(c.lat, -90, 90)] },
      datetime: `${ini.toISOString()}/${fim.toISOString()}`,
      sortby: [{ field: 'datetime', direction: 'desc' }],
      limit: 100,
      fields: { include: ['properties.datetime', 'properties.eo:cloud_cover'], exclude: ['assets', 'links', 'geometry'] },
    }),
  });
  if (!res.ok) throw new Error(`Planetary Computer ${res.status}`);
  const json = await res.json();
  const porDia = new Map<string, number | null>();
  for (const f of json?.features ?? []) {
    const dia = String(f.properties?.datetime ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;
    const n = typeof f.properties?.['eo:cloud_cover'] === 'number' ? f.properties['eo:cloud_cover'] : null;
    const antes = porDia.get(dia);
    if (antes === undefined || (n != null && (antes == null || n < antes))) porDia.set(dia, n);
  }
  return [...porDia].map(([dia, nuvem]) => ({ dia, nuvem })).sort((x, y) => (x.dia < y.dia ? 1 : -1));
}

const mosaicos = new Map<string, string>();
/** Registra (uma vez por dia) o mosaico de todas as cenas Sentinel-2 daquele dia e devolve o endereço dos blocos. */
async function urlMosaicoS2(dia: string): Promise<string> {
  let id = mosaicos.get(dia);
  if (!id) {
    const res = await fetch(`${PC}/data/v1/mosaic/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collections: ['sentinel-2-l2a'],
        'filter-lang': 'cql2-json',
        filter: { op: 'anyinteracts', args: [{ property: 'datetime' }, { interval: [`${dia}T00:00:00Z`, `${dia}T23:59:59Z`] }] },
        sortby: [{ field: 'eo:cloud_cover', direction: 'asc' }],
      }),
    });
    if (!res.ok) throw new Error(`Planetary Computer ${res.status}`);
    id = String((await res.json()).searchid);
    mosaicos.set(dia, id);
  }
  return `${PC}/data/v1/mosaic/${id}/tiles/WorldCRS84Quad/{z}/{x}/{y}@1x?collection=sentinel-2-l2a&assets=visual&asset_bidx=visual%7C1%2C2%2C3&nodata=0&pixel_selection=first`;
}

export const SentinelView: React.FC = () => {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const imgRef = useRef<L.TileLayer.WMS | null>(null);
  const s2Ref = useRef<L.TileLayer | null>(null);
  const [sat, setSat] = useState<SatId>('s2');
  const [dias, setDias] = useState<Dia[]>([]);
  const [dia, setDia] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const [imgCarregando, setImgCarregando] = useState(false);

  // Mapa próprio em coordenadas geográficas: fundo Blue Marble + divisas/estradas e nomes por cima.
  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const map = L.map(boxRef.current, {
      crs: L.CRS.EPSG4326,
      center: CENTER,
      zoom: 9,
      minZoom: 4,
      maxZoom: 14,
      zoomControl: false,
      attributionControl: false,
    });
    // blocos de 512 px: 4x menos pedidos à NASA, carrega bem mais rápido
    L.tileLayer.wms(GIBS_WMS, { layers: 'BlueMarble_ShadedRelief_Bathymetry', format: 'image/jpeg', tileSize: 512 }).addTo(map);
    const img = L.tileLayer.wms(GIBS_WMS, {
      layers: SATS.s2.layer,
      format: 'image/png',
      transparent: true,
      maxZoom: 14,
      tileSize: 512,
    }).addTo(map);
    img.on('loading', () => setImgCarregando(true));
    img.on('load', () => setImgCarregando(false));
    imgRef.current = img;

    map.createPane('referencia').style.zIndex = '450';
    for (const layers of ['Reference_Features_15m', 'Reference_Labels_15m'])
      L.tileLayer.wms(GIBS_WMS, { layers, format: 'image/png', transparent: true, pane: 'referencia', tileSize: 512 }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const carregar = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    setCarregando(true);
    try {
      const lista = sat === 's2' ? await buscarDiasS2(map.getCenter()) : await buscarDias(sat, map.getCenter());
      setDias(lista);
      setErro(false);
      // mantém o dia escolhido se ainda existir; senão o mais novo com pouca nuvem
      setDia((atual) =>
        atual && lista.some((d) => d.dia === atual)
          ? atual
          : (lista.find((d) => d.nuvem != null && d.nuvem < 30) ?? lista[0])?.dia ?? null
      );
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [sat]);

  // Recarrega os dias ao trocar de satélite e quando o mapa para de se mexer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    carregar();
    let t: ReturnType<typeof setTimeout>;
    const onMove = () => {
      clearTimeout(t);
      t = setTimeout(carregar, 800);
    };
    map.on('moveend', onMove);
    return () => {
      clearTimeout(t);
      map.off('moveend', onMove);
    };
  }, [carregar]);

  useEffect(() => {
    const s2 = sat === 's2';
    // Landsat continua pelo HLS da NASA (30 m é a resolução nativa dele)
    imgRef.current?.setParams({ layers: SATS[sat].layer, time: dia ?? '' } as L.WMSParams);
    imgRef.current?.setOpacity(dia && !s2 ? 1 : 0);
    s2Ref.current?.setOpacity(0);
    if (!s2 || !dia) return;
    let vivo = true;
    urlMosaicoS2(dia)
      .then((url) => {
        const map = mapRef.current;
        if (!vivo || !map) return;
        if (!s2Ref.current) {
          // criada só quando já há endereço (evita pedidos vazios)
          const layer = L.tileLayer(url, { maxZoom: 14, maxNativeZoom: 14 }).addTo(map);
          layer.on('loading', () => setImgCarregando(true));
          layer.on('load', () => setImgCarregando(false));
          s2Ref.current = layer;
        } else s2Ref.current.setUrl(url);
        s2Ref.current.setOpacity(1);
      })
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [sat, dia]);

  return (
    <div className="absolute inset-0 z-[600] bg-[#050b18]">
      <div ref={boxRef} className="absolute inset-0 z-0" />
      {/* mira: as datas da lista são as que têm imagem neste ponto */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-[650] -translate-x-1/2 -translate-y-1/2 text-cyan-300/80 text-xl leading-none">
        +
      </div>
      {imgCarregando && dia && (
        <div className="pointer-events-none absolute left-1/2 top-[9.5rem] sm:top-[10.5rem] z-[700] -translate-x-1/2 glass rounded-full px-3 py-1 text-[11px] text-slate-200 flex items-center gap-1.5">
          <RefreshCw size={12} className="animate-spin" /> Carregando imagem…
        </div>
      )}

      {/* faixa abaixo do seletor Radar/Satélite/Rios */}
      <div className="absolute inset-x-3 sm:inset-x-4 top-[6.25rem] sm:top-[7rem] z-[700] flex items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Satélite" className="glass rounded-xl p-1 flex gap-0.5">
          {(Object.keys(SATS) as SatId[]).map((id) => (
            <button
              key={id}
              role="radio"
              aria-checked={sat === id}
              onClick={() => setSat(id)}
              className={`h-7 px-2.5 rounded-lg text-[11px] font-medium ${
                sat === id ? 'bg-cyan-400/20 text-cyan-100' : 'text-slate-300 hover:text-white'
              }`}
            >
              {SATS[id].label}
            </button>
          ))}
        </div>
        <button
          onClick={() => Browser.open({ url: COPERNICUS, toolbarColor: '#050b18' })}
          className="glass rounded-xl h-9 px-2.5 flex items-center gap-1 text-[11px] text-cyan-300 hover:text-white"
          title="Abre o Copernicus Browser completo"
        >
          <ExternalLink size={12} /> Copernicus
        </button>
      </div>

      {/* datas com imagem sobre a área visível (☁ = % de nuvem da cena) */}
      <div className="absolute inset-x-3 sm:inset-x-4 bottom-20 sm:bottom-6 z-[700] glass rounded-xl p-2">
        <div className="flex items-center justify-between gap-2 px-1 pb-1.5 text-[11px] text-slate-400">
          <span className="truncate">
            {SATS[sat].label} · datas com imagem na mira (+) · {DIAS} dias
          </span>
          <button onClick={carregar} aria-label="Atualizar datas" className="shrink-0 text-slate-300 hover:text-white">
            <RefreshCw size={13} className={carregando ? 'animate-spin' : ''} />
          </button>
        </div>
        {erro ? (
          <p className="px-1 text-xs text-amber-300">Não consegui buscar as datas. Toque em atualizar.</p>
        ) : dias.length === 0 ? (
          <p className="px-1 text-xs text-slate-400">{carregando ? 'Buscando imagens…' : 'Nenhuma imagem nesta área.'}</p>
        ) : (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {dias.map((d) => (
              <button
                key={d.dia}
                onClick={() => setDia(d.dia)}
                className={`shrink-0 rounded-lg px-2 py-1 text-[11px] leading-tight tabular-nums ${
                  d.dia === dia
                    ? 'bg-cyan-400/20 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]'
                    : 'bg-white/5 text-slate-300'
                }`}
              >
                <div className="font-medium">{fmtDia(d.dia)}</div>
                <div className="text-slate-400">☁ {d.nuvem == null ? '–' : `${Math.round(d.nuvem)}%`}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
