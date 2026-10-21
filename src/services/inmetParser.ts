// Leitor dos avisos do INMET (código puro, sem dependências do navegador),
// usado pelo app e pelo servidor da versão web.
// Endpoint público: https://apiprevmet3.inmet.gov.br/avisos/ativos -> { hoje: [...], futuro: [...] }
// Cada aviso traz os municípios por código IBGE (geocodes) e a área em GeoJSON (poligono).
import type { CapAlert } from './capAlerts';

export const INMET_ALERTS_URL = 'https://apiprevmet3.inmet.gov.br/avisos/ativos';
export const INMET_PORTAL_URL = 'https://alertas2.inmet.gov.br';

const SEVERITY: Record<string, CapAlert['severity']> = {
  'perigo potencial': 'Moderate',
  perigo: 'Severe',
  'grande perigo': 'Extreme',
};

const asList = (v: unknown): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v)
    .split(/\n|;(?=\s)/)
    .map((x) => x.trim())
    .filter(Boolean);
};

/** Datas do INMET: ISO, "AAAA-MM-DD HH:MM:SS(.0)" (horário de Brasília) ou data + hora separadas. */
function toIso(date: unknown, time?: unknown): string {
  if (!date) return '';
  let s = String(date).trim();
  if (time && /^\d{4}-\d{2}-\d{2}$/.test(s)) s += ' ' + String(time).trim();
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) && !isNaN(Date.parse(s))) return new Date(s).toISOString();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}-03:00`;
  const d = Date.parse(s);
  return isNaN(d) ? '' : new Date(d).toISOString();
}

function geojsonToPolygons(raw: unknown): [number, number][][] {
  let g: any = raw;
  if (typeof g === 'string') {
    try {
      g = JSON.parse(g);
    } catch {
      return [];
    }
  }
  if (!g || typeof g !== 'object') return [];
  if (g.type === 'Feature') g = g.geometry;
  if (g?.type === 'FeatureCollection') return (g.features || []).flatMap((f: any) => geojsonToPolygons(f.geometry));
  const polys: any[] = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
  // anel externo de cada polígono; GeoJSON é [lon, lat] -> [lat, lon]
  return polys
    .map((p) => (Array.isArray(p?.[0]) ? p[0] : []).map((c: number[]) => [Number(c[1]), Number(c[0])] as [number, number]))
    .filter((r: [number, number][]) => r.length >= 3);
}

export function normalizeInmet(data: any, now = Date.now()): CapAlert[] {
  const items: any[] = [...(data?.hoje || []), ...(data?.futuro || [])];
  const out: CapAlert[] = [];
  const seen = new Set<string>();
  for (const a of items) {
    const id = String(a.id_aviso ?? a.id ?? '');
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const expires = toIso(a.fim ?? a.data_fim, a.hora_fim);
    if (expires && Date.parse(expires) < now) continue;
    const sevText = String(a.severidade || '').trim();
    const risks = asList(a.riscos);
    const instr = asList(a.instrucoes);
    out.push({
      id: `inmet-${id}`,
      source: 'inmet',
      sender: 'INMET',
      event: String(a.descricao || 'Aviso meteorológico'),
      severity: SEVERITY[sevText.toLowerCase()] ?? 'Unknown',
      severityLabel: sevText || undefined,
      urgency: '',
      certainty: '',
      sent: toIso(a.data_cadastro ?? a.inicio ?? a.data_inicio, a.hora_inicio),
      onset: toIso(a.inicio ?? a.data_inicio, a.hora_inicio),
      expires,
      headline: '',
      description: risks.join(' '),
      instruction: instr.join(' '),
      web: id ? `${INMET_PORTAL_URL}/${encodeURIComponent(id)}` : INMET_PORTAL_URL,
      geocodes: String(a.geocodes || '')
        .split(/[,\s]+/)
        .map((x) => x.trim())
        .filter(Boolean),
      risks,
      areas: [{ desc: String(a.municipios || a.estados || ''), polygons: geojsonToPolygons(a.poligono) }],
    });
  }
  return out;
}
