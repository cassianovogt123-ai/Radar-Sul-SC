// Animação do vento (estilo Windy): risquinhos que andam na direção e na velocidade do vento real.
// Dados: Open-Meteo (vento a 10 m, valor atual) numa grade de 8×8 pontos sobre a região,
// interpolada entre os pontos. Desenho num canvas por cima do mapa, sem mexer nas outras camadas.
import { useEffect, useState } from 'react';
import L from 'leaflet';

const N = 8; // pontos por lado da grade
const BOX = { s: -31.5, n: -23.5, w: -58.5, e: -48.5 }; // Oeste SC + RS/PR/Misiones/Paraguai
const REFRESH_MS = 60 * 60 * 1000; // o "agora" do Open-Meteo muda a cada 15 min; 1 h basta e poupa a cota grátis

export interface WindGrid {
  u: Float32Array; // km/h para leste
  v: Float32Array; // km/h para norte
  at: number;
}

const lat = (i: number) => BOX.s + ((BOX.n - BOX.s) * i) / (N - 1);
const lon = (j: number) => BOX.w + ((BOX.e - BOX.w) * j) / (N - 1);

export async function fetchWindGrid(): Promise<WindGrid> {
  const lats: string[] = [];
  const lons: string[] = [];
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      lats.push(lat(i).toFixed(2));
      lons.push(lon(j).toFixed(2));
    }
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}` +
    `&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh&timezone=UTC`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = await res.json();
  const list = Array.isArray(json) ? json : [json];
  const u = new Float32Array(N * N);
  const v = new Float32Array(N * N);
  list.forEach((p: any, k: number) => {
    const s = Number(p?.current?.wind_speed_10m) || 0;
    // direção = de onde o vento VEM; o risquinho anda para o lado oposto
    const d = ((Number(p?.current?.wind_direction_10m) || 0) * Math.PI) / 180;
    u[k] = -s * Math.sin(d);
    v[k] = -s * Math.cos(d);
  });
  return { u, v, at: Date.now() };
}

/** Vento interpolado (km/h, leste e norte) num ponto; null fora da grade. */
export function windAt(g: WindGrid, la: number, lo: number): [number, number] | null {
  const fi = ((la - BOX.s) / (BOX.n - BOX.s)) * (N - 1);
  const fj = ((lo - BOX.w) / (BOX.e - BOX.w)) * (N - 1);
  if (fi < 0 || fj < 0 || fi > N - 1 || fj > N - 1) return null;
  const i = Math.min(N - 2, Math.floor(fi));
  const j = Math.min(N - 2, Math.floor(fj));
  const a = fi - i;
  const b = fj - j;
  const mix = (f: Float32Array) =>
    f[i * N + j] * (1 - a) * (1 - b) + f[i * N + j + 1] * (1 - a) * b + f[(i + 1) * N + j] * a * (1 - b) + f[(i + 1) * N + j + 1] * a * b;
  return [mix(g.u), mix(g.v)];
}

/** Liga a animação; devolve a hora dos dados (ou null). */
export function useWindLayer(map: L.Map | null, enabled: boolean): number | null {
  const [at, setAt] = useState<number | null>(null);

  useEffect(() => {
    if (!map || !enabled) {
      setAt(null);
      return;
    }
    const box = map.getContainer();
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:440';
    box.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;
    let grid: WindGrid | null = null;
    let raf = 0;
    let alive = true;
    let w = 0;
    let h = 0;
    let dpr = 1;
    type P = { x: number; y: number; age: number };
    let parts: P[] = [];

    const spawn = (p: P) => {
      p.x = Math.random() * w;
      p.y = Math.random() * h;
      p.age = Math.floor(Math.random() * 80);
    };
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = box.clientWidth;
      h = box.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // ~1 risquinho a cada 650 px² de tela
      parts = Array.from({ length: Math.min(2500, Math.round((w * h) / 650)) }, () => {
        const p = { x: 0, y: 0, age: 0 };
        spawn(p);
        return p;
      });
    };
    const clear = () => ctx.clearRect(0, 0, w, h);

    const frame = () => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!grid || document.hidden) return;
      // rastro: apaga um pouco o quadro anterior em vez de limpar tudo
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = 'rgba(0,0,0,0.86)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 1;
      for (const p of parts) {
        const ll = map.containerPointToLatLng([p.x, p.y]);
        const wv = windAt(grid, ll.lat, ll.lng);
        if (!wv || p.age++ > 90) {
          spawn(p);
          continue;
        }
        const speed = Math.hypot(wv[0], wv[1]);
        // 0,04 px por km/h a cada quadro: 25 km/h ≈ 1 px/quadro (~60 px/s)
        const nx = p.x + wv[0] * 0.04;
        const ny = p.y - wv[1] * 0.04;
        // mais forte = mais claro e mais amarelado
        const t = Math.min(1, speed / 60);
        ctx.strokeStyle = `rgba(255,${Math.round(255 - 70 * t)},${Math.round(255 - 200 * t)},${0.45 + 0.45 * t})`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        p.x = nx;
        p.y = ny;
        if (nx < 0 || ny < 0 || nx > w || ny > h) spawn(p);
      }
    };

    const load = () =>
      fetchWindGrid()
        .then((g) => {
          if (!alive) return;
          grid = g;
          setAt(g.at);
        })
        .catch(() => {
          // sem dados: não anima vento antigo/inventado
          grid = null;
          clear();
          if (alive) setAt(null);
        });

    resize();
    load();
    const id = setInterval(load, REFRESH_MS);
    // ao mexer o mapa os risquinhos antigos ficariam no lugar errado: limpa e recomeça
    map.on('movestart zoomstart', clear);
    map.on('resize', resize);
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearInterval(id);
      map.off('movestart zoomstart', clear);
      map.off('resize', resize);
      canvas.remove();
    };
  }, [map, enabled]);

  return at;
}
