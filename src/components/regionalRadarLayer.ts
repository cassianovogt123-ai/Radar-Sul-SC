// Radares de outras regiões (RS, PR, Argentina, Paraguai…) via RainViewer, que junta radares
// oficiais do mundo todo (uso pessoal gratuito, até o zoom 7, só a paleta "Universal Blue").
// Fica POR BAIXO do radar de Chapecó e é recortada dentro do círculo de alcance dele:
// lá dentro vale só o nosso radar, com os quadradinhos de ~600 m e o efeito do feixe.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { getText } from './SatelliteView';

const INDEX = 'https://api.rainviewer.com/public/weather-maps.json';
const MAX_ZOOM = 7; // limite do plano gratuito; acima disso o Leaflet amplia os quadradinhos
const REFRESH_MS = 5 * 60000;

const RegionalLayer = L.GridLayer.extend({
  createTile(this: any, coords: L.Coords, done: L.DoneCallback) {
    const size = this.getTileSize();
    const canvas = L.DomUtil.create('canvas', 'radar-pixelated') as HTMLCanvasElement;
    canvas.width = size.x;
    canvas.height = size.y;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      // recorta o alcance de Chapecó (elipse em pixels deste nível de zoom)
      const { center, rangeKm } = this.options;
      const map: L.Map = this._map;
      const origin = coords.scaleBy(size);
      const c = map.project(center, coords.z).subtract(origin);
      const n = map.project([center[0] + rangeKm / 111.2, center[1]], coords.z).subtract(origin);
      const e = map.project([center[0], center[1] + rangeKm / (111.32 * Math.cos((center[0] * Math.PI) / 180))], coords.z).subtract(origin);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, Math.abs(e.x - c.x), Math.abs(c.y - n.y), 0, 0, Math.PI * 2);
      ctx.fill();
      done(undefined, canvas);
    };
    img.onerror = () => done(undefined, canvas); // tile vazio: sem chuva ou fora da cobertura
    // 0_0 = sem suavização, sem cor de neve: mantém o aspecto quadriculado
    img.src = `${this.options.host}${this.options.path}/256/${coords.z}/${coords.x}/${coords.y}/2/0_0.png`;
    return canvas;
  },
});

/** Liga a camada regional; devolve o horário da imagem mostrada (ou null). */
export function useRegionalRadarLayer(
  map: L.Map | null,
  enabled: boolean,
  center: [number, number],
  rangeKm: number,
  opacity: number
): number | null {
  const [latest, setLatest] = useState<number | null>(null);
  const layerRef = useRef<L.GridLayer | null>(null);
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;
  useEffect(() => {
    layerRef.current?.setOpacity(opacity);
  }, [opacity]);
  useEffect(() => {
    if (!map || !enabled) {
      setLatest(null);
      return;
    }
    let layer: L.GridLayer | null = null;
    let alive = true;
    const load = async () => {
      try {
        const json = JSON.parse(await getText(INDEX));
        const last = json?.radar?.past?.[json.radar.past.length - 1];
        if (!alive || !json?.host || !last?.path) return;
        const next = new (RegionalLayer as any)({
          host: json.host,
          path: last.path,
          center,
          rangeKm,
          maxNativeZoom: MAX_ZOOM,
          opacity: opacityRef.current,
          zIndex: 150, // abaixo do radar de Chapecó (200)
        }) as L.GridLayer;
        next.addTo(map);
        if (layer) map.removeLayer(layer);
        layer = next;
        layerRef.current = next;
        setLatest(last.time * 1000);
      } catch {
        // fonte fora do ar: tira a imagem antiga para não parecer atual
        if (layer) map.removeLayer(layer);
        layer = null;
        if (alive) setLatest(null);
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
      if (layer) map.removeLayer(layer);
    };
  }, [map, enabled, center, rangeKm]);
  return latest;
}
