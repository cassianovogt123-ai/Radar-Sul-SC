// Previsão imediata ("nowcast") de 10 a 60 minutos a partir do radar de Chapecó.
//
// Como funciona (tudo no próprio aparelho, sem servidor e sem API nova):
//  1. Compara a varredura atual com a anterior e descobre para onde os ecos andaram
//     (casamento de blocos: testa vários deslocamentos e fica com o que mais "encaixa").
//  2. Empurra a imagem atual nessa direção e velocidade para +10, +20, +30, +45 e +60 min.
//
// Limitação honesta: é uma extrapolação. Não prevê células que nascem, crescem ou se
// dissipam; por isso a confiança cai com o tempo e os quadros aparecem como "PREVISÃO".
import { RadarMetadata } from '../types/radar';
import { estimateDbzFromRgb, MAX_VALID_RADAR_RANGE_KM } from './echoAnalyzer';
import { bearingToText } from './cellTracker';

export const NOWCAST_LEADS_MIN = [10, 20, 30, 45, 60] as const;

export interface EchoMotion {
  /** deslocamento em pixels da imagem por minuto (x para a direita, y para baixo) */
  pxPerMinX: number;
  pxPerMinY: number;
  speedKmh: number;
  /** direção para onde os ecos vão (0° = Norte) */
  headingDeg: number;
  headingText: string;
  /** 0–1: quão bem a imagem anterior deslocada bate com a atual */
  confidence: number;
}

export interface NowcastFrame {
  leadMin: number;
  validAt: number;
  imageUrl: string;
}

export type NowcastResult =
  | { ok: true; motion: EchoMotion; frames: NowcastFrame[]; baseTimestamp: number }
  | { ok: false; reason: string };

const GRID_STEP = 4; // ~2,4 km por célula da grade, igual ao rastreador de células
const MAX_SPEED_KMH = 110;
const MIN_ECHO_CELLS = 25;

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function geometry(meta: RadarMetadata, width: number, height: number) {
  const normX = (meta.coordinates.lon - meta.minLon) / (meta.maxLon - meta.minLon);
  const normY = (meta.maxLat - meta.coordinates.lat) / (meta.maxLat - meta.minLat);
  const kmPerPxY = ((meta.maxLat - meta.minLat) * 110.85) / height;
  const kmPerPxX = ((meta.maxLon - meta.minLon) * 111.32 * Math.cos((meta.coordinates.lat * Math.PI) / 180)) / width;
  return { cx: normX * width, cy: normY * height, kmPerPxX, kmPerPxY };
}

function readPixels(img: HTMLImageElement, width: number, height: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas indisponível');
  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

/** Grade reduzida de dBZ (0 = sem eco) dentro do alcance do radar. */
function toGrid(data: Uint8ClampedArray, meta: RadarMetadata, width: number, height: number, step: number) {
  const { cx, cy, kmPerPxY } = geometry(meta, width, height);
  const maxR = MAX_VALID_RADAR_RANGE_KM / kmPerPxY;
  const gw = Math.floor(width / step);
  const gh = Math.floor(height / step);
  const grid = new Float32Array(gw * gh);
  const half = Math.floor(step / 2);
  let count = 0;
  for (let gy = 0; gy < gh; gy++) {
    const y = gy * step + half;
    for (let gx = 0; gx < gw; gx++) {
      const x = gx * step + half;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > maxR * maxR) continue;
      const i = (y * width + x) * 4;
      if (data[i + 3] <= 40) continue;
      const dbz = estimateDbzFromRgb(data[i], data[i + 1], data[i + 2]);
      if (dbz >= 10) {
        grid[gy * gw + gx] = dbz;
        count++;
      }
    }
  }
  let energy = 0;
  for (let i = 0; i < grid.length; i++) energy += grid[i] * grid[i];
  return { grid, gw, gh, count, energy };
}

type Grid = ReturnType<typeof toGrid>;

/**
 * Pontuação de um deslocamento: sobreposição ponderada pela refletividade, dividida pela
 * energia das duas imagens (correlação normalizada simples; 1 = encaixe perfeito).
 */
