// Previsão do tempo por município (Open-Meteo, gratuito e sem chave).
// Uma única requisição traz todas as cidades monitoradas; atualiza a cada 30 min.
// Também calcula um RISCO ESTIMADO por tipo de desastre a partir da previsão.

export type RainLevel = 'sem_chuva' | 'leve' | 'moderada' | 'forte';
export type RiskLevel = 'baixo' | 'moderado' | 'alto' | 'muito_alto';
export type HazardId = 'alagamento' | 'deslizamento' | 'vendaval' | 'granizo' | 'raios';

export interface CityForecast {
  /** Nível de chuva previsto nas próximas 6 h (pela intensidade máxima por hora) */
  rainLevel: RainLevel;
  /** Maior probabilidade de chuva nas próximas 6 h (%) */
  rainProbability6h: number;
  maxRate6h: number; // mm/h
  sum6h: number; // mm
  sum24h: number; // mm
  maxRate24h: number; // mm/h
  past72h: number; // mm já acumulados nas últimas 72 h
  maxGust24h: number; // km/h
  thunder24h: boolean;
  hail24h: boolean;
  maxProb24h: number;
  /** Horário (local) em que a chuva mais forte é esperada nas próximas 24 h */
  peakTime: string | null;
  risks: Record<HazardId, RiskLevel>;
  updatedAt: number;
}

export const RAIN_LEVEL_LABEL: Record<RainLevel, string> = {
  sem_chuva: 'Sem chuva',
  leve: 'Chuva leve',
  moderada: 'Chuva moderada',
  forte: 'Chuva forte',
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  baixo: 'Baixo',
  moderado: 'Moderado',
  alto: 'Alto',
  muito_alto: 'Muito alto',
};

export const HAZARD_LABEL: Record<HazardId, string> = {
  alagamento: 'Alagamento / enxurrada',
  deslizamento: 'Deslizamento',
  vendaval: 'Vendaval',
  granizo: 'Granizo',
  raios: 'Descargas elétricas',
};

const RISK_ORDER: RiskLevel[] = ['baixo', 'moderado', 'alto', 'muito_alto'];
export const maxRisk = (a: RiskLevel, b: RiskLevel): RiskLevel =>
  RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;

/** Intensidade por hora (padrão meteorológico): leve < 2,5 · moderada 2,5–7,6 · forte > 7,6 mm/h */
export function classifyRain(rateMmH: number): RainLevel {
  if (rateMmH < 0.2) return 'sem_chuva';
  if (rateMmH < 2.5) return 'leve';
  if (rateMmH < 7.6) return 'moderada';
  return 'forte';
}

function computeRisks(f: Omit<CityForecast, 'risks' | 'updatedAt' | 'rainLevel'>): Record<HazardId, RiskLevel> {
  const alag: RiskLevel =
    f.maxRate24h >= 30 || f.sum24h >= 80
      ? 'muito_alto'
      : f.maxRate24h >= 15 || f.sum24h >= 50
      ? 'alto'
      : f.maxRate24h >= 7.6 || f.sum24h >= 25
      ? 'moderado'
      : 'baixo';
  const solo = f.past72h + f.sum24h; // solo encharcado + chuva prevista
  const desl: RiskLevel = solo >= 150 ? 'muito_alto' : solo >= 100 ? 'alto' : solo >= 60 ? 'moderado' : 'baixo';
  const vend: RiskLevel =
    f.maxGust24h >= 90 ? 'muito_alto' : f.maxGust24h >= 75 ? 'alto' : f.maxGust24h >= 60 ? 'moderado' : 'baixo';
  const gran: RiskLevel = f.hail24h ? 'alto' : f.thunder24h && f.maxRate24h >= 15 ? 'moderado' : 'baixo';
  const raios: RiskLevel = f.thunder24h ? (f.maxProb24h >= 70 ? 'alto' : 'moderado') : 'baixo';
  return { alagamento: alag, deslizamento: desl, vendaval: vend, granizo: gran, raios };
}

interface OpenMeteoLocation {
  hourly: {
    time: string[];
    precipitation: (number | null)[];
    precipitation_probability: (number | null)[];
    weather_code: (number | null)[];
    wind_gusts_10m: (number | null)[];
  };
}

function summarize(loc: OpenMeteoLocation, nowMs: number): CityForecast {
  const h = loc.hourly;
  // horários vêm no fuso de Brasília (timezone=America/Sao_Paulo) sem sufixo
  const toMs = (t: string) => Date.parse(t + ':00-03:00');
  let rate6 = 0,
    sum6 = 0,
    prob6 = 0,
    sum24 = 0,
    rate24 = 0,
    gust24 = 0,
    prob24 = 0,
    past72 = 0;
  let thunder = false,
    hail = false,
    peakTime: string | null = null;
  for (let i = 0; i < h.time.length; i++) {
    const t = toMs(h.time[i]);
    const p = h.precipitation[i] ?? 0;
    const hoursAhead = (t - nowMs) / 3600000;
    if (hoursAhead < 0 && hoursAhead >= -72) past72 += p;
    if (hoursAhead >= -1 && hoursAhead < 24) {
      const prob = h.precipitation_probability[i] ?? 0;
      const code = h.weather_code[i] ?? 0;
      sum24 += p;
      if (p > rate24) {
        rate24 = p;
        peakTime = h.time[i].slice(11, 16);
      }
      gust24 = Math.max(gust24, h.wind_gusts_10m[i] ?? 0);
      prob24 = Math.max(prob24, prob);
      if (code >= 95) thunder = true;
      if (code === 96 || code === 99) hail = true;
      if (hoursAhead < 6) {
        sum6 += p;
        rate6 = Math.max(rate6, p);
        prob6 = Math.max(prob6, prob);
      }
    }
  }
  const base = {
    rainProbability6h: Math.round(prob6),
    maxRate6h: +rate6.toFixed(1),
    sum6h: +sum6.toFixed(1),
    sum24h: +sum24.toFixed(1),
    maxRate24h: +rate24.toFixed(1),
    past72h: +past72.toFixed(1),
    maxGust24h: Math.round(gust24),
    thunder24h: thunder,
    hail24h: hail,
    maxProb24h: Math.round(prob24),
    peakTime: rate24 >= 0.2 ? peakTime : null,
  };
  return { ...base, rainLevel: classifyRain(rate6), risks: computeRisks(base), updatedAt: nowMs };
}

/** Busca a previsão de todas as cidades de uma vez. Chave do resultado = nome da cidade. */
export async function fetchCityForecasts(
  cities: { name: string; coords: [number, number] }[]
): Promise<Record<string, CityForecast>> {
  const lat = cities.map((c) => c.coords[0].toFixed(4)).join(',');
  const lon = cities.map((c) => c.coords[1].toFixed(4)).join(',');
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=precipitation,precipitation_probability,weather_code,wind_gusts_10m` +
    `&timezone=America%2FSao_Paulo&past_days=3&forecast_days=2`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Previsão indisponível (HTTP ${res.status})`);
  const json = await res.json();
  const list: OpenMeteoLocation[] = Array.isArray(json) ? json : [json];
  const now = Date.now();
  const out: Record<string, CityForecast> = {};
  cities.forEach((c, i) => {
    if (list[i]?.hourly) out[c.name] = summarize(list[i], now);
  });
  return out;
}
