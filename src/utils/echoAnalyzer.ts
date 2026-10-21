import { RadarMetadata } from '../types/radar';

/**
 * Limiar mínimo de refletividade em dBZ para caracterizar precipitação (chuva).
 * Valores a partir de 10-15 dBZ indicam início de gotículas de chuva/chuvisco detectável.
 * Configurável conforme especificação.
 */
export const DBZ_PRECIPITATION_THRESHOLD = 10;

/**
 * Número mínimo de pixels de eco contíguos/agrupados necessários para validar uma
 * formação real de chuva e filtrar ruídos pontuais de feixe ou clutter de solo.
 */
export const MIN_ECHO_PIXELS_FOR_VALID_ACTIVITY = 10;

/**
 * Alcance máximo de cobertura física válida do radar de Chapecó (em km).
 * Áreas além desta distância não são avaliadas para evitar feixes espúrios fora da área nominal.
 */
export const MAX_VALID_RADAR_RANGE_KM = 250;

export interface EchoAnalysisResult {
  frameId: string;
  timestamp: number;
  analyzedAt: number;
  dataValid: boolean;
  totalValidPixels: number;
  echoPixelCount: number;
  maxDbzEstimate: number;
  activeSectors: Set<string>;
  hasPrecipitation: boolean;
  isNewPrecipitationActivity: boolean;
  newSectorsCount: number;
}

// Memory cache of analyzed frames
const analysisCache = new Map<string, EchoAnalysisResult>();

/**
 * Estima a refletividade em dBZ a partir da cor RGB do pixel,
 * de acordo com a paleta oficial de radar da Defesa Civil SC / SIFAP.
 */
export function estimateDbzFromRgb(r: number, g: number, b: number): number {
  // Púrpuras / Violeta / Branco: Granizo severo / tempestade violenta (> 60 dBZ)
  if (r > 200 && g < 100 && b > 200) return 65;
  if (r > 230 && g > 230 && b > 230) return 70;

  // Vermelho / Carmesim: Chuva forte / granizo potencial (50 - 60 dBZ)
  if (r > 190 && g < 85 && b < 85) return 55;
  if (r > 210 && g > 85 && g < 140 && b < 70) return 50;

  // Laranja / Amarelo: Chuva moderada a forte (40 - 50 dBZ)
  if (r > 200 && g > 175 && b < 80) return 45;
  if (r > 160 && g > 185 && b < 80) return 40;

  // Verde: Chuva moderada (30 - 40 dBZ)
  if (g > 150 && r < 145 && b < 145) return 35;
  if (g > 100 && r < 110 && b < 110) return 30;

  // Azul / Ciano: Chuva fraca / início de precipitação (15 - 30 dBZ)
  if (b > 150 && g > 140 && r < 125) return 25;
  if (b > 120 && r < 105) return 20;

  // Ciano claro / Azul pálido: Chuvisco leve (10 - 15 dBZ)
  if (b > 90 || g > 90) return 12;

  return 10;
}

/**
 * Analisa os pixels da imagem de radar real obtida da Defesa Civil de Santa Catarina.
 * Avalia estritamente os pixels dentro do disco de cobertura física válida (<= 250 km)
 * centrado no radar de Chapecó (Morro da Cruz).
 */