function correlate(prev: Grid, curr: Grid, sx: number, sy: number): number {
  const { gw, gh } = curr;
  let s = 0;
  const y0 = Math.max(0, -sy);
  const y1 = Math.min(gh, gh - sy);
  const x0 = Math.max(0, -sx);
  const x1 = Math.min(gw, gw - sx);
  for (let y = y0; y < y1; y++) {
    const rowP = y * gw;
    const rowC = (y + sy) * gw + sx;
    for (let x = x0; x < x1; x++) {
      const p = prev.grid[rowP + x];
      if (p === 0) continue;
      const c = curr.grid[rowC + x];
      if (c !== 0) s += p * c;
    }
  }
  return s / (Math.sqrt(prev.energy * curr.energy) || 1);
}

/** Busca o melhor deslocamento numa janela e refina com parábola (subpixel). */
function searchShift(prev: Grid, curr: Grid, cx: number, cy: number, radius: number) {
  const side = 2 * radius + 1;
  const scores = new Float64Array(side * side);
  let best = -1;
  let bx = cx;
  let by = cy;
  for (let sy = cy - radius; sy <= cy + radius; sy++) {
    for (let sx = cx - radius; sx <= cx + radius; sx++) {
      const s = correlate(prev, curr, sx, sy);
      scores[(sy - cy + radius) * side + (sx - cx + radius)] = s;
      if (s > best) {
        best = s;
        bx = sx;
        by = sy;
      }
    }
  }
  const at = (sx: number, sy: number) =>
    Math.abs(sx - cx) > radius || Math.abs(sy - cy) > radius
      ? correlate(prev, curr, sx, sy)
      : scores[(sy - cy + radius) * side + (sx - cx + radius)];
  const refine = (m: number, c: number, p: number) => {
    const den = m - 2 * c + p;
    return den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (m - p)) / den)) : 0;
  };
  return {
    best,
    bx,
    by,
    fx: bx + refine(at(bx - 1, by), best, at(bx + 1, by)),
    fy: by + refine(at(bx, by - 1), best, at(bx, by + 1)),
  };
}

const FINE_STEP = 2;

/**
 * Estima o vetor de movimento médio dos ecos entre duas varreduras.
 * Retorna null quando não há eco suficiente ou o intervalo entre as varreduras é inválido.
 */
export function estimateEchoMotion(
  prevImg: HTMLImageElement,
  currImg: HTMLImageElement,
  deltaMinutes: number,
  meta: RadarMetadata
): EchoMotion | null {
  if (!(deltaMinutes > 0 && deltaMinutes <= 20)) return null;
  const width = currImg.naturalWidth || 859;
  const height = currImg.naturalHeight || 758;
  const prevPx = readPixels(prevImg, width, height);
  const currPx = readPixels(currImg, width, height);

  // 1) busca grossa (grade de ~2,4 km) em toda a faixa de velocidades possíveis
  const prev = toGrid(prevPx, meta, width, height, GRID_STEP);
  const curr = toGrid(currPx, meta, width, height, GRID_STEP);
  if (prev.count < MIN_ECHO_CELLS || curr.count < MIN_ECHO_CELLS) return null;
  const { kmPerPxX, kmPerPxY } = geometry(meta, width, height);
  const kmPerCell = ((kmPerPxX + kmPerPxY) / 2) * GRID_STEP;
  const maxShift = Math.max(2, Math.ceil(((MAX_SPEED_KMH * deltaMinutes) / 60) / kmPerCell));
  const coarse = searchShift(prev, curr, 0, 0, maxShift);
  if (coarse.best <= 0.05) return null; // nada se parece: ecos novos demais para extrapolar

  // 2) busca fina (grade de ~1,2 km) só em volta do resultado grosso
  const ratio = GRID_STEP / FINE_STEP;
  const prevF = toGrid(prevPx, meta, width, height, FINE_STEP);
  const currF = toGrid(currPx, meta, width, height, FINE_STEP);
  const fine = searchShift(prevF, currF, coarse.bx * ratio, coarse.by * ratio, ratio + 1);
  const fx = fine.fx / ratio;
  const fy = fine.fy / ratio;
  const best = Math.max(coarse.best, fine.best);

  const pxPerMinX = (fx * GRID_STEP) / deltaMinutes;
  const pxPerMinY = (fy * GRID_STEP) / deltaMinutes;
  const kmhEast = pxPerMinX * kmPerPxX * 60;
  const kmhNorth = -pxPerMinY * kmPerPxY * 60;
  const speedKmh = Math.round(Math.hypot(kmhEast, kmhNorth));
  const headingDeg = Math.round(((Math.atan2(kmhEast, kmhNorth) * 180) / Math.PI + 360) % 360);
  return {
    pxPerMinX,
    pxPerMinY,
    speedKmh,
    headingDeg,
    headingText: speedKmh < 3 ? 'Parados' : bearingToText(headingDeg),
    confidence: Math.max(0, Math.min(1, best)),
  };
}

