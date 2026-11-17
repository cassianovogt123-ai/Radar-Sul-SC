// Aviso com o app FECHADO (Android): roda no "Background Runner" do Capacitor, um motor de
// JavaScript sem tela que o Android acorda a cada ~15 min (o horário exato quem decide é o
// sistema, para poupar bateria). Consulta os alertas oficiais e dispara a notificação.
//
// - Defesa Civil (IDAP): qualquer alerta que cubra uma das cidades monitoradas (radar + família).
// - INMET: só "Perigo" e "Grande perigo" (o "Perigo potencial" cobre centenas de cidades
//   quase todo dia e viraria ruído com o app fechado; com o app aberto ele continua avisando).
// - Severidade extrema vai pelo canal "Alerta extremo" (som e vibração fortes).
//
// Este arquivo vira dist/runners/alertas.js (formato IIFE) no build — ver vite.config.ts.
import { alertCoversCity, parseCapFeed, type CapAlert } from '../services/capAlerts';
import { INMET_ALERTS_URL, normalizeInmet } from '../services/inmetParser';
import { FAMILY_CITIES, NEARBY_CITIES } from '../cities';

// cidades da área do radar + cidades da família (mesmas do aviso de salto de raios)
const WATCHED: { name: string; state: string; coords: [number, number]; ibge?: string }[] = [...NEARBY_CITIES, ...FAMILY_CITIES];

declare const addEventListener: (event: string, handler: (resolve: () => void, reject: (e?: unknown) => void, args: unknown) => void) => void;
declare const CapacitorKV: { get(key: string): { value: string } | null; set(key: string, value: string): void };
declare const CapacitorNotifications: { schedule(n: Record<string, unknown>[]): void };

const IDAP_FEED_URL = 'https://idapfile.mdr.gov.br/idap/api/rss/cap';
const SEEN_KEY = 'alertasVistos';
const FIRST_RUN_WINDOW_MS = 2 * 3600000; // na 1ª execução, só avisa o que saiu nas últimas 2 h
const MAX_AGE_MS = 12 * 3600000;
export const EXTREME_CHANNEL = 'alerta-extremo';

const coversWatched = (a: CapAlert) => WATCHED.some((c) => alertCoversCity(a, c.name, c.state, c.coords, c.ibge));

const citiesOf = (a: CapAlert) =>
  WATCHED.filter((c) => alertCoversCity(a, c.name, c.state, c.coords, c.ibge)).map((c) => c.name);

/** Escolhe o que notificar: alertas novos (não vistos) que cobrem as cidades monitoradas. */
export function pickNew(
  dc: CapAlert[],
  inmet: CapAlert[],
  seen: Record<string, number> | null,
  now = Date.now()
): CapAlert[] {
  const relevant = [
    ...dc.filter(coversWatched),
    ...inmet.filter((a) => (a.severity === 'Severe' || a.severity === 'Extreme') && coversWatched(a)),
  ];
  return relevant.filter((a) => {
    if (seen && a.id in seen) return false;
    // alerta antigo que só agora apareceu (ex.: a fonte estava fora do ar) não vira notificação
    const sent = Date.parse(a.sent);
    return Number.isFinite(sent) && now - sent <= (seen ? MAX_AGE_MS : FIRST_RUN_WINDOW_MS);
  });
}

export function notificationFor(a: CapAlert, id: number): Record<string, unknown> {
  const from = a.source === 'inmet' ? 'INMET' : 'Defesa Civil';
  const where = citiesOf(a).slice(0, 4).join(', ');
  const n: Record<string, unknown> = {
    id,
    title: `${a.severity === 'Extreme' ? 'ALERTA EXTREMO · ' : ''}${from}: ${a.event}`,
    body: `${where ? where + ' · ' : ''}${a.headline || a.severityLabel || 'Alerta oficial ativo'}`.slice(0, 240),
    autoCancel: true,
  };
  const largeBody = [a.headline, a.instruction].filter(Boolean).join('\n\n').slice(0, 1500);
  if (largeBody) n.largeBody = largeBody; // o lado nativo não aceita campo nulo
  if (a.severity === 'Extreme') n.channelId = EXTREME_CHANNEL;
  return n;
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function readSeen(): Record<string, number> | null {
  try {
    const raw = CapacitorKV.get(SEEN_KEY)?.value;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

addEventListener('checarAlertas', async (resolve, reject) => {
  try {
    const now = Date.now();
    // as duas fontes são independentes: se uma cair, a outra ainda avisa
    let ok = 0;
    const [dc, inmet] = await Promise.all([
      getText(IDAP_FEED_URL).then((xml) => (ok++, parseCapFeed(xml)), () => [] as CapAlert[]),
      getText(INMET_ALERTS_URL).then((t) => (ok++, normalizeInmet(JSON.parse(t))), () => [] as CapAlert[]),
    ]);
    if (!ok) return resolve(); // sem internet: tenta de novo na próxima rodada
    const seen = readSeen();
    const fresh = pickNew(dc, inmet, seen, now);
    if (fresh.length) {
      let id = Math.floor(now / 1000) % 1000000;
      CapacitorNotifications.schedule(fresh.slice(0, 3).map((a) => notificationFor(a, id++)));
    }
    // guarda os ids vistos (os de mais de 3 dias saem da lista)
    const next: Record<string, number> = {};
    for (const [k, t] of Object.entries(seen || {})) if (now - t < 3 * 86400000) next[k] = t;
    for (const a of [...dc, ...inmet]) next[a.id] = next[a.id] ?? now;
    CapacitorKV.set(SEEN_KEY, JSON.stringify(next));
    resolve();
  } catch (err) {
    reject(err);
  }
});
