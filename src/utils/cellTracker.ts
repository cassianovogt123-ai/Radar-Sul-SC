import { RadarMetadata } from '../types/radar';
import { estimateDbzFromRgb, MAX_VALID_RADAR_RANGE_KM } from './echoAnalyzer';

export interface RainCell {
  id: string;
  centroidLat: number;
  centroidLon: number;
  pixelCount: number;
  areaKm2: number;
  maxDbz: number;
  avgDbz: number;
  radiusKm: number;
  speedKmh: number | null;
  directionDeg: number | null;
  directionText: string;
}

export type ThreatLevel = 'verde' | 'amarelo' | 'laranja' | 'vermelho';

export interface MunicipalityProximityStatus {
  cityName: string;
  state: string;
  coords: [number, number];
  threatLevel: ThreatLevel;
  threatTitle: string;
  threatDescription: string;
  closestCell: RainCell | null;
  distanceKm: number | null;
  effectiveEdgeDistanceKm: number | null;
  movementTrend: 'aproximando' | 'afastando' | 'tangencial' | 'estacionaria' | 'sobre_cidade' | 'indeterminada';
  movementTrendText: string;
  speedKmh: number | null;
  directionText: string;
  estimatedArrivalMinutes: number | null;
  etaText: string;
  lastObservationTime: string;
  dataQuality: 'confiavel' | 'estimativa' | 'insuficiente' | 'desatualizada';
}

// Convert degree to radians
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Great circle distance in km
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Bearing from point 1 to point 2 (0° to 360°)
export function calculateBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

// Cardinal direction text
export function bearingToText(deg: number): string {
  const directions = [
    'Norte',
    'Nordeste',
    'Leste',
    'Sudeste',
    'Sul',
    'Sudoeste',
    'Oeste',
    'Noroeste',
  ];
  const idx = Math.round(deg / 45) % 8;
  return directions[idx];
}

// Extracts rain cells from a radar image raster using connected component clustering
export function extractCellsFromImage(
  img: HTMLImageElement,
  metadata: RadarMetadata,
  minDbz = 10
): RainCell[] {
  const width = img.naturalWidth || 859;
  const height = img.naturalHeight || 758;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Radar tower location in pixels
  const radarLat = metadata.coordinates.lat;
  const radarLon = metadata.coordinates.lon;
  const normX = (radarLon - metadata.minLon) / (metadata.maxLon - metadata.minLon);
  const normY = (metadata.maxLat - radarLat) / (metadata.maxLat - metadata.minLat);
  const cx = Math.round(normX * width);
  const cy = Math.round(normY * height);

  const latSpanKm = (metadata.maxLat - metadata.minLat) * 110.85;
  const pxPerKm = height / latSpanKm;
  const maxRadiusPx = Math.round(MAX_VALID_RADAR_RANGE_KM * pxPerKm);
  const maxRadiusSq = maxRadiusPx * maxRadiusPx;

  // Downsampled grid for connected component analysis (step = 4px gives ~2.4km spatial resolution)
  const step = 4;
  const gridW = Math.floor(width / step);
  const gridH = Math.floor(height / step);
  const gridDbz = new Int8Array(gridW * gridH);

  for (let gy = 0; gy < gridH; gy++) {
    const y = gy * step;
    const dy = y - cy;
    const dySq = dy * dy;

    for (let gx = 0; gx < gridW; gx++) {
      const x = gx * step;
      const dx = x - cx;

      if (dx * dx + dySq <= maxRadiusSq) {
        const idx = (y * width + x) * 4;
        const alpha = data[idx + 3];
        if (alpha > 40) {
          const dbz = estimateDbzFromRgb(data[idx], data[idx + 1], data[idx + 2]);
          if (dbz >= minDbz) {
            gridDbz[gy * gridW + gx] = dbz;
          }
        }
      }
    }
  }

  // BFS Connected Components Clustering
  const visited = new Uint8Array(gridW * gridH);
  const cells: RainCell[] = [];
  const minPixelsPerCell = 3; // On step 4, 3 cells ~ 18 km² cluster

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const idx = gy * gridW + gx;
      if (gridDbz[idx] >= minDbz && !visited[idx]) {
        // Start cluster
        const queue: number[] = [idx];
        visited[idx] = 1;

        let sumX = 0;
        let sumY = 0;
        let count = 0;
        let maxDbz = 0;
        let sumDbz = 0;

        while (queue.length > 0) {
          const curr = queue.pop()!;
          const cy_ = Math.floor(curr / gridW);
          const cx_ = curr % gridW;

          const dbzVal = gridDbz[curr];
          sumX += cx_ * step;
          sumY += cy_ * step;
          sumDbz += dbzVal;
          if (dbzVal > maxDbz) maxDbz = dbzVal;
          count++;

          // 4-way neighbors
          const neighbors = [
            cy_ > 0 ? (cy_ - 1) * gridW + cx_ : -1,
            cy_ < gridH - 1 ? (cy_ + 1) * gridW + cx_ : -1,
            cx_ > 0 ? cy_ * gridW + (cx_ - 1) : -1,
            cx_ < gridW - 1 ? cy_ * gridW + (cx_ + 1) : -1,
          ];

          for (const n of neighbors) {
            if (n >= 0 && gridDbz[n] >= minDbz && !visited[n]) {
              visited[n] = 1;
              queue.push(n);
            }
          }
        }

        if (count >= minPixelsPerCell) {
          const pixelCenterX = sumX / count;
          const pixelCenterY = sumY / count;

          // Convert pixel to geographical lat/lon
          const lon =
            metadata.minLon + (pixelCenterX / width) * (metadata.maxLon - metadata.minLon);
          const lat =
            metadata.maxLat - (pixelCenterY / height) * (metadata.maxLat - metadata.minLat);

          // Estimate area
          const kmPerPxX = ((metadata.maxLon - metadata.minLon) * 99.2) / width;
          const kmPerPxY = latSpanKm / height;
          const cellAreaKm2 = Math.round(count * step * step * kmPerPxX * kmPerPxY);
          const radiusKm = Math.max(3, Math.round(Math.sqrt(cellAreaKm2 / Math.PI)));

          cells.push({
            id: `cell_${Math.round(lat * 1000)}_${Math.round(lon * 1000)}`,
            centroidLat: lat,
            centroidLon: lon,
            pixelCount: count * step * step,
            areaKm2: cellAreaKm2,
            maxDbz,
            avgDbz: Math.round(sumDbz / count),
            radiusKm,
            speedKmh: null,
            directionDeg: null,
            directionText: 'Trajetória em cálculo',
          });
        }
      }
    }
  }

  return cells;
}