/** Desenha a imagem atual deslocada; marca os quadros previstos com listras (tracejado). */
function renderShifted(img: HTMLImageElement, meta: RadarMetadata, dx: number, dy: number, fade: number): string {
  const width = img.naturalWidth || 859;
  const height = img.naturalHeight || 758;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas indisponível');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(dx), Math.round(dy));

  const { cx, cy, kmPerPxY } = geometry(meta, width, height);
  const maxR = MAX_VALID_RADAR_RANGE_KM / kmPerPxY;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let y = 0; y < height; y++) {
    const ddy = y - cy;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (d[i + 3] === 0) continue;
      const ddx = x - cx;
      if (ddx * ddx + ddy * ddy > maxR * maxR) {
        d[i + 3] = 0; // fora do alcance do radar: não inventa eco
        continue;
      }
      // listras diagonais deixam claro que é estimativa, não observação
      const stripe = (x + y) % 10 < 3 ? 0.35 : 1;
      d[i + 3] = Math.round(d[i + 3] * fade * stripe);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Monta os quadros de previsão a partir da varredura atual e da anterior. */
export async function buildNowcast(
  current: { imageUrl: string; timestamp: number },
  previous: { imageUrl: string; timestamp: number } | null,
  meta: RadarMetadata
): Promise<NowcastResult> {
  if (!previous) return { ok: false, reason: 'Aguardando a varredura anterior para medir o movimento.' };
  const deltaMin = (current.timestamp - previous.timestamp) / 60000;
  if (!(deltaMin > 0 && deltaMin <= 20)) {
    return { ok: false, reason: 'Varreduras muito espaçadas para medir o movimento com segurança.' };
  }
  const [currImg, prevImg] = await Promise.all([loadImage(current.imageUrl), loadImage(previous.imageUrl)]);
  if (!currImg || !prevImg) return { ok: false, reason: 'Não foi possível ler as imagens do radar.' };

  let motion: EchoMotion | null;
  try {
    motion = estimateEchoMotion(prevImg, currImg, deltaMin, meta);
  } catch {
    return { ok: false, reason: 'Não foi possível ler as imagens do radar.' };
  }
  if (!motion) return { ok: false, reason: 'Poucos ecos ou ecos novos demais para projetar.' };

  const frames: NowcastFrame[] = [];
  for (const lead of NOWCAST_LEADS_MIN) {
    // a confiança cai com o tempo: o quadro fica mais transparente
    const fade = Math.max(0.45, 0.95 - (lead / 60) * 0.4);
    frames.push({
      leadMin: lead,
      validAt: current.timestamp + lead * 60000,
      imageUrl: renderShifted(currImg, meta, motion.pxPerMinX * lead, motion.pxPerMinY * lead, fade),
    });
    // devolve o controle ao navegador entre um quadro e outro (não trava a tela)
    await new Promise((r) => setTimeout(r, 0));
  }
  return { ok: true, motion, frames, baseTimestamp: current.timestamp };
}
