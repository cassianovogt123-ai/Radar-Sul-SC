import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { RadarFrame, RadarMetadata } from '../types/radar';
import { RadarSweepCanvas } from './RadarSweepCanvas';
import { Crosshair, Plus, Minus } from 'lucide-react';

import { MunicipalityProximityStatus, ThreatLevel } from '../utils/cellTracker';
import { CityForecast, RAIN_LEVEL_LABEL, RainLevel } from '../services/forecast';

const RAIN_COLOR: Record<RainLevel, string> = {
  sem_chuva: '#94a3b8',
  leve: '#38bdf8',
  moderada: '#facc15',
  forte: '#f43f5e',
};

interface RadarMapProps {
  currentFrame: RadarFrame | null;
  opacity: number;
  radarMeta: RadarMetadata;
  isSweepActive: boolean;
  isSoundEnabled?: boolean;
  soundVolume?: number;
  sweepSpeedRpm?: number;
  baseMapType: 'osm' | 'dark' | 'satellite' | 'topo';
  onChangeBaseMap: (type: 'osm' | 'dark' | 'satellite' | 'topo') => void;
  municipalityThreats?: Record<string, MunicipalityProximityStatus>;
  cityForecasts?: Record<string, CityForecast>;
  onSelectMunicipality?: (cityName: string) => void;
  isChatOpen?: boolean;
}

// Confirmed municipalities in the radar coverage zone
export const NEARBY_CITIES = [
  { name: 'Chapecó', coords: [-27.0963, -52.6186] as [number, number], state: 'SC', isCenter: true },
  { name: 'Xaxim', coords: [-26.9597, -52.5367] as [number, number], state: 'SC' },
  { name: 'Xanxerê', coords: [-26.8747, -52.4036] as [number, number], state: 'SC' },
  { name: 'Concórdia', coords: [-27.2336, -52.0264] as [number, number], state: 'SC' },
  { name: 'Seara', coords: [-27.1489, -52.3117] as [number, number], state: 'SC' },
  { name: 'Pinhalzinho', coords: [-26.8483, -52.9961] as [number, number], state: 'SC' },
  { name: 'Maravilha', coords: [-26.7644, -53.1747] as [number, number], state: 'SC' },
  { name: 'São Miguel do Oeste', coords: [-26.7247, -53.5186] as [number, number], state: 'SC' },
  { name: 'Itapiranga', coords: [-27.1683, -53.7631] as [number, number], state: 'SC' },
  { name: 'Nonoai', coords: [-27.3589, -52.7733] as [number, number], state: 'RS' },
  { name: 'Erechim', coords: [-27.6342, -52.2739] as [number, number], state: 'RS' },
  { name: 'Passo Fundo', coords: [-28.2628, -52.4086] as [number, number], state: 'RS' },
  { name: 'Pato Branco', coords: [-26.2294, -52.6711] as [number, number], state: 'PR' },
  { name: 'Francisco Beltrão', coords: [-26.0811, -53.0550] as [number, number], state: 'PR' },
];

const BASEMAP_OPTIONS: { id: 'osm' | 'dark' | 'satellite' | 'topo'; label: string; title: string }[] = [
  { id: 'osm', label: 'Ruas', title: 'OpenStreetMap — ruas e limites' },
  { id: 'dark', label: 'Escuro', title: 'Esri Dark Gray — alto contraste para o radar' },
  { id: 'satellite', label: 'Satélite', title: 'Esri World Imagery' },
  { id: 'topo', label: 'Relevo', title: 'Esri Topográfico' },
];

