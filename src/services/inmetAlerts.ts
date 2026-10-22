// Avisos meteorológicos oficiais do INMET (mesma fonte do portal alertas2.inmet.gov.br).
// Observação: o INMET só responde a acessos feitos do Brasil.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { apiUrl } from '../config';
import { DIRECT_MODE } from './radarDirect';
import type { CapAlert } from './capAlerts';
import { INMET_ALERTS_URL, normalizeInmet } from './inmetParser';

const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; alerts: CapAlert[] } | null = null;
let inflight: Promise<CapAlert[]> | null = null;

async function download(): Promise<CapAlert[]> {
  if (!DIRECT_MODE) {
    // Versão web (ex.: iPhone pela Tela de Início): o INMET só atende acessos do Brasil,
    // e o servidor pode estar fora do país. Tenta primeiro direto do aparelho do usuário.
    try {
      const direct = await fetch(INMET_ALERTS_URL, { signal: AbortSignal.timeout(12000) });
      if (direct.ok) return normalizeInmet(await direct.json());
    } catch {
      /* sem acesso direto (bloqueio do navegador ou fora do Brasil): usa o servidor */
    }
    const res = await fetch(apiUrl('/api/alertas/inmet'));
    if (!res.ok) throw new Error(`Servidor retornou HTTP ${res.status}`);
    return (await res.json()).alerts as CapAlert[];
  }
  let data: any;
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url: INMET_ALERTS_URL,
      headers: { Accept: 'application/json' },
      responseType: 'json',
      connectTimeout: 15000,
      readTimeout: 30000,
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`INMET retornou HTTP ${res.status}`);
    data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  } else {
    const res = await fetch(INMET_ALERTS_URL);
    if (!res.ok) throw new Error(`INMET retornou HTTP ${res.status}`);
    data = await res.json();
  }
  return normalizeInmet(data);
}

/** Avisos ativos do INMET (hoje e próximos dias), guardados por 10 min. */
export async function fetchInmetAlerts(force = false): Promise<{ alerts: CapAlert[]; at: number }> {
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
