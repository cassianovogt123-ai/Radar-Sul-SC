// Raios detectados pelo satélite GOES-19 (sensor GLM), via SSEC RealEarth — mesma fonte do satélite.
// Mostra os últimos minutos sobre o mapa do radar, numa camada própria acima das imagens.
import { useEffect, useState } from 'react';
import L from 'leaflet';
import { REALEARTH, getText, parseRealEarthTime, realEarthStamp } from './SatelliteView';

const PRODUCT = 'glmgroupdensity';
const MINUTES = 5; // o produto sai a cada 1 min; empilha os últimos 5
const STALE_MS = 20 * 60000;

export function useLightningLayer(map: L.Map | null, enabled: boolean): number | null {
  const [latest, setLatest] = useState<number | null>(null);
  useEffect(() => {
    if (!map || !enabled) {
      setLatest(null);
      return;
    }
    if (!map.getPane('lightning')) {
      const pane = map.createPane('lightning');
      pane.style.zIndex = '450';
      pane.style.pointerEvents = 'none';
      // a fonte pinta os raios de amarelo, igual aos 45 dBZ do radar: vira branco com brilho para não confundir
      pane.style.filter = 'grayscale(1) brightness(3) drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 3px rgba(250, 204, 21, 0.95))';
    }
    let layers: L.TileLayer[] = [];
    let alive = true;
    const load = async () => {
      try {
        const json = JSON.parse(await getText(`${REALEARTH}/api/times?products=${PRODUCT}`));
        const times = ((json?.[PRODUCT] || []) as string[]).map(parseRealEarthTime).filter((t) => !isNaN(t)).sort((a, b) => a - b);
        const last = times.slice(-MINUTES).filter((t) => Date.now() - t < STALE_MS);
        if (!alive) return;
        const next = last.map((t, i) =>
          L.tileLayer(`${REALEARTH}/tiles/${PRODUCT}/${realEarthStamp(t)}/{z}/{x}/{y}.png`, {
            pane: 'lightning',
            maxNativeZoom: 7,
            opacity: 0.3 + (0.45 * (i + 1)) / last.length,
          }).addTo(map)
        );
        layers.forEach((l) => map.removeLayer(l));
        layers = next;
        setLatest(last.length ? last[last.length - 1] : null);
      } catch {
        // fonte fora do ar: tira os raios antigos para não parecerem atuais
        layers.forEach((l) => map.removeLayer(l));
        layers = [];
        if (alive) setLatest(null);
      }
    };
    load();
    const id = setInterval(load, 2 * 60000);
    return () => {
      alive = false;
      clearInterval(id);
      layers.forEach((l) => map.removeLayer(l));
    };
  }, [map, enabled]);
  return latest;
}
