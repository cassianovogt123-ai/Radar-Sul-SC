// Leitor dos alertas oficiais da Defesa Civil (feed nacional IDAP, formato CAP 1.2).
// Código puro (sem DOM), usado tanto pelo app quanto pelo servidor da versão web.

import type { HazardId, RiskLevel } from './forecast';

export interface CapArea {
  desc: string;
  /** cada polígono = lista de [lat, lon] */
  polygons: [number, number][][];
}

export interface CapAlert {
  id: string;
  /** origem do alerta */
  source?: 'defesa_civil' | 'inmet';
  /** rótulo de severidade da própria fonte (ex.: INMET "Perigo potencial") */
  severityLabel?: string;
  /** municípios afetados por código IBGE (quando a fonte informa) */
  geocodes?: string[];
  /** riscos listados pela fonte */
  risks?: string[];
  sender: string; // ex.: "Defesa Civil Estadual de Santa Catarina"
  event: string; // ex.: "TEMPESTADE LOCAL/CONVECTIVA - CHUVAS INTENSAS"
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
  urgency: string;
  certainty: string;
  sent: string;
  onset: string;
  expires: string;
  headline: string;
  description: string;
  instruction: string;
  web: string;
  areas: CapArea[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .trim();

const tag = (xml: string, name: string): string => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
};
const tags = (xml: string, name: string): string[] =>
  Array.from(xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g')), (m) => m[1]);

function parsePolygon(text: string): [number, number][] {
  const pts: [number, number][] = [];
  for (const pair of text.trim().split(/\s+/)) {
    const [la, lo] = pair.split(',').map(Number);
    if (Number.isFinite(la) && Number.isFinite(lo)) pts.push([la, lo]);
  }
  return pts;
}

/**
 * Lê o feed e devolve só os alertas ATIVOS cujas áreas pertencem às UFs pedidas
 * (descrição terminando em "/SC", "/PR"...). Cancelamentos e vencidos ficam de fora.
 */
export function parseCapFeed(xml: string, ufs: string[] = ['SC', 'PR', 'RS'], now = Date.now()): CapAlert[] {
  const ufRe = new RegExp(`/(${ufs.join('|')})\\s*$`, 'i');
  const out: CapAlert[] = [];
  for (const entry of tags(xml, 'entry')) {
    // filtro barato antes de ler o XML inteiro da entrada
    const descs = tags(entry, 'areaDesc').map(decode);
    if (!descs.some((d) => d.split(',').some((p) => ufRe.test(p.trim())))) continue;
    if (/<msgType>\s*Cancel\s*<\/msgType>/i.test(entry)) continue;
    const info = tags(entry, 'info')[0] ?? entry;
    const expires = tag(info, 'expires');
    if (expires && Date.parse(expires) < now) continue;
    const areas: CapArea[] = tags(info, 'area').map((a) => ({
      desc: tag(a, 'areaDesc'),
      polygons: tags(a, 'polygon').map((p) => parsePolygon(decode(p))).filter((p) => p.length >= 3),
    }));
    const sev = tag(info, 'severity') as CapAlert['severity'];
    out.push({
      id: tag(entry, 'identifier') || tag(entry, 'id'),
      sender: tag(info, 'senderName') || tag(entry, 'sender'),
      event: tag(info, 'event') || tag(entry, 'title'),
      severity: ['Extreme', 'Severe', 'Moderate', 'Minor'].includes(sev) ? sev : 'Unknown',
      urgency: tag(info, 'urgency'),
      certainty: tag(info, 'certainty'),
      sent: tag(entry, 'sent'),
      onset: tag(info, 'onset'),
      expires,
      headline: tag(info, 'headline'),
      description: tag(info, 'description'),
      instruction: tag(info, 'instruction'),
      web: tag(info, 'web'),
      areas,
    });
  }
  return out;
}

function pointInPolygon(lat: number, lon: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** O alerta cobre o município? (código IBGE; senão ponto dentro de algum polígono; senão pelo nome) */
export function alertCoversCity(
  alert: CapAlert,
  cityName: string,
  state: string,
  coords: [number, number],
  ibge?: string
): boolean {
  if (ibge && alert.geocodes && alert.geocodes.length) return alert.geocodes.includes(ibge);
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  for (const area of alert.areas) {
    if (area.polygons.length) {
      if (area.polygons.some((p) => pointInPolygon(coords[0], coords[1], p))) return true;
    } else {
      const names = area.desc.split(',').map(norm);
      if (names.includes(norm(`${cityName}/${state}`))) return true;
    }
  }
  return false;
}

const SEVERITY_ORDER = ['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'];
export const sortAlerts = (a: CapAlert[]) =>
  [...a].sort(
    (x, y) => SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity) || Date.parse(y.sent) - Date.parse(x.sent)
  );

export const SEVERITY_INFO: Record<CapAlert['severity'], { label: string; risk: RiskLevel }> = {
  Extreme: { label: 'Risco muito alto', risk: 'muito_alto' },
  Severe: { label: 'Risco alto', risk: 'alto' },
  Moderate: { label: 'Risco moderado', risk: 'moderado' },
  Minor: { label: 'Risco baixo', risk: 'baixo' },
  Unknown: { label: 'Aviso', risk: 'moderado' },
};

/** Quais tipos de desastre um alerta oficial indica (pelo nome do evento) */
export function hazardsOfAlert(alert: CapAlert): HazardId[] {
  const e = alert.event.toUpperCase();
  // riscos que a própria fonte lista (ex.: INMET "Tempestade" cita chuva forte e granizo)
  const r = (alert.risks || []).join(' ').toUpperCase();
  const out = new Set<HazardId>();
  if (/GRANIZO/.test(r)) out.add('granizo');
  if (/MM\/H|MM\/DIA|ALAGAMENTO|ENXURRADA/.test(r)) out.add('alagamento');
  if (/DESLIZAMENTO/.test(r)) out.add('deslizamento');
  if (/VENTOS?|RAJADA/.test(r)) out.add('vendaval');
  if (/DESCARGAS? EL[ÉE]TRICA|RAIO/.test(r)) out.add('raios');
  if (/CHUVA|ALAGAMENTO|ENXURRADA|INUNDA/.test(e)) out.add('alagamento');
  if (/DESLIZAMENTO|MOVIMENTO DE MASSA|QUEDA DE BLOCOS|CORRIDA DE MASSA|ACUMULADO DE CHUVA/.test(e)) out.add('deslizamento');
  if (/VENDAVAL|VENTOS? COSTEIRO|CICLONE|TORNADO/.test(e)) out.add('vendaval');
  if (/GRANIZO/.test(e)) out.add('granizo');
  if (/TEMPESTADE|RAIO|DESCARGA/.test(e)) {
    out.add('raios');
    out.add('vendaval');
  }
  return [...out];
}
