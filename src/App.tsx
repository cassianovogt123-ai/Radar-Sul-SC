import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RadarMap } from './components/RadarMap';
import { DbzLegend } from './components/DbzLegend';
import { RadarFrame, RadarMetadata, ConnectionStatus } from './types/radar';
import { RefreshCw, Play, Pause, Radio, Volume2, VolumeX, MessageSquare } from 'lucide-react';
import { unlockAudio, playRadarAlertChime, playApproachAlertChime } from './utils/audio';
declare const __APP_VERSION__: string;
import { fetchLatestRadarData } from './services/radarDirect';
import { CommunityChat } from './components/CommunityChat';
import { SupabaseSetupModal } from './components/SupabaseSetupModal';
import { MunicipalityDetailModal } from './components/MunicipalityDetailModal';
import { NEARBY_CITIES } from './components/RadarMap';
import { MonitorMode, MonitorModeSelector, SatelliteView } from './components/SatelliteView';
import {
  analyzeRadarEchoesReal,
  EchoAnalysisResult,
  DBZ_PRECIPITATION_THRESHOLD,
} from './utils/echoAnalyzer';
import {
  RainCell,
  MunicipalityProximityStatus,
  ThreatLevel,
  extractCellsFromImage,
  trackCellsBetweenFrames,
  evaluateMunicipalityThreat,
} from './utils/cellTracker';

const CHAPECO_RADAR_META: RadarMetadata = {
  code: 'CHP',
  name: 'Radar Meteorológico de Chapecó (Oeste SC)',
  operator: 'Defesa Civil de Santa Catarina / Epagri CIRAM',
  location: 'Rua Balduíno Battisti, Loteamento Desbravador, Chapecó - SC',
  coordinates: { lat: -27.0968, lon: -52.618 },
  band: 'Banda S/C Doppler Polarimétrico',
  rangeKm: 250,
  minLon: -55.0710069,
  minLat: -29.2106056,
  maxLon: -50.1335368,
  maxLat: -24.8625699,
  leafletBounds: [
    [-29.2106056, -55.0710069],
    [-24.8625699, -50.1335368],
  ],
};

const BASEMAP_CREDITS: Record<'osm' | 'dark' | 'satellite' | 'topo', string> = {
  osm: '© OpenStreetMap contributors',
  dark: '© CARTO · © OpenStreetMap',
  satellite: '© Esri · Maxar · Earthstar Geographics',
  topo: '© Esri',
};

