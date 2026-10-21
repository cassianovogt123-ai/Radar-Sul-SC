import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

interface RadarSweepCanvasProps {
  map: L.Map | null;
  radarCoords: [number, number];
  rangeKm: number;
  isSweepActive: boolean;
  sweepSpeedRpm?: number; // e.g. 3 RPM (20 seconds per rotation)
}

export const RadarSweepCanvas: React.FC<RadarSweepCanvasProps> = ({
  map,
  radarCoords,
  rangeKm = 250,
  isSweepActive = true,
  sweepSpeedRpm = 3, // 3 RPM is typical for surveillance radar
}) => {
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
        angleRef.current = (angleRef.current + degPerSec * dt) % 360;
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
  }, [map, radarCoords, rangeKm, isSweepActive, sweepSpeedRpm]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-[400] w-full h-full"
    />
  );
};
