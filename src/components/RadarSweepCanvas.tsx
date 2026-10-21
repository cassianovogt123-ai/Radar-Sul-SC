import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { playSonarPing, perfToAudioTime } from '../utils/audio';
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

// A nuvem só aparece no rastro logo atrás da linha do sonar e some em
// seguida. Fora dessa faixa (inclusive à frente da linha) fica oculta.
// Ex.: 50° ≈ 2,8 s visível por volta a 3 RPM.
const ECHO_FADE_DEG = 50;

/** Resolução angular da detecção de nuvens (0,5°). */
const PING_BINS = 720;

interface PingEvent {
  bin: number; // ângulo (em bins de 0,5°) onde a linha toca a formação pela 1ª vez
  intensity: number; // 0..1
}

const mercY = (latDeg: number) =>
  (Math.log(Math.tan(Math.PI / 4 + (latDeg * Math.PI) / 360)) * 180) / Math.PI;

/**
 * Encontra cada formação de nuvem do jeito que ela é DESENHADA na tela
 * (mesma projeção do mapa) e devolve o ângulo exato em que a linha do sonar
 * encosta nela pela primeira vez. Uma formação = um ping, mesmo que outra
 * nuvem esteja na mesma direção em outra distância.
 */
function buildPingEvents(
  img: HTMLImageElement,
  bounds: [[number, number], [number, number]],
  radar: [number, number],
  rangeKm: number,
): PingEvent[] | null {
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
    const yTop = mercY(maxLat);
    const yBot = mercY(minLat);
    const x0 = radar[1];
    const y0 = mercY(radar[0]);
    // mesmo raio que o canvas usa para o disco do radar
    const rho = mercY(radar[0] + rangeKm / 110.85) - y0;

    const R = 125; // anéis de distância (~2 km cada)
    const A = PING_BINS;
    const grid = new Float32Array(A * R); // 0 = sem nuvem; >0 = dBZ
    for (let a = 0; a < A; a++) {
      const th = ((a + 0.5) / A) * 2 * Math.PI; // ângulo de tela, horário a partir do leste
      const ct = Math.cos(th);
      const st = Math.sin(th);
      for (let r = 1; r < R; r++) {
        const d = ((r + 0.5) / R) * rho;
        const X = x0 + d * ct;
        const Y = y0 - d * st; // tela: y para baixo
        const px = Math.floor(((X - minLon) / (maxLon - minLon)) * w);
        const py = Math.floor(((yTop - Y) / (yTop - yBot)) * h);
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const i = (py * w + px) * 4;
        if (data[i + 3] <= 40) continue;
        const dbz = estimateDbzFromRgb(data[i], data[i + 1], data[i + 2]);
        if (dbz >= DBZ_PRECIPITATION_THRESHOLD) grid[a * R + r] = dbz;
      }
    }

    // Formações = regiões conectadas na grade polar (o ângulo dá a volta em 360°)
    const seen = new Uint8Array(A * R);
    const events: PingEvent[] = [];
    const stack: number[] = [];
    const occupied = new Uint8Array(A);
    for (let start = 0; start < A * R; start++) {
      if (!grid[start] || seen[start]) continue;
      occupied.fill(0);
      let cells = 0;
      let maxDbz = 0;
      stack.push(start);
      seen[start] = 1;
      while (stack.length) {
        const k = stack.pop() as number;
        const a = Math.floor(k / R);
        const r = k % R;
        cells++;
        occupied[a] = 1;
        if (grid[k] > maxDbz) maxDbz = grid[k];
        const nb = [((a + 1) % A) * R + r, ((a + A - 1) % A) * R + r, r + 1 < R ? k + 1 : -1, r > 1 ? k - 1 : -1];
        for (const n of nb) {
          if (n >= 0 && grid[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
      if (cells < 3) continue; // ignora ruído isolado
      // início no sentido do feixe = logo depois do maior trecho angular vazio
      let bestGap = -1;
      let bestStart = 0;
      let run = 0;
      for (let i = 0; i < 2 * A; i++) {
        if (!occupied[i % A]) {
          run++;
        } else {
          if (run > bestGap) {
            bestGap = run;
            bestStart = i % A;
          }
          run = 0;
        }
      }
      events.push({ bin: bestStart, intensity: Math.max(0.05, Math.min(1, (maxDbz - 10) / 50)) });
    }

    // formações que começam quase no mesmo ângulo viram um só ping (o mais forte)
    events.sort((x, y) => x.bin - y.bin);
    const merged: PingEvent[] = [];
    for (const ev of events) {
      const last = merged[merged.length - 1];
      if (last && ev.bin - last.bin <= 2) {
        last.intensity = Math.max(last.intensity, ev.intensity);
      } else {
        merged.push({ ...ev });
      }
    }
    return merged;
  } catch {
    // imagem sem permissão de leitura (CORS): sem som, o resto segue normal
    return null;
  }
}

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
  const pingEventsRef = useRef<PingEvent[] | null>(null);
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  // Ângulo acumulado (sem voltar a 0) para agendar os pings com antecedência
  const absAngleRef = useRef<number>(0);
  const lastScheduledAbsRef = useRef<number>(0);
  const pendingPingsRef = useRef<Array<{ evAbs: number; cancel: () => boolean }>>([]);
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
      pingEventsRef.current = echoBounds ? buildPingEvents(img, echoBounds, radarCoords, rangeKm) : null;
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
        // evita salto após app em segundo plano e nunca anda para trás
        const advance = Math.max(0, Math.min(degPerSec * dt, 30));
        absAngleRef.current += advance;
        angleRef.current = absAngleRef.current % 360;

        // Ping sincronizado com a linha: olha um pouco à frente do feixe e agenda
        // o som para sair do alto-falante no instante exato em que a linha encosta
        // na formação (relógio de saída do próprio aparelho). Qualquer velocidade.
        const events = pingEventsRef.current;
        const abs = absAngleRef.current;
        if (soundEnabledRef.current && events && events.length && degPerSec > 0) {
          const horizon = abs + degPerSec * 0.45;
          const from = Math.max(abs, lastScheduledAbsRef.current);
          if (horizon > from) {
            const turn0 = Math.floor(from / 360);
            const turn1 = Math.floor(horizon / 360);
            const pending: Array<{ evAbs: number; cancel: () => boolean }> = [];
            for (let turn = turn0; turn <= turn1; turn++) {
              for (const ev of events) {
                const evAbs = turn * 360 + (ev.bin * 360) / PING_BINS;
                if (evAbs > from && evAbs <= horizon) {
                  // instante (relógio da tela) em que a linha chega à formação
                  const atPerf = time + ((evAbs - abs) / degPerSec) * 1000;
                  const cancel = playSonarPing(ev.intensity, perfToAudioTime(atPerf));
                  if (cancel) pending.push({ evAbs, cancel });
                }
              }
            }
            if (pending.length) {
              pendingPingsRef.current = pendingPingsRef.current
                .filter((p) => p.evAbs > abs - 30)
                .concat(pending);
            }
            lastScheduledAbsRef.current = horizon;
          }
        } else {
          lastScheduledAbsRef.current = abs;
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
      // velocidade mudou / feixe pausado: cancela os pings que ainda não tocaram
      // e volta a agendá-los (com a nova velocidade) no próximo quadro.
      // Os que já começaram a tocar não são repetidos.
      for (const p of pendingPingsRef.current) {
        if (p.cancel()) {
          lastScheduledAbsRef.current = Math.min(lastScheduledAbsRef.current, p.evAbs - 1e-6);
        }
      }
      pendingPingsRef.current = [];
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
