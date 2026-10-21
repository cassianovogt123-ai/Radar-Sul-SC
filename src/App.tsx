import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RadarMap } from './components/RadarMap';
import { DbzLegend } from './components/DbzLegend';
import { RadarFrame, RadarMetadata, ConnectionStatus } from './types/radar';
import { RefreshCw, Play, Pause, Radio, Volume1, Volume2, VolumeX, MessageSquare } from 'lucide-react';
import { unlockAudio, playRadarAlertChime, playApproachAlertChime, playSonarPing } from './utils/audio';
declare const __APP_VERSION__: string;
import { fetchLatestRadarData } from './services/radarDirect';
import { CityForecast, fetchCityForecasts } from './services/forecast';
import { CapAlert } from './services/capAlerts';
import { fetchDefesaCivilAlerts } from './services/defesaCivilAlerts';
import { fetchInmetAlerts } from './services/inmetAlerts';
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
  dark: '© Esri',
  satellite: '© Esri · Maxar · Earthstar Geographics',
  topo: '© Esri',
};

export default function App() {
  const [currentFrame, setCurrentFrame] = useState<RadarFrame | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('conectado');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSweepActive, setIsSweepActive] = useState<boolean>(true);
  // Velocidade do feixe (voltas por minuto); o som acompanha a linha em qualquer uma
  const SWEEP_SPEEDS = [
    { rpm: 3, label: '1×' },
    { rpm: 6, label: '2×' },
    { rpm: 10, label: '3×' },
  ];
  const [sweepSpeedIdx, setSweepSpeedIdx] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem('sweepSpeedIdx'));
      return v >= 0 && v < 3 ? v : 0;
    } catch {
      return 0;
    }
  });
  // Som do feixe (ping do sonar): liga/desliga e volume próprios,
  // independentes do alerta sonoro de chuva do cabeçalho
  const readPref = (key: string, fallback: number) => {
    try {
      const raw = localStorage.getItem(key);
      const v = raw === null ? NaN : Number(raw);
      return Number.isFinite(v) ? v : fallback;
    } catch {
      return fallback;
    }
  };
  const savePref = (key: string, value: number) => {
    try {
      localStorage.setItem(key, String(value));
    } catch {}
  };
  const [isBeamSoundOn, setIsBeamSoundOn] = useState<boolean>(() => readPref('beamSoundOn', 1) === 1);
  const [beamVolume, setBeamVolume] = useState<number>(() => Math.max(0, Math.min(100, readPref('beamVolume', 60))));
  const [isBeamPanelOpen, setIsBeamPanelOpen] = useState<boolean>(false);
  const beamPanelRef = useRef<HTMLDivElement | null>(null);
  // 60% = volume padrão do ping; 100% ≈ 1,7× mais alto
  const beamVolumeFactor = beamVolume / 60;

  const toggleBeamSound = async () => {
    const next = !isBeamSoundOn;
    if (next) await unlockAudio();
    setIsBeamSoundOn(next);
    savePref('beamSoundOn', next ? 1 : 0);
  };
  const changeBeamVolume = (v: number) => {
    setBeamVolume(v);
    savePref('beamVolume', v);
  };
  const testBeamSound = async () => {
    await unlockAudio();
    playSonarPing(0.5, undefined, beamVolumeFactor);
  };

  // O navegador só libera o áudio após um toque: o primeiro toque na tela já libera
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Fecha o painel de som do feixe ao tocar fora dele
  useEffect(() => {
    if (!isBeamPanelOpen) return;
    const close = (e: PointerEvent) => {
      if (beamPanelRef.current && !beamPanelRef.current.contains(e.target as Node)) setIsBeamPanelOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [isBeamPanelOpen]);

  const cycleSweepSpeed = () => {
    setSweepSpeedIdx((i) => {
      const n = (i + 1) % SWEEP_SPEEDS.length;
      try {
        localStorage.setItem('sweepSpeedIdx', String(n));
      } catch {}
      return n;
    });
  };
  const [opacity, setOpacity] = useState<number>(85);
  const [baseMapType, setBaseMapType] = useState<'osm' | 'dark' | 'satellite' | 'topo'>('osm');
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState<boolean>(false);
  const [monitorMode, setMonitorMode] = useState<MonitorMode>('radar');

  // Proximity & Rain Cell Threat Monitoring State
  const [municipalityThreats, setMunicipalityThreats] = useState<Record<string, MunicipalityProximityStatus>>({});
  const [selectedMunicipality, setSelectedMunicipality] = useState<string | null>(null);

  // Previsão de chuva por município (Open-Meteo) — atualiza a cada 30 min
  const [cityForecasts, setCityForecasts] = useState<Record<string, CityForecast>>({});
  // Alertas oficiais da Defesa Civil — baixados ao abrir os detalhes (cache de 15 min)
  const [dcAlerts, setDcAlerts] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; alerts: CapAlert[]; at: number | null; error?: string }>({
    status: 'idle',
    alerts: [],
    at: null,
  });
  const [inmetAlerts, setInmetAlerts] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; alerts: CapAlert[]; at: number | null; error?: string }>({
    status: 'idle',
    alerts: [],
    at: null,
  });

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

  // Células de chuva do radar -> nível de ameaça por município
  const updateMunicipalityThreats = useCallback(async (frame: RadarFrame) => {
    if (!frame.imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = frame.imageUrl as string;
    });
    if (!loaded) return;
    let cells: RainCell[] = [];
    try {
      cells = extractCellsFromImage(img, CHAPECO_RADAR_META, DBZ_PRECIPITATION_THRESHOLD);
    } catch {
      return; // imagem sem permissão de leitura
    }
    const prevTs = previousTimestampRef.current;
    if (prevTs !== null && frame.timestamp > prevTs) {
      cells = trackCellsBetweenFrames(cells, previousCellsRef.current, (frame.timestamp - prevTs) / 60000);
    }
    if (prevTs === null || frame.timestamp > prevTs) {
      previousCellsRef.current = cells;
      previousTimestampRef.current = frame.timestamp;
    }
    const isOutdated = frame.ageMinutes > 45;
    const next: Record<string, MunicipalityProximityStatus> = {};
    for (const city of NEARBY_CITIES) {
      next[city.name] = evaluateMunicipalityThreat(
        city.name,
        city.state,
        city.coords,
        cells,
        frame.brtDisplay,
        isOutdated
      );
    }
    setMunicipalityThreats(next);

    // Som de aproximação: só quando alguma cidade SOBE para laranja/vermelho (no máx. 1 a cada 10 min)
    const order: ThreatLevel[] = ['verde', 'amarelo', 'laranja', 'vermelho'];
    const escalated = Object.values(next).some((st) => {
      const before = lastAlertLevelsRef.current[st.cityName] ?? 'verde';
      return order.indexOf(st.threatLevel) > order.indexOf(before) && order.indexOf(st.threatLevel) >= 2;
    });
    lastAlertLevelsRef.current = Object.fromEntries(Object.values(next).map((st) => [st.cityName, st.threatLevel]));
    if (
      escalated &&
      isAudioEnabledRef.current &&
      !isOutdated &&
      Date.now() - lastApproachAlertTimestampRef.current > 10 * 60 * 1000
    ) {
      lastApproachAlertTimestampRef.current = Date.now();
      playApproachAlertChime(0.8);
    }
  }, []);

  useEffect(() => {
    if (currentFrame) updateMunicipalityThreats(currentFrame);
  }, [currentFrame?.filename, currentFrame?.imageUrl, updateMunicipalityThreats]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchCityForecasts(NEARBY_CITIES)
        .then((f) => alive && setCityForecasts(f))
        .catch((err) => console.warn('Previsão indisponível:', err));
    load();
    const id = setInterval(load, 30 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Alertas oficiais: Defesa Civil (IDAP) e INMET, consultados em paralelo e independentes
  const loadDefesaCivilAlerts = useCallback(async (force = false) => {
    setDcAlerts((s) => ({ ...s, status: s.status === 'ok' && !force ? 'ok' : 'loading', error: undefined }));
    setInmetAlerts((s) => ({ ...s, status: s.status === 'ok' && !force ? 'ok' : 'loading', error: undefined }));
    await Promise.all([
      fetchDefesaCivilAlerts(force)
        .then(({ alerts, at }) => setDcAlerts({ status: 'ok', alerts, at }))
        .catch((err: any) =>
          setDcAlerts((s) => ({ ...s, status: 'error', error: err?.message || 'Falha ao consultar a Defesa Civil' }))
        ),
      fetchInmetAlerts(force)
        .then(({ alerts, at }) => setInmetAlerts({ status: 'ok', alerts, at }))
        .catch((err: any) =>
          setInmetAlerts((s) => ({ ...s, status: 'error', error: err?.message || 'Falha ao consultar o INMET' }))
        ),
    ]);
  }, []);

  const openMunicipality = useCallback(
    (name: string) => {
      setSelectedMunicipality(name);
      loadDefesaCivilAlerts();
    },
    [loadDefesaCivilAlerts]
  );

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
              VogtSonar Sul
            </h1>
            <p className="font-mono text-[11px] text-slate-400 truncate">
              <span className="hidden sm:inline">Radar Chapecó · Defesa Civil SC · Morro da Cruz 822 m</span>
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
            <span className="hidden sm:inline">{isAudioEnabled ? 'Alerta ativo' : 'Ativar alerta'}</span>
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
          isSoundEnabled={isBeamSoundOn && isSweepActive}
          soundVolume={beamVolumeFactor}
          sweepSpeedRpm={SWEEP_SPEEDS[sweepSpeedIdx].rpm}
          baseMapType={baseMapType}
          onChangeBaseMap={setBaseMapType}
          municipalityThreats={municipalityThreats}
          cityForecasts={cityForecasts}
          onSelectMunicipality={openMunicipality}
          isChatOpen={isChatOpen}
        />

        {/* Bottom overlay: legend (left) + controls (right); stacks on mobile */}
        <div className={`pointer-events-none absolute inset-x-3 bottom-3 sm:inset-x-4 sm:bottom-4 z-[500] flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-end sm:justify-between transition-[right] duration-200 ${isChatOpen ? 'sm:right-[25rem]' : ''}`}>
          <div className="pointer-events-auto">
            <DbzLegend />
          </div>

          <div className="pointer-events-auto relative glass rounded-2xl p-2 flex items-center justify-between sm:justify-start gap-2 sm:gap-3">
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

            <button
              onClick={cycleSweepSpeed}
              className="btn font-mono tabular-nums"
              title="Velocidade do feixe (toque para trocar)"
              aria-label={`Velocidade do feixe ${SWEEP_SPEEDS[sweepSpeedIdx].label}`}
            >
              {SWEEP_SPEEDS[sweepSpeedIdx].label}
            </button>

            <div ref={beamPanelRef}>
              <button
                onClick={() => setIsBeamPanelOpen(!isBeamPanelOpen)}
                data-active={isBeamPanelOpen}
                className="btn btn-icon"
                aria-haspopup="dialog"
                aria-expanded={isBeamPanelOpen}
                aria-label={isBeamSoundOn ? `Som do feixe ligado, volume ${beamVolume}%` : 'Som do feixe desligado'}
                title="Som do feixe: ligar/desligar e volume"
              >
                {!isBeamSoundOn || beamVolume === 0 ? (
                  <VolumeX className="w-4 h-4 text-slate-400" />
                ) : beamVolume < 50 ? (
                  <Volume1 className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              {isBeamPanelOpen && (
                <div
                  role="dialog"
                  aria-label="Som do feixe"
                  className="absolute bottom-full right-0 mb-2 w-72 max-w-full glass bg-[#0a1324]/95 rounded-2xl p-3 flex flex-col gap-3 shadow-xl"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="leading-tight">
                      <span className="block text-[13px] font-medium text-slate-100">Som do feixe</span>
                      <span className="block text-[11px] text-slate-400">Ping quando a linha passa na nuvem</span>
                    </div>
                    <button
                      role="switch"
                      aria-checked={isBeamSoundOn}
                      onClick={toggleBeamSound}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${
                        isBeamSoundOn ? 'bg-cyan-500' : 'bg-white/15'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          isBeamSoundOn ? 'translate-x-5' : ''
                        }`}
                      />
                    </button>
                  </div>

                  <label className={`flex flex-col gap-2 ${isBeamSoundOn ? '' : 'opacity-40 pointer-events-none'}`}>
                    <span className="flex items-center justify-between">
                      <span className="eyebrow">Volume</span>
                      <span className="font-mono text-[11px] text-slate-300 tabular-nums">{beamVolume}%</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={beamVolume}
                      onChange={(e) => changeBeamVolume(Number(e.target.value))}
                      onPointerUp={testBeamSound}
                      onKeyUp={testBeamSound}
                      className="range-cyan w-full"
                      style={{ ['--fill' as string]: `${beamVolume}%` }}
                      aria-label="Volume do som do feixe"
                      disabled={!isBeamSoundOn}
                    />
                  </label>

                  <button onClick={testBeamSound} className="btn justify-center" disabled={!isBeamSoundOn || beamVolume === 0}>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Testar som</span>
                  </button>

                  <p className="text-[11px] leading-snug text-slate-500">
                    O alerta de chuva (botão de som no topo) é separado e não muda aqui.
                  </p>
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 sm:gap-2.5 pr-1 sm:pr-2" title="Opacidade dos ecos">
              <span className="eyebrow hidden sm:inline">Ecos</span>
              <input
                type="range"
                min={10}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="range-cyan w-16 min-[400px]:w-20 sm:w-28"
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

      {/* Detalhes do município: radar + previsão + alertas da Defesa Civil */}
      {selectedMunicipality && (() => {
        const city = NEARBY_CITIES.find((c) => c.name === selectedMunicipality);
        if (!city) return null;
        return (
          <MunicipalityDetailModal
            cityName={city.name}
            state={city.state}
            coords={city.coords}
            status={municipalityThreats[city.name] ?? null}
            forecast={cityForecasts[city.name] ?? null}
            ibge={city.ibge}
            alerts={dcAlerts}
            inmetAlerts={inmetAlerts}
            onRetryAlerts={() => loadDefesaCivilAlerts(true)}
            onClose={() => setSelectedMunicipality(null)}
          />
        );
      })()}

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
