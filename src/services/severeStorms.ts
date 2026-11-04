// Núcleos de tempestade severa (≥ 55 dBZ: vermelho/roxo na paleta da Defesa Civil SC)
// e o rastro por onde passaram nas últimas horas. Só refletividade: indica chuva muito
// forte e possível granizo/ventania, mas NÃO confirma tornado (isso exige velocidade Doppler).
import { RadarMetadata } from '../types/radar';
import { extractCellsFromImage } from '../utils/cellTracker';
import { fetchPreviousRadarFrame, previousRadarFrameInfo } from './radarDirect';

export const SEVERE_DBZ = 55;
const TRACK_WINDOW_MIN = 120;
const MAX_FRAMES_BACK = 30;

export interface SevereCore {
  lat: number;
  lon: number;
  maxDbz: number;
  radiusKm: number;
  timestamp: number;
}

// Cada varredura é analisada uma vez só (por nome de arquivo)
const coresByFile = new Map<string, SevereCore[]>();

async function coresOf(frame: { filename: string; imageUrl: string; timestamp: number }, meta: RadarMetadata) {
  const cached = coresByFile.get(frame.filename);
  if (cached) return cached;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const ok = await new Promise<boolean>((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = frame.imageUrl;
  });
  if (!ok) return [];
  const cores = extractCellsFromImage(img, meta, SEVERE_DBZ).map((c) => ({
    lat: c.centroidLat,
    lon: c.centroidLon,
    maxDbz: c.maxDbz,
    radiusKm: c.radiusKm,
    timestamp: frame.timestamp,
  }));
  coresByFile.set(frame.filename, cores);
  if (coresByFile.size > MAX_FRAMES_BACK + 5) coresByFile.delete(coresByFile.keys().next().value as string);
  return cores;
}

/** Núcleos severos da varredura atual + rastro das varreduras das últimas 2 horas. */
export async function loadSevereStorms(
  latest: { filename: string; imageUrl: string; timestamp: number },
  meta: RadarMetadata
): Promise<{ now: SevereCore[]; track: SevereCore[] }> {
  const now = await coresOf(latest, meta);
  const track: SevereCore[] = [];
  for (let k = 1; k <= MAX_FRAMES_BACK; k++) {
    const info = previousRadarFrameInfo(latest.filename, k);
    if (!info || latest.timestamp - info.timestamp > TRACK_WINDOW_MIN * 60000) break;
    let cores = coresByFile.get(info.filename);
    if (!cores) {
      const frame = await fetchPreviousRadarFrame(latest.filename, k).catch(() => null);
      cores = frame?.imageUrl ? await coresOf(frame, meta) : [];
    }
    track.push(...cores);
  }
  return { now, track };
}