// Track cells between two consecutive frames separated by deltaMinutes
export function trackCellsBetweenFrames(
  currentCells: RainCell[],
  previousCells: RainCell[],
  deltaMinutes: number
): RainCell[] {
  if (previousCells.length === 0 || deltaMinutes <= 0 || deltaMinutes > 20) {
    return currentCells;
  }

  const dtHours = deltaMinutes / 60;
  const maxRealisticMoveKm = Math.min(60, 110 * dtHours); // Up to 110 km/h

  return currentCells.map((curr) => {
    // Find closest cell in previous frame
    let closestPrev: RainCell | null = null;
    let minDist = Infinity;

    for (const prev of previousCells) {
      const dist = haversineDistanceKm(
        curr.centroidLat,
        curr.centroidLon,
        prev.centroidLat,
        prev.centroidLon
      );
      if (dist < minDist && dist <= maxRealisticMoveKm) {
        minDist = dist;
        closestPrev = prev;
      }
    }

    if (closestPrev) {
      const speed = Math.round(minDist / dtHours);
      const heading = calculateBearingDeg(
        closestPrev.centroidLat,
        closestPrev.centroidLon,
        curr.centroidLat,
        curr.centroidLon
      );

      return {
        ...curr,
        speedKmh: speed,
        directionDeg: Math.round(heading),
        directionText: bearingToText(heading),
      };
    }

    return curr;
  });
}

