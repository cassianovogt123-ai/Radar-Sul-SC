import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { playSonarPing } from '../utils/audio';
import { estimateDbzFromRgb, DBZ_PRECIPITATION_THRESHOLD } from '../utils/echoAnalyzer';

interface RadarSweepCanvasProps {
  map: L.Map | null;
  radarCoords: [number, number];
  rangeKm: number;
  isSweepActive: boolean;
  sweepSpeedRpm?: number; // e.g. 3 RPM (20 seconds per rotation)
  /** Imagem de ecos (nuvens) revelada somente por onde o feixe já passou */
  echoImageUrl?: string | null;
  echoBounds?: [[number, number], [number, number]];
  echoOpacity?: number; // 0..1
  /** Toca um ping suave quando a linha passa sobre uma nuvem */
  soundEnabled?: boolean;
}

/**
 * Perfil angular dos ecos: para cada grau (0 = leste, sentido horário na tela),
 * a intensidade 0..1 do eco mais forte naquela direção; 0 = sem nuvem.
 * Ângulos calculados em km para bater com a direção do feixe no mapa.
 */
function buildEchoProfile(
  img: HTMLImageElement,
  bounds: [[number, number], [number, number]],
  radar: [number, number],
  rangeKm: number,
): Float32Array | null {
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cctx = c.getContext('2d', { willReadFrequently: true });
    if (!cctx) return null;
    cctx.drawImage(img, 0, 0);
    const data = cctx.getImageData(0, 0, w, h).data;

    const maxLat = Math.max(bounds[0][0], bounds[1][0]);
    const minLat = Math.min(bounds[0][0], bounds[1][0]);
    const maxLon = Math.max(bounds[0][1], bounds[1][1]);
    const minLon = Math.min(bounds[0][1], bounds[1][1]);
    const kmPerPxY = ((maxLat - minLat) * 110.85) / h;
    const kmPerPxX = ((maxLon - minLon) * 111.32 * Math.cos((radar[0] * Math.PI) / 180)) / w;
    const rcx = ((radar[1] - minLon) / (maxLon - minLon)) * w;
    const rcy = ((maxLat - radar[0]) / (maxLat - minLat)) * h;

    const counts = new Uint16Array(360);
    const maxDbz = new Float32Array(360);
    const step = w * h > 1_500_000 ? 2 : 1;
    for (let y = 0; y < h; y += step) {
      const dyKm = (y - rcy) * kmPerPxY;
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        if (data[i + 3] <= 40) continue;
        const dxKm = (x - rcx) * kmPerPxX;
        const dist = Math.hypot(dxKm, dyKm);
        if (dist > rangeKm || dist < 3) continue;
        const dbz = estimateDbzFromRgb(data[i], data[i + 1], data[i + 2]);
        if (dbz < DBZ_PRECIPITATION_THRESHOLD) continue;
        let a = (Math.atan2(dyKm, dxKm) * 180) / Math.PI;
        if (a < 0) a += 360;
        const bin = Math.floor(a) % 360;
        counts[bin]++;
        if (dbz > maxDbz[bin]) maxDbz[bin] = dbz;
      }
    }

    const profile = new Float32Array(360);
    const minPixels = step === 1 ? 4 : 2; // ignora ruído isolado
    for (let b = 0; b < 360; b++) {
      if (counts[b] >= minPixels) {
        profile[b] = Math.max(0.05, Math.min(1, (maxDbz[b] - 10) / 50));
      }
    }
    return profile;
  } catch {
    // imagem sem permissão de leitura (CORS): sem som, o resto segue normal
    return null;
  }
}

// A nuvem só aparece no rastro logo atrás da linha do sonar e some em
// seguida. Fora dessa faixa (inclusive à frente da linha) fica oculta.
// Ex.: 50° ≈ 2,8 s visível por volta a 3 RPM.
const ECHO_FADE_DEG = 50;