export default function App() {
  const [currentFrame, setCurrentFrame] = useState<RadarFrame | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('conectado');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSweepActive, setIsSweepActive] = useState<boolean>(true);
  const [opacity, setOpacity] = useState<number>(85);
  const [baseMapType, setBaseMapType] = useState<'osm' | 'dark' | 'satellite' | 'topo'>('osm');
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState<boolean>(false);
  const [monitorMode, setMonitorMode] = useState<MonitorMode>('radar');

  // Proximity & Rain Cell Threat Monitoring State
  const [municipalityThreats, setMunicipalityThreats] = useState<Record<string, MunicipalityProximityStatus>>({});
  const [selectedMunicipality, setSelectedMunicipality] = useState<string | null>(null);

  const previousCellsRef = useRef<RainCell[]>([]);
  const previousTimestampRef = useRef<number | null>(null);
  const lastApproachAlertTimestampRef = useRef<number>(0);
  const lastAlertLevelsRef = useRef<Record<string, ThreatLevel>>({});

  // Audio Alert State: Exclusively sound-based (no on-screen popups, windows or banners)
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(false);
  const isAudioEnabledRef = useRef<boolean>(false);
  isAudioEnabledRef.current = isAudioEnabled;

  const previousAnalysisRef = useRef<EchoAnalysisResult | null>(null);
  const processedFramesRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef<boolean>(true);

  // Automatic evaluation of real radar echo pixels
  const evaluateEchoesForAlert = useCallback(async (frame: RadarFrame) => {
    if (!frame.imageUrl || !frame.filename) return;

    // Avoid duplicate evaluation of the exact same observation file
    if (processedFramesRef.current.has(frame.filename)) {
      return;
    }
    processedFramesRef.current.add(frame.filename);

    // If data is outdated (> 45 min), do NOT alert
    if (frame.ageMinutes > 45) {
      return;
    }

    const analysis = await analyzeRadarEchoesReal(
      frame.imageUrl,
      frame.filename,
      frame.timestamp,
      CHAPECO_RADAR_META,
      previousAnalysisRef.current,
      DBZ_PRECIPITATION_THRESHOLD
    );

    if (!analysis.dataValid) {
      return;
    }

    // Do NOT alert on initial page load if rain already exists
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      previousAnalysisRef.current = analysis;
      return;
    }

    // If a new precipitation activity was detected and audio is enabled, fire ONE short chime
    if (analysis.isNewPrecipitationActivity && isAudioEnabledRef.current) {
      playRadarAlertChime(0.85);
    }

    previousAnalysisRef.current = analysis;
  }, []);

  // Fetch latest radar scan from Defesa Civil SC SIFAP
  const fetchLatestRadar = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    setConnectionStatus('atualizando');

    try {
      const data = await fetchLatestRadarData('CHP', '0');
      if (data.success && data.latestFrame) {
        setCurrentFrame(data.latestFrame);

        // If data age is over 45 min, mark as outdated and disable alerting
        if (data.latestFrame.ageMinutes > 45) {
          setConnectionStatus('desatualizado');
        } else {
          setConnectionStatus('conectado');
          // Evaluate real dBZ pixels for precipitation onset
          evaluateEchoesForAlert(data.latestFrame);
        }
      } else {
        setConnectionStatus('desatualizado');
      }
    } catch (err) {
      console.warn('Erro ao atualizar varredura do radar:', err);
      setConnectionStatus('indisponivel');
    } finally {
      if (isManual) setIsRefreshing(false);
    }
  }, [evaluateEchoesForAlert]);

  // Initial load and auto-refresh every 60 seconds
  useEffect(() => {
    fetchLatestRadar();
    const interval = setInterval(() => {
      fetchLatestRadar();
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchLatestRadar]);

  // Toggle Audio with user interaction required by modern browsers
  const handleToggleAudio = async () => {
    if (!isAudioEnabled) {
      // Unlocks browser Web Audio API on click/tap gesture
      await unlockAudio();
      setIsAudioEnabled(true);
      // Play a short confirmation chime so the user verifies speaker volume immediately
      playRadarAlertChime(0.65);
    } else {
      setIsAudioEnabled(false);
    }
  };

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'conectado':
        return { text: 'Ao vivo', title: 'Conectado · dados oficiais', dot: 'bg-emerald-400', ping: true, tone: 'text-emerald-300 border-emerald-400/25 bg-emerald-400/10' };
      case 'atualizando':
        return { text: 'Atualizando', title: 'Buscando nova varredura', dot: 'bg-amber-400', ping: true, tone: 'text-amber-300 border-amber-400/25 bg-amber-400/10' };
      case 'desatualizado':
        return { text: 'Desatualizado', title: 'Dados com mais de 45 min — alertas desativados', dot: 'bg-orange-400', ping: false, tone: 'text-orange-300 border-orange-400/25 bg-orange-400/10' };
      case 'indisponivel':
        return { text: 'Offline', title: 'Servidor indisponível', dot: 'bg-rose-500', ping: false, tone: 'text-rose-300 border-rose-400/25 bg-rose-400/10' };
    }
  };

  const status = getStatusBadge();
  const ageLabel = currentFrame
    ? currentFrame.ageMinutes === 0
      ? 'agora'
      : `há ${currentFrame.ageMinutes} min`
    : null;

  return (
    <div className="flex flex-col h-dvh w-screen bg-[#050b18] text-slate-100 font-sans overflow-hidden select-none">
      {/* 1. Top bar */}
      <header className="relative z-30 shrink-0 h-14 px-3 sm:px-5 flex items-center justify-between gap-3 border-b border-white/[0.07] bg-[#050b18]/90 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400/25 to-sky-600/10 border border-cyan-400/30 shrink-0">
            <Radio className="w-[18px] h-[18px] text-cyan-300" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_8px_2px_rgba(34,211,238,0.6)]" />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="text-[15px] font-semibold tracking-tight text-white truncate">
              Radar Chapecó
            </h1>
            <p className="font-mono text-[11px] text-slate-400 truncate">
              <span className="hidden sm:inline">Defesa Civil SC · SIFAP · Morro da Cruz 822 m</span>
              <span className="sm:hidden">{ageLabel ? `Última varredura ${ageLabel}` : 'Defesa Civil SC'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentFrame && (
            <div className="hidden md:flex flex-col items-end leading-tight mr-1 font-mono tabular-nums">
              <span className="text-[13px] font-medium text-slate-100">{currentFrame.brtDisplay}</span>
              <span className="text-[11px] text-slate-500">
                {currentFrame.utcDisplay} · {ageLabel}
              </span>
            </div>
          )}

          <div
            title={status.title}
            className={`inline-flex items-center gap-2 h-8 px-2.5 rounded-full border text-[11px] font-medium ${status.tone}`}
          >
            <span className="relative flex h-2 w-2">
              {status.ping && (
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${status.dot}`} />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${status.dot}`} />
            </span>
            <span className="hidden sm:inline">{status.text}</span>
          </div>

          <div className="w-px h-6 bg-white/10 mx-0.5 hidden sm:block" />

          <button
            onClick={handleToggleAudio}
            data-active={isAudioEnabled}
            className="btn btn-icon sm:w-auto sm:px-3"
            aria-pressed={isAudioEnabled}
            aria-label={isAudioEnabled ? 'Desativar alerta sonoro' : 'Ativar alerta sonoro'}
            title={
              isAudioEnabled
                ? 'Alerta sonoro ativado — clique para silenciar'
                : 'Ativar alerta sonoro para nova chuva (≥10 dBZ)'
            }
          >
            {isAudioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{isAudioEnabled ? 'Som ativo' : 'Ativar som'}</span>
          </button>

          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            data-active={isChatOpen}
            className="btn btn-icon sm:w-auto sm:px-3"
            aria-label="Abrir chat regional"
            title="Chat comunitário de Chapecó e Oeste de SC"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Chat</span>
          </button>

          <button
            onClick={() => fetchLatestRadar(true)}
            disabled={isRefreshing}
            className="btn btn-icon"
            aria-label="Atualizar varredura"
            title="Buscar nova varredura no servidor da Defesa Civil SC"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-300' : ''}`} />
          </button>
        </div>
      </header>

      {/* 2. Radar viewport */}
      <main className="flex-1 relative w-full overflow-hidden">
        <RadarMap
          currentFrame={currentFrame}
          opacity={opacity}
          radarMeta={CHAPECO_RADAR_META}
          isSweepActive={isSweepActive}
          isSoundEnabled={isAudioEnabled}
          baseMapType={baseMapType}
          onChangeBaseMap={setBaseMapType}
        />

        {/* Bottom overlay: legend (left) + controls (right); stacks on mobile */}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 sm:inset-x-4 sm:bottom-4 z-[500] flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="pointer-events-auto">
            <DbzLegend />
          </div>

          <div className="pointer-events-auto glass rounded-2xl p-2 flex items-center justify-between sm:justify-start gap-3">
            <button
              onClick={() => setIsSweepActive(!isSweepActive)}
              data-active={isSweepActive}
              className="btn"
              aria-pressed={isSweepActive}
              title="Ligar ou pausar a animação do feixe de varredura"
            >
              {isSweepActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isSweepActive ? 'Pausar feixe' : 'Girar feixe'}</span>
            </button>

            <label className="flex items-center gap-2.5 pr-2">
              <span className="eyebrow">Ecos</span>
              <input
                type="range"
                min={10}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="range-cyan w-24 sm:w-28"
                style={{ ['--fill' as string]: `${((opacity - 10) / 90) * 100}%` }}
                aria-label="Opacidade dos ecos do radar"
              />
              <span className="font-mono text-[11px] text-slate-300 tabular-nums w-8 text-right">
                {opacity}%
              </span>
            </label>
          </div>
        </div>

        {monitorMode === 'satelite' && <SatelliteView />}
        <MonitorModeSelector value={monitorMode} onChange={setMonitorMode} />
      </main>

      {/* 3. Footer */}
      <footer className="hidden sm:flex shrink-0 h-8 px-5 items-center justify-between gap-4 border-t border-white/[0.07] bg-[#050b18]/90 font-mono text-[11px] text-slate-500">
        <div className="flex items-center gap-2 truncate">
          <span>Alcance 250 km</span>
          <span className="text-slate-700">·</span>
          <span>Limiar de alerta ≥10 dBZ</span>
          <span className="text-slate-700">·</span>
          <span>WGS84</span>
          <span className="text-slate-700">·</span>
          <span>v{__APP_VERSION__}</span>
        </div>
        <div className="flex items-center gap-2 truncate">
          <span className="text-cyan-300/70">Varredura a cada ~6 min</span>
          <span className="text-slate-700">·</span>
          <span className="truncate">{BASEMAP_CREDITS[baseMapType]}</span>
        </div>
      </footer>

      {/* 4. Community chat drawer */}
      <CommunityChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onOpenSupabaseModal={() => setIsSupabaseModalOpen(true)}
      />

      {/* 5. Supabase setup modal */}
      <SupabaseSetupModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
      />
    </div>
  );
}