// Evaluate proximity, trajectory and threat level for a municipality
export function evaluateMunicipalityThreat(
  cityName: string,
  state: string,
  cityCoords: [number, number],
  cells: RainCell[],
  lastObservationTime: string,
  isDataOutdated: boolean
): MunicipalityProximityStatus {
  const [cityLat, cityLon] = cityCoords;

  if (isDataOutdated) {
    return {
      cityName,
      state,
      coords: cityCoords,
      threatLevel: 'verde',
      threatTitle: 'Dados Desatualizados',
      threatDescription: 'Varredura com mais de 45 min de atraso. Estimativas suspensas.',
      closestCell: null,
      distanceKm: null,
      effectiveEdgeDistanceKm: null,
      movementTrend: 'indeterminada',
      movementTrendText: 'Indeterminada (sem dados recentes)',
      speedKmh: null,
      directionText: 'Indisponível',
      estimatedArrivalMinutes: null,
      etaText: 'Dados desatualizados',
      lastObservationTime,
      dataQuality: 'desatualizada',
    };
  }

  if (cells.length === 0) {
    return {
      cityName,
      state,
      coords: cityCoords,
      threatLevel: 'verde',
      threatTitle: 'Normal (Sem Ecos)',
      threatDescription: 'Nenhuma célula de precipitação relevante no raio de cobertura.',
      closestCell: null,
      distanceKm: null,
      effectiveEdgeDistanceKm: null,
      movementTrend: 'estacionaria',
      movementTrendText: 'Sem chuva detectada no radar',
      speedKmh: null,
      directionText: 'Céu livre de ecos',
      estimatedArrivalMinutes: null,
      etaText: 'Sem aproximação prevista',
      lastObservationTime,
      dataQuality: 'confiavel',
    };
  }

  // Find most relevant / nearest cell to this municipality
  let closestCell: RainCell | null = null;
  let minDistance = Infinity;

  for (const cell of cells) {
    const dist = haversineDistanceKm(cell.centroidLat, cell.centroidLon, cityLat, cityLon);
    if (dist < minDistance) {
      minDistance = dist;
      closestCell = cell;
    }
  }

  if (!closestCell) {
    return {
      cityName,
      state,
      coords: cityCoords,
      threatLevel: 'verde',
      threatTitle: 'Normal',
      threatDescription: 'Nenhum eco relevante.',
      closestCell: null,
      distanceKm: null,
      effectiveEdgeDistanceKm: null,
      movementTrend: 'indeterminada',
      movementTrendText: 'Normal',
      speedKmh: null,
      directionText: 'N/A',
      estimatedArrivalMinutes: null,
      etaText: 'N/A',
      lastObservationTime,
      dataQuality: 'confiavel',
    };
  }

  const roundedDistance = Math.round(minDistance);
  const effectiveEdgeDist = Math.max(0, Math.round(minDistance - closestCell.radiusKm));

  // 1. Is rain already over the city?
  if (effectiveEdgeDist === 0) {
    const isSevere = closestCell.maxDbz >= 45;
    return {
      cityName,
      state,
      coords: cityCoords,
      threatLevel: isSevere ? 'vermelho' : 'laranja',
      threatTitle: isSevere ? 'Chuva Forte Sobre o Município' : 'Chuva Ativa Sobre o Município',
      threatDescription: `Precipitação sobre a área urbana (${closestCell.maxDbz} dBZ detectados).`,
      closestCell,
      distanceKm: roundedDistance,
      effectiveEdgeDistanceKm: 0,
      movementTrend: 'sobre_cidade',
      movementTrendText: 'Precipitação em andamento',
      speedKmh: closestCell.speedKmh,
      directionText: closestCell.directionText,
      estimatedArrivalMinutes: 0,
      etaText: 'Chovendo no momento',
      lastObservationTime,
      dataQuality: 'confiavel',
    };
  }

  // 2. Trajectory & vector analysis
  // Bearing from cell to city
  const bearingCellToCity = calculateBearingDeg(
    closestCell.centroidLat,
    closestCell.centroidLon,
    cityLat,
    cityLon
  );

  let movementTrend: MunicipalityProximityStatus['movementTrend'] = 'indeterminada';
  let movementTrendText = 'Trajetória em cálculo';
  let etaMinutes: number | null = null;
  let etaText = 'Calculando...';
  let dataQuality: MunicipalityProximityStatus['dataQuality'] = 'estimativa';

  if (closestCell.directionDeg !== null && closestCell.speedKmh !== null && closestCell.speedKmh > 0) {
    // Angular difference between cell velocity vector and line of sight to city
    let angleDiff = Math.abs(closestCell.directionDeg - bearingCellToCity);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;

    if (angleDiff <= 40) {
      // Direct approach
      movementTrend = 'aproximando';
      const approachSpeed = Math.max(5, closestCell.speedKmh * Math.cos(toRad(angleDiff)));
      etaMinutes = Math.round((effectiveEdgeDist / approachSpeed) * 60);
      movementTrendText = `Aproximando-se (${Math.round(approachSpeed)} km/h em direção à cidade)`;
      etaText =
        etaMinutes <= 15
          ? `Iminente (aprox. ${etaMinutes} min)`
          : `Aprox. ${etaMinutes} a ${etaMinutes + 10} min`;
    } else if (angleDiff <= 75) {
      // Tangential pass
      movementTrend = 'tangencial';
      movementTrendText = 'Deslocamento lateral / tangencial (passando próximo)';
      etaText = 'Passagem tangencial provável';
    } else {
      // Moving away
      movementTrend = 'afastando';
      movementTrendText = `Afastando-se do município (rumo a ${closestCell.directionText})`;
      etaText = 'Não deve atingir a cidade';
    }
  } else {
    // Only 1 scan or speed not established yet
    if (roundedDistance <= 30) {
      movementTrend = 'aproximando';
      movementTrendText = 'Célula próxima (velocidade em observação)';
      etaText = 'Trajetória em cálculo';
    } else {
      movementTrend = 'indeterminada';
      movementTrendText = 'Trajetória indeterminada (aguardando próxima varredura)';
      etaText = 'Indeterminada';
    }
    dataQuality = 'insuficiente';
  }

  // 3. Determine Threat Level (Verde, Amarelo, Laranja, Vermelho)
  // Non-arbitrary, respecting:
  // - 10 dBZ is not considered dangerous
  // - Threat requires proximity + approach + intensity
  let threatLevel: ThreatLevel = 'verde';
  let threatTitle = 'Sem Ameaça';
  let threatDescription = 'Nenhuma célula relevante se aproximando.';

  if (roundedDistance > 60) {
    // Too far
    threatLevel = 'verde';
    threatTitle = 'Monitoramento Normal';
    threatDescription = `Célula mais próxima a ${roundedDistance} km (fora do raio de atenção direta).`;
  } else if (movementTrend === 'afastando') {
    threatLevel = 'verde';
    threatTitle = 'Célula Afastando-se';
    threatDescription = `Célula a ${roundedDistance} km afastando-se de ${cityName}.`;
  } else if (roundedDistance <= 25 && closestCell.maxDbz >= 48 && movementTrend === 'aproximando') {
    // High reflectivity approaching very close
    threatLevel = 'vermelho';
    threatTitle = 'Alerta de Tempestade em Aproximação';
    threatDescription = `Núcleo de alta intensidade (${closestCell.maxDbz} dBZ) a ${roundedDistance} km, com chegada estimada em ${etaMinutes || 20} min.`;
  } else if (
    (roundedDistance <= 35 && closestCell.maxDbz >= 35 && movementTrend === 'aproximando') ||
    (effectiveEdgeDist <= 10 && movementTrend === 'aproximando')
  ) {
    // Moderate/strong cell approaching with confirmed ETA < 45m
    threatLevel = 'laranja';
    threatTitle = 'Aproximação de Chuva Moderada/Forte';
    threatDescription = `Célula de ${closestCell.maxDbz} dBZ a ${roundedDistance} km aproximando-se. ETA: ${etaText}.`;
  } else if (
    (roundedDistance <= 50 && movementTrend === 'aproximando') ||
    (roundedDistance <= 25 && movementTrend === 'tangencial')
  ) {
    // Possible approach or light rain nearby
    threatLevel = 'amarelo';
    threatTitle = 'Atenção: Possível Aproximação de Chuva';
    threatDescription = `Célula detectada a ${roundedDistance} km (${closestCell.maxDbz} dBZ). Monitorando trajetória.`;
  } else {
    threatLevel = 'verde';
    threatTitle = 'Condições Estáveis';
    threatDescription = `Célula detectada a ${roundedDistance} km sem indicativo de aproximação direta.`;
  }

  return {
    cityName,
    state,
    coords: cityCoords,
    threatLevel,
    threatTitle,
    threatDescription,
    closestCell,
    distanceKm: roundedDistance,
    effectiveEdgeDistanceKm: effectiveEdgeDist,
    movementTrend,
    movementTrendText,
    speedKmh: closestCell.speedKmh,
    directionText: closestCell.directionText,
    estimatedArrivalMinutes: etaMinutes,
    etaText,
    lastObservationTime,
    dataQuality,
  };
}
