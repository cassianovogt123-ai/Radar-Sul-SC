// Busca os alertas oficiais da Defesa Civil (feed nacional IDAP).
// - APK (Android): HTTP nativo (o feed não libera acesso direto de páginas web).
// - App Windows: fetch direto (a janela já libera esse acesso).
// - Versão web: o servidor do app busca, filtra e devolve só o necessário.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { apiUrl } from '../config';
import { DIRECT_MODE } from './radarDirect';
import { CapAlert, parseCapFeed } from './capAlerts';

export const IDAP_FEED_URL = 'https://idapfile.mdr.gov.br/idap/api/rss/cap';
const CACHE_MS = 15 * 60 * 1000;

let cache: { at: number; alerts: CapAlert[] } | null = null;
let inflight: Promise<CapAlert[]> | null = null;

async function download(): Promise<CapAlert[]> {
  if (!DIRECT_MODE) {
    const res = await fetch(apiUrl('/api/alertas/defesa-civil'));
    if (!res.ok) throw new Error(`Servidor retornou HTTP ${res.status}`);
    const data = await res.json();
    return data.alerts as CapAlert[];
  }
  let xml: string;
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url: IDAP_FEED_URL,
      responseType: 'text',
      connectTimeout: 15000,
      readTimeout: 60000,
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`Defesa Civil retornou HTTP ${res.status}`);
    xml = typeof res.data === 'string' ? res.data : String(res.data ?? '');
  } else {
    const res = await fetch(IDAP_FEED_URL);
    if (!res.ok) throw new Error(`Defesa Civil retornou HTTP ${res.status}`);
    xml = await res.text();
  }
  return parseCapFeed(xml);
}

/** Alertas ativos em SC/PR/RS (guardados por 15 min para não baixar o feed toda hora). */
export async function fetchDefesaCivilAlerts(force = false): Promise<{ alerts: CapAlert[]; at: number }> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache;
  if (!inflight) {
    inflight = download().finally(() => {
      inflight = null;
    });
  }
  const alerts = await inflight;
  cache = { at: Date.now(), alerts };
  return cache;
}

export const getCachedAlerts = () => cache;
