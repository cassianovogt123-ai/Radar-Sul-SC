// Chuva acumulada ESTIMADA pelo radar de Chapecó (1 h, 3 h, 6 h e 24 h) por município.
// Cada varredura vira uma taxa de chuva (mm/h) pela relação Z-R de Marshall-Palmer
// (Z = 200·R^1,6), média num círculo de 3 km em volta da cidade. A soma no tempo dá o
// acumulado. É estimativa: a paleta da imagem tem degraus de ~5 dBZ, e o radar mede no
// alto, não no chão — os pluviômetros (aba Rios) continuam sendo a medida oficial.
import { RadarMetadata } from '../types/radar';
import { estimateDbzFromRgb } from '../utils/echoAnalyzer';
import { fetchPreviousRadarFrame, previousRadarFrameInfo } from './radarDirect';

export interface RainCity {
  name: string;
  coords: [number, number];
}

export interface RadarRainfall {
  /** mm estimados por cidade em cada janela */
  sums: Record<string, { h1: number; h3: number; h6: number; h24: number; rateNow: number }>;
  /** minutos de varreduras que entraram na conta (o app só soma o que já viu) */
  coverageMin: number;
  updatedAt: number;
}

const STORE_KEY = 'vogt.chuvaRadar.v1';
const KEEP_MS = 26 * 3600000;
const BACKFILL_MIN = 180; // na primeira vez, busca até 3 h de varreduras para trás
const MAX_FRAMES_BACK = 40;
const MAX_GAP_MIN = 15; // buraco maior que isso entre varreduras não é somado inteiro
const CITY_RADIUS_KM = 3;

type Entry = { t: number; r: Record<string, number> };
type Store = Record<string, Entry>;

function readStore(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}

function writeStore(s: Store) {
  const cut = Date.now() - KEEP_MS;
  for (const k of Object.keys(s)) if (!(s[k]?.t > cut)) delete s[k];
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* sem espaço / modo privado: segue só em memória */
  }
}

/** Marshall-Palmer: abaixo de 15 dBZ não conta; teto em 55 dBZ para o granizo não inflar a conta. */
export function dbzToRainRate(dbz: number): number {
  if (dbz < 15) return 0;
  const z = Math.pow(10, Math.min(dbz, 55) / 10);
  return Math.pow(z / 200, 1 / 1.6);
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Taxa média de chuva (mm/h) num círculo em volta de cada cidade. */
export function cityRatesFromImage(img: HTMLImageElement, meta: RadarMetadata, cities: RainCity[]): Record<string, number> {
  const width = img.naturalWidth || 859;
  const height = img.naturalHeight || 758;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return {};
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, width, height).data;
  const pxPerKm = height / ((meta.maxLat - meta.minLat) * 110.85);
  const rad = Math.max(1, Math.round(CITY_RADIUS_KM * pxPerKm));
  const out: Record<string, number> = {};
  for (const c of cities) {
    const cx = Math.round(((c.coords[1] - meta.minLon) / (meta.maxLon - meta.minLon)) * width);
    const cy = Math.round(((meta.maxLat - c.coords[0]) / (meta.maxLat - meta.minLat)) * height);
    let sum = 0;
    let n = 0;
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        n++;
        const i = (y * width + x) * 4;
        if (data[i + 3] <= 40) continue; // sem eco
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r === g && g === b) continue; // linhas/rótulos cinza ou brancos não são chuva
        sum += dbzToRainRate(estimateDbzFromRgb(r, g, b));
      }
    }
    out[c.name] = n ? Math.round((sum / n) * 100) / 100 : 0;
  }
  return out;
}

/** Soma a chuva das varreduras guardadas (trapézio entre varreduras vizinhas). */
export function accumulate(entries: Entry[], cities: RainCity[], now: number): RadarRainfall {
  const list = entries.filter((e) => now - e.t <= 24 * 3600000).sort((a, b) => a.t - b.t);
  const sums: RadarRainfall['sums'] = {};
  for (const c of cities) sums[c.name] = { h1: 0, h3: 0, h6: 0, h24: 0, rateNow: list[list.length - 1]?.r[c.name] ?? 0 };
  let coverageMin = 0;
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1];
    const b = list[i];
    const gapMin = (b.t - a.t) / 60000;
    if (gapMin <= 0) continue;
    const dtH = Math.min(gapMin, MAX_GAP_MIN) / 60;
    coverageMin += dtH * 60;
    const age = now - a.t; // intervalo conta na janela só se começou dentro dela
    for (const c of cities) {
      const mm = (((a.r[c.name] ?? 0) + (b.r[c.name] ?? 0)) / 2) * dtH;
      const s = sums[c.name];
      s.h24 += mm;
      if (age <= 6 * 3600000) s.h6 += mm;
      if (age <= 3 * 3600000) s.h3 += mm;
      if (age <= 3600000) s.h1 += mm;
    }
  }
  for (const s of Object.values(sums)) {
    s.h1 = Math.round(s.h1 * 10) / 10;
    s.h3 = Math.round(s.h3 * 10) / 10;
    s.h6 = Math.round(s.h6 * 10) / 10;
    s.h24 = Math.round(s.h24 * 10) / 10;
  }
  return { sums, coverageMin: Math.round(coverageMin), updatedAt: now };
}

/**
 * Atualiza a conta com a varredura atual e, se faltar, com as anteriores (até 3 h para trás).
 * As taxas ficam guardadas no aparelho, então a janela de 24 h vai se completando com o uso.
 */
export async function loadRadarRainfall(
  latest: { filename: string; imageUrl: string; timestamp: number },
  meta: RadarMetadata,
  cities: RainCity[]
): Promise<RadarRainfall> {
  const store = readStore();
  const add = async (filename: string, timestamp: number, imageUrl: string) => {
    if (store[filename]) return;
    const img = await loadImg(imageUrl);
    if (img) store[filename] = { t: timestamp, r: cityRatesFromImage(img, meta, cities) };
  };
  await add(latest.filename, latest.timestamp, latest.imageUrl);
  for (let k = 1; k <= MAX_FRAMES_BACK; k++) {
    const info = previousRadarFrameInfo(latest.filename, k);
    if (!info || latest.timestamp - info.timestamp > BACKFILL_MIN * 60000) break;
    if (store[info.filename]) continue;
    const frame = await fetchPreviousRadarFrame(latest.filename, k).catch(() => null);
    if (frame?.imageUrl) await add(info.filename, info.timestamp, frame.imageUrl);
  }
  writeStore(store);
  return accumulate(Object.values(store), cities, latest.timestamp);
}