export const RadarSweepCanvas: React.FC<RadarSweepCanvasProps> = ({
  map,
  radarCoords,
  rangeKm = 250,
  isSweepActive = true,
  sweepSpeedRpm = 3, // 3 RPM is typical for surveillance radar
  echoImageUrl = null,
  echoBounds,
  echoOpacity = 1,
  soundEnabled = false,
}) => {
  const echoProfileRef = useRef<Float32Array | null>(null);
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const lastPingAtRef = useRef<number>(0);
  const echoImgRef = useRef<HTMLImageElement | null>(null);
  const echoCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Carrega a imagem de ecos fora do Leaflet para desenhá-la mascarada pelo feixe
  useEffect(() => {
    if (!echoImageUrl) {
      echoImgRef.current = null;
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      echoImgRef.current = img;
      echoProfileRef.current = echoBounds
        ? buildEchoProfile(img, echoBounds, radarCoords, rangeKm)
        : null;
    };
    img.src = echoImageUrl;
    return () => {
      img.onload = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [echoImageUrl, echoBounds?.flat().join(','), radarCoords[0], radarCoords[1], rangeKm]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const angleRef = useRef<number>(0);
  const animFrameIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    if (!map) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      const size = map.getSize();
      canvas.width = size.x;
      canvas.height = size.y;
      if (!echoCanvasRef.current) echoCanvasRef.current = document.createElement('canvas');
      echoCanvasRef.current.width = size.x;
      echoCanvasRef.current.height = size.y;
    };

    handleResize();
    map.on('resize', handleResize);
    map.on('move', () => {}); // Triggers redraw in loop

    const render = (time: number) => {
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      if (isSweepActive) {
        // Rotate clockwise (degrees per second: 360 * (RPM / 60))
        const degPerSec = 360 * (sweepSpeedRpm / 60);
        const prevAngle = angleRef.current;
        const advance = Math.min(degPerSec * dt, 30); // evita salto após app em segundo plano
        angleRef.current = (prevAngle + advance) % 360;

        // Ping suave quando a linha entra numa nuvem (borda de cada formação)
        const profile = echoProfileRef.current;
        if (soundEnabledRef.current && profile && advance > 0) {
          const from = Math.floor(prevAngle);
          const to = Math.floor(prevAngle + advance);
          for (let d = from + 1; d <= to; d++) {
            const bin = ((d % 360) + 360) % 360;
            const prevBin = (bin + 359) % 360;
            if (profile[bin] > 0 && profile[prevBin] === 0 && time - lastPingAtRef.current > 400) {
              lastPingAtRef.current = time;
              playSonarPing(profile[bin]);
              break;
            }
          }
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Convert Radar geographical coordinates to screen pixel coordinates
      const centerPoint = map.latLngToContainerPoint(radarCoords);
      const cx = centerPoint.x;
      const cy = centerPoint.y;

      // Calculate radius in screen pixels
      // Lat offset corresponding to rangeKm: 1 deg lat ~ 110.85 km
      const latOffset = rangeKm / 110.85;
      const edgePoint = map.latLngToContainerPoint([radarCoords[0] + latOffset, radarCoords[1]]);
      const radius = Math.abs(edgePoint.y - cy);

      // Only draw if within or near viewport
      if (
        cx + radius < -50 ||
        cx - radius > canvas.width + 50 ||
        cy + radius < -50 ||
        cy - radius > canvas.height + 50 ||
        radius < 5
      ) {
        animFrameIdRef.current = requestAnimationFrame(render);
        return;
      }

      // 0. Ecos revelados pelo feixe: só aparece o que a linha já varreu,
      //    apagando aos poucos; à frente da linha a camada de nuvens fica oculta.
      const echoImg = echoImgRef.current;
      const echoCanvas = echoCanvasRef.current;
      if (isSweepActive && echoImg && echoBounds && echoCanvas) {
        const ectx = echoCanvas.getContext('2d');
        if (ectx) {
          const p1 = map.latLngToContainerPoint(echoBounds[0]);
          const p2 = map.latLngToContainerPoint(echoBounds[1]);
          const ex = Math.min(p1.x, p2.x);
          const ey = Math.min(p1.y, p2.y);
          const ew = Math.abs(p2.x - p1.x);
          const eh = Math.abs(p2.y - p1.y);

          ectx.globalCompositeOperation = 'source-over';
          ectx.clearRect(0, 0, echoCanvas.width, echoCanvas.height);
          ectx.drawImage(echoImg, ex, ey, ew, eh);

          // Máscara angular: mantém apenas a fatia atrás da linha do feixe
          ectx.globalCompositeOperation = 'destination-in';
          const lineRad = (angleRef.current * Math.PI) / 180;
          const hiddenFrac = 1 - ECHO_FADE_DEG / 360;
          if (typeof (ectx as any).createConicGradient === 'function') {
            // Gradiente cônico começa na linha e gira no sentido horário:
            // logo à frente da linha = oculto; chegando de volta na linha = 100%.
            const g = (ectx as any).createConicGradient(lineRad, cx, cy) as CanvasGradient;
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(hiddenFrac, 'rgba(0,0,0,0)');
            g.addColorStop(1, 'rgba(0,0,0,1)');
            ectx.fillStyle = g;
            ectx.fillRect(0, 0, echoCanvas.width, echoCanvas.height);
          } else {
            // Fallback para WebViews antigos: fatias com alfa decrescente
            const maskR = Math.hypot(echoCanvas.width, echoCanvas.height) + radius;
            const slices = 90;
            const fadeRad = (ECHO_FADE_DEG * Math.PI) / 180;
            const step = fadeRad / slices;
            for (let i = 0; i < slices; i++) {
              const a0 = lineRad - (i + 1) * step;
              const a1 = lineRad - i * step + 0.004;
              ectx.beginPath();
              ectx.moveTo(cx, cy);
              ectx.arc(cx, cy, maskR, a0, a1);
              ectx.closePath();
              ectx.fillStyle = `rgba(0,0,0,${1 - (i + 0.5) / slices})`;
              ectx.fill();
            }
          }
          ectx.globalCompositeOperation = 'source-over';

          ctx.globalAlpha = Math.max(0, Math.min(1, echoOpacity));
          ctx.drawImage(echoCanvas, 0, 0);
          ctx.globalAlpha = 1;
        }
      }

      ctx.save();

      // Clip drawing strictly to the radar maximum surveillance disk
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      // 1. Draw Range Rings (50, 100, 150, 200, 250 km)
      const rings = [50, 100, 150, 200, 250];
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.28)';
      ctx.lineWidth = 1;

      rings.forEach((rKm) => {
        if (rKm <= rangeKm) {
          const rPx = radius * (rKm / rangeKm);
          ctx.beginPath();
          ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
          ctx.stroke();

          // Distance label along the North and East axes
          ctx.fillStyle = 'rgba(6, 182, 212, 0.7)';
          ctx.font = '10px monospace';
          ctx.fillText(`${rKm} km`, cx + 6, cy - rPx + 11);
        }
      });

      // 2. Radial Crosshair Lines (N, S, E, W, NE, NW, SE, SW)
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
      ctx.setLineDash([3, 4]);

      // N-S line
      ctx.beginPath();
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.stroke();

      // E-W line
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.stroke();

      // Diagonal crosshairs
      const diagDist = radius * 0.7071;
      ctx.beginPath();
      ctx.moveTo(cx - diagDist, cy - diagDist);
      ctx.lineTo(cx + diagDist, cy + diagDist);
      ctx.moveTo(cx - diagDist, cy + diagDist);
      ctx.lineTo(cx + diagDist, cy - diagDist);
      ctx.stroke();
      ctx.setLineDash([]); // Reset line dash

      // 3. Rotating Radar Sweep Beam (Continuous sweep trail)
      if (isSweepActive) {
        const currentRad = (angleRef.current * Math.PI) / 180;
        const trailAngleDeg = 48; // Width of the phosphor sweep tail
        const trailRad = (trailAngleDeg * Math.PI) / 180;
        const startRad = currentRad - trailRad;

        // Fading phosphor sector trail
        const numSlices = 24;
        const sliceAngle = trailRad / numSlices;

        for (let i = 0; i < numSlices; i++) {
          const sliceStart = startRad + i * sliceAngle;
          const sliceEnd = sliceStart + sliceAngle + 0.005;
          const alpha = (i / numSlices) * 0.22; // max alpha 0.22 at the leading ray

          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, radius, sliceStart, sliceEnd);
          ctx.closePath();
          ctx.fillStyle = `rgba(6, 182, 212, ${alpha})`;
          ctx.fill();
        }

        // Leading Sweep Ray (Bright phosphor edge)
        const leadX = cx + radius * Math.cos(currentRad);
        const leadY = cy + radius * Math.sin(currentRad);

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(leadX, leadY);
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.95)';
        ctx.lineWidth = 1.8;
        ctx.shadowColor = 'rgba(6, 182, 212, 0.8)';
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset
      }

      // 4. Center Tower Reticle Marker
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#22d3ee';
      ctx.fill();
      ctx.strokeStyle = '#082f49';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();

      // Outer boundary ring of the radar scope
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.65)';
      ctx.lineWidth = 2;
      ctx.stroke();

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    lastTimeRef.current = performance.now();
    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      map.off('resize', handleResize);
    };
  }, [map, radarCoords, rangeKm, isSweepActive, sweepSpeedRpm, echoBounds, echoOpacity]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-[400] w-full h-full"
    />
  );
};
