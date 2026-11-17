// Tempestade severa (núcleo ≥ 55 dBZ, o mesmo do mapa) no município ou perto dele, com o app FECHADO.
// Roda dentro do aviso em segundo plano (alertas.ts): baixa a última varredura do radar de Chapecó
// direto da Defesa Civil SC, decodifica o PNG sem tela e procura os núcleos.
import { decodePng } from './png';
import { extractCellsFromPixels } from '../utils/cellTracker';
import { CHAPECO_RADAR_META } from '../cities';

const SIFAP = 'https://sifap.defesacivil.sc.gov.br/radarsc/rest/radar';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  Referer: 'https://sifap.defesacivil.sc.gov.br/radarsc/',
};
export const SEVERE_DBZ = 55;
export const IN_CITY_KM = 5; // borda do núcleo a até 5 km do centro da cidade = "no município"
export const NEAR_KM = 25; // até 25 km = "perto"
const MAX_SCAN_AGE_MS = 30 * 60000; // varredura velha não vira aviso
const REPEAT_MS = 60 * 60000; // mesma cidade, mesmo nível: no máximo 1 aviso por hora

export type City = { name: string; coords: [number, number] };
export type Core = { lat: number; lon: number; radiusKm: number };
export type Seen = Record<string, { at: number; level: 'perto' | 'dentro'; km: number }>;

/** Nome da varredura → horário (UTC), igual ao app. */
export function scanTime(name: string): number {
  const m = name.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
}

/** Pixels RGBA do PNG, com o mesmo filtro do app: preto (sem eco) e cinza (não é chuva) ficam transparentes. */
export function decodeRadarPng(buf: ArrayBuffer): { data: Uint8Array; width: number; height: number } {
  const png = decodePng(buf);
  const d = png.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] <= 5 && d[i + 1] <= 5 && d[i + 2] <= 5) d[i + 3] = 0;
    else if (d[i] === d[i + 1] && d[i + 1] === d[i + 2] && d[i] >= 120 && d[i] <= 230) d[i + 3] = 0;
  }
  return png;
}

export function severeCores(px: { data: Uint8Array; width: number; height: number }): Core[] {
  return extractCellsFromPixels(px.data, px.width, px.height, CHAPECO_RADAR_META, SEVERE_DBZ).map((c) => ({
    lat: c.centroidLat,
    lon: c.centroidLon,
    radiusKm: c.radiusKm,
  }));
}

function km(a: [number, number], b: [number, number]): number {
  const dy = (a[0] - b[0]) * 110.85;
  const dx = (a[1] - b[1]) * 111.32 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * Para cada cidade, a distância até a borda do núcleo mais próximo, e quais merecem aviso agora.
 * Avisa quando entra em "perto" ou "dentro", quando passa de "perto" para "dentro", e repete no
 * máximo a cada hora se continuar. `seen` volta atualizado para a próxima rodada.
 */
export function pickStormNotices(cores: Core[], cities: City[], seen: Seen, now: number) {
  const out: { city: string; level: 'perto' | 'dentro'; km: number; closer: boolean }[] = [];
  const next: Seen = {};
  for (const c of cities) {
    let best = Infinity;
    for (const k of cores) best = Math.min(best, Math.max(0, km(c.coords, [k.lat, k.lon]) - k.radiusKm));
    if (best > NEAR_KM) continue; // longe: esquece, para avisar de novo se outra vier
    const level = best <= IN_CITY_KM ? 'dentro' : 'perto';
    const prev = seen[c.name];
    const kmR = Math.round(best);
    if (!prev || (level === 'dentro' && prev.level === 'perto') || now - prev.at >= REPEAT_MS) {
      out.push({ city: c.name, level, km: kmR, closer: !!prev && kmR < prev.km });
      next[c.name] = { at: now, level, km: kmR };
    } else {
      next[c.name] = { ...prev, km: kmR };
    }
  }
  return { notices: out, seen: next };
}

export function stormNotification(n: { city: string; level: 'perto' | 'dentro'; km: number; closer: boolean }, id: number, channelId: string) {
  return {
    id,
    title:
      n.level === 'dentro'
        ? `Tempestade severa em ${n.city}`
        : `Tempestade severa ${n.closer ? 'se aproximando de' : 'perto de'} ${n.city} (~${n.km} km)`,
    body: 'Núcleo de 55 dBZ: chuva muito forte, possível granizo e ventania. Não confirma tornado.',
    largeBody:
      'Núcleo de 55 dBZ no radar de Chapecó: chuva muito forte, possível granizo e ventania.\n\n' +
      'O radar público mostra só a intensidade da chuva: não confirma tornado. Siga os alertas da Defesa Civil.',
    autoCancel: true,
    ...(n.level === 'dentro' ? { channelId } : {}),
  };
}

/** Baixa a última varredura e devolve os núcleos severos (null se não deu ou se a varredura é velha). */
export async function latestSevereCores(now: number): Promise<{ file: string; cores: Core[] } | null> {
  const listRes = await fetch(`${SIFAP}/getUltimasImagens?prod=0&radar=CHP&data=`, { headers: { ...HEADERS, Accept: 'application/json' } });
  if (!listRes.ok) return null;
  const list = (await listRes.json()) as string[];
  if (!Array.isArray(list) || !list.length) return null;
  const file = [...list].sort()[list.length - 1];
  if (!(now - scanTime(file) <= MAX_SCAN_AGE_MS)) return null;
  const img = await fetch(`${SIFAP}/getImagem?prod=0&radar=CHP&file=${encodeURIComponent(file)}`, { headers: HEADERS });
  if (!img.ok) return null;
  return { file, cores: severeCores(decodeRadarPng(await img.arrayBuffer())) };
}
