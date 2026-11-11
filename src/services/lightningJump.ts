// "Salto de raios": quando a área com raios perto de uma cidade dispara de repente, a tempestade
// costuma estar se intensificando (granizo/ventania podem vir em 10–30 min). Fonte: GOES-19 GLM
// via RealEarth, a mesma camada de raios do mapa. Indica tempestade severa, NÃO detecta tornado.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { REALEARTH, getText, parseRealEarthTime, realEarthStamp } from '../components/SatelliteView';
import { isJump } from '../utils/lightningJumpRule';

const PRODUCT = 'glmgroupdensity';
const Z = 7; // zoom nativo máximo do produto (~1,1 km por pixel aqui no Sul)
const RADIUS_KM = 30;
const MINUTES = 12; // o produto sai a cada 1 min

export interface WatchCity {
  name: string;
  coords: [number, number];
}

/** Cidades da família fora da área do radar de Chapecó (o satélite cobre tudo). */
export const FAMILY_CITIES: WatchCity[] = [
  { name: 'Lages', coords: [-27.816, -50.326] },
  { name: 'Santo Augusto', coords: [-27.851, -53.777] },
];

export interface LightningJump {
  city: string;
  before: number; // área média com raios antes (pixels ≈ km²)
  now: number; // área com raios agora
}

const worldPx = (lat: number, lon: number) => {
  const n = 256 * 2 ** Z;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
};

// Pixels de cada tile por horário (só baixa os minutos novos a cada rodada)
const tileCache = new Map<string, Uint8ClampedArray | null>();

async function tileAlpha(stamp: string, tx: number, ty: number): Promise<Uint8ClampedArray | null> {
  const key = `${stamp}/${tx}/${ty}`;
  if (tileCache.has(key)) return tileCache.get(key)!;
  const url = `${REALEARTH}/tiles/${PRODUCT}/${stamp}/${Z}/${tx}/${ty}.png`;
  let data: Uint8ClampedArray | null = null;
  try {
    let blob: Blob;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      blob = await res.blob();
    } catch (err) {
      if (!Capacitor.isNativePlatform()) throw err;
      // no app, o WebView pode barrar a leitura (CORS); o pedido nativo não tem essa trava
      const res = await CapacitorHttp.get({ url, responseType: 'blob', connectTimeout: 10000, readTimeout: 15000 });
      if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
      blob = await (await fetch(`data:image/png;base64,${res.data}`)).blob();
    }
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  } catch {
    data = null; // tile vazio ou fora do ar: conta como sem raios
  }
  tileCache.set(key, data);
  if (tileCache.size > 400) tileCache.delete(tileCache.keys().next().value as string);
  return data;
}

/** Área com raios (pixels ≈ km²) num raio de 30 km da cidade, num horário. */
async function activity(stamp: string, lat: number, lon: number): Promise<number> {
  const c = worldPx(lat, lon);
  const kmPerPx = (40075 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** Z);
  const r = RADIUS_KM / kmPerPx;
  // o círculo pode cair em até 4 tiles: baixa todos antes de contar
  const tiles = new Map<string, Uint8ClampedArray | null>();
  for (const ty of new Set([Math.floor((c.y - r) / 256), Math.floor((c.y + r) / 256)]))
    for (const tx of new Set([Math.floor((c.x - r) / 256), Math.floor((c.x + r) / 256)]))
      tiles.set(`${tx}/${ty}`, await tileAlpha(stamp, tx, ty));
  let count = 0;
  for (let dy = -Math.ceil(r); dy <= r; dy++) {
    for (let dx = -Math.ceil(r); dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const wx = Math.floor(c.x + dx);
      const wy = Math.floor(c.y + dy);
      const px = tiles.get(`${Math.floor(wx / 256)}/${Math.floor(wy / 256)}`);
      if (px && px[((wy % 256) * 256 + (wx % 256)) * 4 + 3] > 0) count++;
    }
  }
  return count;
}

/** Procura salto de raios perto de cada cidade nos últimos 12 minutos. */
export async function checkLightningJumps(cities: WatchCity[]): Promise<LightningJump[]> {
  const json = JSON.parse(await getText(`${REALEARTH}/api/times?products=${PRODUCT}`));
  const times = ((json?.[PRODUCT] || []) as string[])
    .map(parseRealEarthTime)
    .filter((t) => !isNaN(t) && Date.now() - t < 30 * 60000)
    .sort((a, b) => a - b)
    .slice(-MINUTES);
  const jumps: LightningJump[] = [];
  for (const city of cities) {
    const series: number[] = [];
    for (const t of times) series.push(await activity(realEarthStamp(t), city.coords[0], city.coords[1]));
    const r = isJump(series);
    if (r.jump) jumps.push({ city: city.name, before: r.before, now: r.now });
  }
  return jumps;
}