export const RadarMap: React.FC<RadarMapProps> = ({
  currentFrame,
  opacity,
  radarMeta,
  isSweepActive,
  isSoundEnabled = false,
  soundVolume = 1,
  sweepSpeedRpm = 3,
  baseMapType,
  onChangeBaseMap,
  municipalityThreats,
  cityForecasts,
  onSelectMunicipality,
  isChatOpen = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);
  const imageOverlayRef = useRef<L.ImageOverlay | null>(null);
  const cityMarkersGroupRef = useRef<L.LayerGroup | null>(null);

  // Confirmed radar coordinates: Loteamento Desbravador, Chapecó / SC
  const RADAR_COORDS = React.useMemo<[number, number]>(
    () => [radarMeta.coordinates.lat, radarMeta.coordinates.lon],
    [radarMeta.coordinates.lat, radarMeta.coordinates.lon]
  );

  // Tile layer URLs dictionary
  const getTileConfig = (type: 'osm' | 'dark' | 'satellite' | 'topo') => {
    switch (type) {
      case 'osm':
        return {
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        };
      case 'dark':
        return {
          // CARTO passou a exigir chave de API; Esri Dark Gray é livre e sem chave
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
          attribution: '&copy; Esri',
          maxZoom: 19,
          maxNativeZoom: 16,
        };
      case 'satellite':
        return {
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          attribution: '&copy; Esri &copy; Maxar, Earthstar Geographics',
          maxZoom: 18,
        };
      case 'topo':
        return {
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
          attribution: '&copy; Esri Topographic',
          maxZoom: 18,
        };
    }
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstance) return;

    const map = L.map(mapContainerRef.current, {
      center: RADAR_COORDS,
      zoom: 8,
      zoomControl: false,
      attributionControl: false,
      minZoom: 6,
      maxZoom: 14,
    });

    // Add Base Tile Layer
    const cfg = getTileConfig(baseMapType);
    const baseTile = L.tileLayer(cfg.url, {
      maxZoom: cfg.maxZoom,
      subdomains: (cfg as any).subdomains || 'abc',
    }).addTo(map);
    baseTileLayerRef.current = baseTile;

    // 1. Radar Tower Marker (Loteamento Desbravador, Chapecó / SC)
    const radarTowerIcon = L.divIcon({
      className: 'radar-tower-pin',
      html: `
        <div class="relative flex items-center justify-center">
          <span class="absolute w-9 h-9 rounded-full bg-cyan-400/20 animate-ping"></span>
          <span class="absolute w-7 h-7 rounded-full border border-cyan-300/50"></span>
          <div class="w-4 h-4 rounded-full bg-cyan-300 border-2 border-[#050b18] shadow-[0_0_14px_3px_rgba(34,211,238,0.7)]"></div>
          <div class="absolute -top-9 whitespace-nowrap rounded-full border border-cyan-300/40 bg-[#050b18]/90 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wide text-cyan-200 shadow-lg">
            RADAR CHAPECÓ
          </div>
        </div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    const towerMarker = L.marker(RADAR_COORDS, { icon: radarTowerIcon, zIndexOffset: 1000 }).addTo(map);
    towerMarker.bindPopup(`
      <div class="pop-title">Radar Meteorológico de Chapecó</div>
      <div class="pop-row"><b>Operador</b><span>Defesa Civil SC / Epagri CIRAM</span></div>
      <div class="pop-row"><b>Local</b><span>Loteamento Desbravador, Chapecó</span></div>
      <div class="pop-row"><b>Coordenadas</b><span>-27.0968°, -52.6180°</span></div>
      <div class="pop-row"><b>Altitude</b><span>822 m (torre de 16,5 m)</span></div>
      <div class="pop-row"><b>Alcance</b><span>200 km (quantitativo) · 400 km (vigilância)</span></div>
      <div class="pop-row"><b>Varredura</b><span>a cada ~6 min</span></div>
    `, { maxWidth: 320 });

    // Layer Group for dynamic municipality markers
    const cityMarkersGroup = L.layerGroup().addTo(map);
    cityMarkersGroupRef.current = cityMarkersGroup;

    setMapInstance(map);

    return () => {
      map.remove();
      setMapInstance(null);
    };
  }, []);

  // Update dynamic municipality status markers (Verde, Amarelo, Laranja, Vermelho)
  useEffect(() => {
    if (!cityMarkersGroupRef.current || !mapInstance) return;
    cityMarkersGroupRef.current.clearLayers();

    NEARBY_CITIES.forEach((city) => {
      const isCenter = city.isCenter;
      const status = municipalityThreats ? municipalityThreats[city.name] : null;
      const threatLevel: ThreatLevel = status?.threatLevel || 'verde';

      let threatDotBg = 'bg-emerald-400';
      let threatText = isCenter ? 'text-amber-200 font-semibold' : 'text-slate-200';
      let pulseRing = '';

      if (threatLevel === 'amarelo') {
        threatDotBg = 'bg-amber-400';
        threatText = 'text-amber-200 font-semibold';
        pulseRing = '<div class="absolute w-4 h-4 rounded-full bg-amber-400/40 animate-ping"></div>';
      } else if (threatLevel === 'laranja') {
        threatDotBg = 'bg-orange-500';
        threatText = 'text-orange-200 font-semibold';
        pulseRing = '<div class="absolute w-5 h-5 rounded-full bg-orange-500/50 animate-ping"></div>';
      } else if (threatLevel === 'vermelho') {
        threatDotBg = 'bg-rose-500';
        threatText = 'text-rose-200 font-semibold';
        pulseRing = '<div class="absolute w-6 h-6 rounded-full bg-rose-500/60 animate-ping"></div>';
      }

      const isItapiranga = city.name === 'Itapiranga';

      const cityIcon = L.divIcon({
        className: 'city-pin',
        html: `
          <div class="relative flex items-center justify-center cursor-pointer">
            <div class="relative flex items-center justify-center">
              ${pulseRing}
              <div class="w-2.5 h-2.5 rounded-full ${isCenter ? 'bg-amber-400 ring-2 ring-amber-300/60' : threatDotBg} border border-[#050b18] shadow"></div>
            </div>
            <div class="absolute top-3.5 whitespace-nowrap rounded-full bg-[#050b18]/85 backdrop-blur-sm text-[10px] leading-none ${threatText} px-2 py-1 border ${isItapiranga ? 'border-cyan-300/70' : 'border-white/10'} shadow-md">
              ${city.name} <span class="text-slate-500">${city.state}</span>
            </div>
          </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      const marker = L.marker(city.coords, { icon: cityIcon }).addTo(cityMarkersGroupRef.current!);
      marker.on('click', () => {
        onSelectMunicipality?.(city.name);
      });
      const fc = cityForecasts?.[city.name];
      const rainRow = fc
        ? `<div class="pop-row"><b>Chuva (próx. 6 h)</b><span style="color:${RAIN_COLOR[fc.rainLevel]};font-weight:600">${
            RAIN_LEVEL_LABEL[fc.rainLevel]
          } · ${fc.rainProbability6h}%</span></div>`
        : `<div class="pop-row"><b>Chuva (próx. 6 h)</b><span>carregando…</span></div>`;
      marker.bindTooltip(`
        <div class="pop-title">${city.name} · ${city.state}</div>
        ${rainRow}
        <div class="pop-row"><b>Radar agora</b><span>${status?.threatTitle || 'Normal'}</span></div>
        <div style="color:#94a3b8;margin-top:4px;max-width:220px">Clique para ver detalhes e alertas</div>
      `, { direction: 'top', offset: [0, -10] });
    });
  }, [mapInstance, municipalityThreats, cityForecasts, onSelectMunicipality]);

  // Update base tile layer on style change
  useEffect(() => {
    if (!mapInstance) return;
    if (baseTileLayerRef.current) {
      mapInstance.removeLayer(baseTileLayerRef.current);
    }

    const cfg = getTileConfig(baseMapType);
    const newBase = L.tileLayer(cfg.url, {
      maxZoom: cfg.maxZoom,
      maxNativeZoom: (cfg as any).maxNativeZoom,
      subdomains: (cfg as any).subdomains || 'abc',
    }).addTo(mapInstance);

    // Ensure it sits at the bottom
    newBase.bringToBack();
    baseTileLayerRef.current = newBase;
  }, [baseMapType, mapInstance]);

  // Update real radar echoes overlay
  useEffect(() => {
    if (!mapInstance) return;

    if (imageOverlayRef.current) {
      mapInstance.removeLayer(imageOverlayRef.current);
      imageOverlayRef.current = null;
    }

    // Com o feixe girando, os ecos são desenhados pelo RadarSweepCanvas,
    // revelados somente onde a linha do sonar já passou.
    if (currentFrame?.imageUrl && !isSweepActive) {
      const bounds = radarMeta.leafletBounds;
      const overlay = L.imageOverlay(currentFrame.imageUrl, bounds, {
        opacity: opacity / 100,
        zIndex: 200,
        interactive: false,
      }).addTo(mapInstance);
      imageOverlayRef.current = overlay;
    }
  }, [currentFrame, opacity, radarMeta, mapInstance, isSweepActive]);

  // Recenter helper
  const handleRecenter = () => {
    if (!mapInstance) return;
    mapInstance.flyTo(RADAR_COORDS, 8, { duration: 1 });
  };

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden">
      {/* 1. Leaflet Base Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* 2. Rotating Radar Sweep Canvas (Feixe Giratório Contínuo) */}
      <RadarSweepCanvas
        map={mapInstance}
        radarCoords={RADAR_COORDS}
        rangeKm={radarMeta.rangeKm || 250}
        isSweepActive={isSweepActive}
        sweepSpeedRpm={sweepSpeedRpm}
        echoImageUrl={currentFrame?.imageUrl ?? null}
        echoBounds={radarMeta.leafletBounds}
        echoOpacity={opacity / 100}
        soundEnabled={isSoundEnabled}
        soundVolume={soundVolume}
      />

      {/* 3. Map HUD (top-right): zoom + recenter */}
      <div className={`absolute top-3 right-3 sm:top-4 z-[500] glass rounded-xl p-1 flex flex-col transition-[right] duration-200 ${isChatOpen ? 'sm:right-[25rem]' : 'sm:right-4'}`}>
        <button
          onClick={() => mapInstance?.zoomIn()}
          className="btn btn-icon border-transparent bg-transparent"
          aria-label="Aproximar"
          title="Aproximar"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={() => mapInstance?.zoomOut()}
          className="btn btn-icon border-transparent bg-transparent"
          aria-label="Afastar"
          title="Afastar"
        >
          <Minus className="w-4 h-4" />
        </button>
        <div className="h-px bg-white/10 my-1 mx-1.5" />
        <button
          onClick={handleRecenter}
          className="btn btn-icon border-transparent bg-transparent text-cyan-300"
          aria-label="Centralizar no radar"
          title="Centralizar no radar de Chapecó"
        >
          <Crosshair className="w-4 h-4" />
        </button>
      </div>

      {/* 4. Base map selector (top-left) */}
      <div
        role="radiogroup"
        aria-label="Mapa base"
        className="absolute top-3 left-3 sm:top-4 sm:left-4 z-[500] glass rounded-xl p-1 flex items-center gap-0.5"
      >
        {BASEMAP_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            role="radio"
            aria-checked={baseMapType === opt.id}
            onClick={() => onChangeBaseMap(opt.id)}
            title={opt.title}
            className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              baseMapType === opt.id
                ? 'bg-cyan-400/20 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};
