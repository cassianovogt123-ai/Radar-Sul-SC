export interface RadarMetadata {
  code: string;
  name: string;
  operator: string;
  location: string;
  coordinates: { lat: number; lon: number };
  band: string;
  rangeKm: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  leafletBounds: [[number, number], [number, number]];
  supportedProducts?: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

export interface RadarFrame {
  filename?: string;
  timestamp: number;
  utcIso?: string;
  utcDisplay: string;
  brtDisplay: string;
  ageMinutes: number;
  imageUrl?: string;
  tileUrlTemplate?: string;
  time?: number;
  path?: string;
}

export interface RadarSourceOption {
  id: 'defesa_civil_chapeco' | 'defesa_civil_mosaico' | 'rainviewer_composite' | 'redemet_decea';
  name: string;
  badge: string;
  isPrimary: boolean;
  radarCode: string;
  defaultProd?: string;
  metadata?: RadarMetadata;
  isConfigured?: boolean;
}

export interface EchoAnalysisResult {
  frameId: string;
  timestamp: number;
  analyzedAt: number;
  totalPixelsInRadius: number;
  echoPixelCount: number;
  coveragePercent: number;
  coverageAreaKm2: number;
  maxDbzEstimate: number;
  intensityCategory: 'sem_eco' | 'leve' | 'moderado' | 'forte' | 'severo';
  isNewFormation: boolean;
  isAreaIncrease: boolean;
  deltaPixels: number;
  alertTriggered: boolean;
  description: string;
}

export type ConnectionStatus = 'conectado' | 'atualizando' | 'desatualizado' | 'indisponivel';

export interface AlertLogItem {
  id: string;
  timestamp: number;
  brtTime: string;
  frameTimestamp: number;
  type: 'novo_eco' | 'aumento_significativo' | 'intensificacao' | 'teste';
  severity: 'info' | 'atencao' | 'alerta';
  title: string;
  details: string;
  echoCount: number;
  maxDbz: number;
}
