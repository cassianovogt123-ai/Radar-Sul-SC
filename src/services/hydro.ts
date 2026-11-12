// Nível dos rios, vazão e chuva das estações telemétricas da Rede Hidrometeorológica Nacional
// (ANA / Serviço Geológico do Brasil) — a mesma base do app HidroWeb. Dados a cada 15 min.
// No APK o WebView pode barrar a leitura (CORS): o getText refaz o pedido pelo lado nativo.

import { getText } from '../components/SatelliteView';

export interface HydroStation {
  cod: string;
  nome: string;
  rio: string;
  lat: number;
  lon: number;
}

// Estações com nível + vazão + chuva funcionando (conferido em 11/11/2026), do Oeste de SC e arredores
export const HYDRO_STATIONS: HydroStation[] = [
  { cod: '74329000', nome: 'Itapiranga', rio: 'Rio Uruguai', lat: -27.1717, lon: -53.7097 },
  { cod: '74100000', nome: 'Iraí', rio: 'Rio Uruguai', lat: -27.1756, lon: -53.2297 },
  { cod: '74500000', nome: 'Alto Uruguai', rio: 'Rio Uruguai', lat: -27.3019, lon: -54.1397 },
  { cod: '73960000', nome: 'Barra do Chapecó', rio: 'Rio Chapecó', lat: -27.0419, lon: -52.9544 },
  { cod: '73770000', nome: 'Porto Fae Novo', rio: 'Rio Chapecó', lat: -26.8175, lon: -52.7344 },
  { cod: '73900000', nome: 'Saudades', rio: 'Rio Saudades', lat: -26.9244, lon: -53.0089 },
  { cod: '74295000', nome: 'Linha Jataí', rio: 'Rio Iracema', lat: -27.0133, lon: -53.2953 },
  { cod: '74300000', nome: 'Guatapara de Baixo', rio: 'Rio das Antas', lat: -26.5881, lon: -53.4536 },
  { cod: '65950200', nome: 'Francisco Beltrão', rio: 'Rio Marrecas', lat: -26.0817, lon: -53.0739 },
  { cod: '72849000', nome: 'Joaçaba', rio: 'Rio do Peixe', lat: -27.1594, lon: -51.4811 },
  { cod: '72810000', nome: 'Tangará', rio: 'Rio do Peixe', lat: -27.0881, lon: -51.2581 },
  { cod: '72715000', nome: 'Rio das Antas', rio: 'Rio do Peixe', lat: -26.8958, lon: -51.0756 },
];

export interface HydroReading {
  t: number;
  nivelCm: number | null;
  vazao: number | null;
  chuvaMm: number | null;
}

export type HydroTrend = 'subindo' | 'descendo' | 'estavel';

export interface HydroSummary {
  station: HydroStation;
  readings: HydroReading[]; // do mais antigo para o mais novo
  last: HydroReading | null;
  d1h: number | null;
  d6h: number | null;
  d24h: number | null;
  chuva1h: number;
  chuva24h: number;
  trend: HydroTrend | null;
}

const SERVICE = 'https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos';

const num = (s: string | null | undefined) => {
  const v = parseFloat((s ?? '').trim());
  return Number.isFinite(v) ? v : null;
};

function brDate(t: number) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(t));
}

/** Lê o XML da ANA. DataHora vem no horário de Brasília ("2026-11-11 16:00:00"). */
export function parseHydroXml(xml: string): HydroReading[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const rows = Array.from(doc.getElementsByTagName('DadosHidrometereologicos'));
  const out: HydroReading[] = [];
  for (const r of rows) {
    const get = (tag: string) => r.getElementsByTagName(tag)[0]?.textContent ?? null;
    const dh = (get('DataHora') ?? '').trim();
    const t = Date.parse(dh.replace(' ', 'T') + '-03:00');
    if (!Number.isFinite(t)) continue;
    out.push({ t, nivelCm: num(get('Nivel')), vazao: num(get('Vazao')), chuvaMm: num(get('Chuva')) });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Variação de nível (cm) entre a última leitura e a leitura mais próxima de `hours` antes. */
function delta(readings: HydroReading[], hours: number): number | null {
  const withLevel = readings.filter((r) => r.nivelCm != null);
  const last = withLevel[withLevel.length - 1];
  if (!last) return null;
  const target = last.t - hours * 3600000;
  let best: HydroReading | null = null;
  for (const r of withLevel) {
    if (Math.abs(r.t - target) <= 45 * 60000 && (!best || Math.abs(r.t - target) < Math.abs(best.t - target))) best = r;
  }
  return best ? last.nivelCm! - best.nivelCm! : null;
}

export function summarize(station: HydroStation, readings: HydroReading[]): HydroSummary {
  const withLevel = readings.filter((r) => r.nivelCm != null);
  const last = withLevel[withLevel.length - 1] ?? null;
  const now = last?.t ?? Date.now();
  const rainSince = (h: number) => readings.filter((r) => r.t > now - h * 3600000).reduce((s, r) => s + (r.chuvaMm ?? 0), 0);
  const d3h = delta(readings, 3);
  return {
    station,
    readings,
    last,
    d1h: delta(readings, 1),
    d6h: delta(readings, 6),
    d24h: delta(readings, 24),
    chuva1h: rainSince(1),
    chuva24h: rainSince(24),
    // ±5 cm em 3 h para não oscilar com as pequenas variações do sensor
    trend: d3h == null ? null : d3h >= 5 ? 'subindo' : d3h <= -5 ? 'descendo' : 'estavel',
  };
}

/** Últimas ~48 h de uma estação. */
export async function fetchHydroStation(station: HydroStation): Promise<HydroSummary> {
  const now = Date.now();
  const url = `${SERVICE}?codEstacao=${station.cod}&dataInicio=${brDate(now - 2 * 86400000)}&dataFim=${brDate(now)}`;
  // getText: no APK, se o WebView barrar (CORS), refaz o pedido pelo lado nativo
  return summarize(station, parseHydroXml(await getText(url)));
}