export function analyzeRadarEchoesReal(
  imageUrl: string,
  frameId: string,
  frameTimestamp: number,
  metadata: RadarMetadata,
  previousResult?: EchoAnalysisResult | null,
  dbzThreshold: number = DBZ_PRECIPITATION_THRESHOLD
): Promise<EchoAnalysisResult> {
  const cacheKey = `${frameId}_dbz${dbzThreshold}`;
  if (analysisCache.has(cacheKey)) {
    return Promise.resolve(analysisCache.get(cacheKey)!);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const width = img.naturalWidth || 859;
        const height = img.naturalHeight || 758;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (!ctx) {
          throw new Error('Canvas 2D indisponível');
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Posição física exata do radar de Chapecó no raster
        const radarLat = metadata.coordinates.lat; // -27.0968
        const radarLon = metadata.coordinates.lon; // -52.6180

        const normX = (radarLon - metadata.minLon) / (metadata.maxLon - metadata.minLon);
        const normY = (metadata.maxLat - radarLat) / (metadata.maxLat - metadata.minLat);

        const cx = Math.round(normX * width);
        const cy = Math.round(normY * height);

        // Escala física em km
        const latSpanKm = (metadata.maxLat - metadata.minLat) * 110.85;
        const pxPerKm = height / latSpanKm;
        const maxRadiusPx = Math.round(MAX_VALID_RADAR_RANGE_KM * pxPerKm);
        const maxRadiusSq = maxRadiusPx * maxRadiusPx;

        let totalValidPixels = 0;
        let echoPixelCount = 0;
        let maxDbzEstimate = 0;

        // Set de setores espaciais com chuva detectada (ex: "sector_N_zone1", etc.)
        // Divide o disco do radar em 8 setores cardeais e 4 anéis de distância (0-50k, 50-100k, 100-175k, 175-250k)
        const sectorCounts = new Map<string, number>();

        const minX = Math.max(0, cx - maxRadiusPx);
        const maxX = Math.min(width - 1, cx + maxRadiusPx);
        const minY = Math.max(0, cy - maxRadiusPx);
        const maxY = Math.min(height - 1, cy + maxRadiusPx);

        for (let y = minY; y <= maxY; y++) {
          const dy = y - cy;
          const dySq = dy * dy;

          for (let x = minX; x <= maxX; x++) {
            const dx = x - cx;
            const distSq = dx * dx + dySq;

            // Filtro estrito: Apenas pixels dentro do alcance válido do radar
            if (distSq <= maxRadiusSq) {
              totalValidPixels++;
              const idx = (y * width + x) * 4;
              const alpha = data[idx + 3];

              // Pixel transparente = ausência de chuva / céu limpo no radar
              if (alpha > 40) {
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const dbz = estimateDbzFromRgb(r, g, b);

                if (dbz >= dbzThreshold) {
                  echoPixelCount++;
                  if (dbz > maxDbzEstimate) {
                    maxDbzEstimate = dbz;
                  }

                  // Classifica o setor geográfico
                  const distKm = Math.sqrt(distSq) / pxPerKm;
                  let zone = 'z1'; // 0-50km
                  if (distKm > 175) zone = 'z4'; // 175-250km
                  else if (distKm > 100) zone = 'z3'; // 100-175km
                  else if (distKm > 50) zone = 'z2'; // 50-100km

                  // Ângulo em graus (0 a 360)
                  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                  if (angle < 0) angle += 360;

                  // 8 setores cardeais (45 graus cada)
                  const sectorIdx = Math.floor(((angle + 22.5) % 360) / 45);
                  const sectorKey = `s${sectorIdx}_${zone}`;

                  sectorCounts.set(sectorKey, (sectorCounts.get(sectorKey) || 0) + 1);
                }
              }
            }
          }
        }

        // Setores com chuva válida (pelo menos 6 pixels de eco concentrados naquele setor)
        const activeSectors = new Set<string>();
        sectorCounts.forEach((count, sectorKey) => {
          if (count >= 6) {
            activeSectors.add(sectorKey);
          }
        });

        const hasPrecipitation = echoPixelCount >= MIN_ECHO_PIXELS_FOR_VALID_ACTIVITY;

        // Detecção de NOVA atividade:
        // Identifica se surgiu precipitação em setores que anteriormente estavam secos,
        // ou se o radar estava sem chuva e agora detectou chuva.
        let isNewPrecipitationActivity = false;
        let newSectorsCount = 0;

        if (hasPrecipitation) {
          if (!previousResult || !previousResult.hasPrecipitation) {
            // Estava sem chuva e agora surgiu chuva confirmada
            isNewPrecipitationActivity = true;
            newSectorsCount = activeSectors.size;
          } else {
            // Compara os setores ativos atuais com os setores anteriores
            activeSectors.forEach((sector) => {
              if (!previousResult.activeSectors.has(sector)) {
                newSectorsCount++;
              }
            });

            // Se surgiram novos setores com chuva ou aumento superior a 35% de área
            if (newSectorsCount >= 1 || echoPixelCount > previousResult.echoPixelCount * 1.35 + 20) {
              isNewPrecipitationActivity = true;
            }
          }
        }

        const result: EchoAnalysisResult = {
          frameId,
          timestamp: frameTimestamp,
          analyzedAt: Date.now(),
          dataValid: true,
          totalValidPixels,
          echoPixelCount,
          maxDbzEstimate,
          activeSectors,
          hasPrecipitation,
          isNewPrecipitationActivity,
          newSectorsCount,
        };

        analysisCache.set(cacheKey, result);
        resolve(result);
      } catch (err) {
        console.warn('Erro na análise de pixels do radar:', err);
        resolve({
          frameId,
          timestamp: frameTimestamp,
          analyzedAt: Date.now(),
          dataValid: false,
          totalValidPixels: 0,
          echoPixelCount: 0,
          maxDbzEstimate: 0,
          activeSectors: new Set(),
          hasPrecipitation: false,
          isNewPrecipitationActivity: false,
          newSectorsCount: 0,
        });
      }
    };

    img.onerror = () => {
      resolve({
        frameId,
        timestamp: frameTimestamp,
        analyzedAt: Date.now(),
        dataValid: false,
        totalValidPixels: 0,
        echoPixelCount: 0,
        maxDbzEstimate: 0,
        activeSectors: new Set(),
        hasPrecipitation: false,
        isNewPrecipitationActivity: false,
        newSectorsCount: 0,
      });
    };

    img.src = imageUrl;
  });
}
