import React from 'react';
import {
  Radio,
  Bell,
  Volume2,
  VolumeX,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Compass,
  Info,
  History,
  Activity,
  Sliders,
} from 'lucide-react';
import {
  RadarMetadata,
  EchoAnalysisResult,
  ConnectionStatus,
  AlertLogItem,
  RadarFrame,
} from '../types/radar';

interface SidebarInfoProps {
  radarMeta: RadarMetadata;
  currentFrame: RadarFrame | null;
  connectionStatus: ConnectionStatus;
  echoAnalysis: EchoAnalysisResult | null;
  isAudioEnabled: boolean;
  isMuted: boolean;
  muteUntil: number | null;
  lastAlertTime: string | null;
  monitoredRadiusKm: number;
  alertLog: AlertLogItem[];
  onToggleAudio: () => void;
  onTestSound: () => void;
  onMuteTemporary: (minutes: number) => void;
  onUnmute: () => void;
  onChangeMonitoredRadius: (radius: number) => void;
}

export const SidebarInfo: React.FC<SidebarInfoProps> = ({
  radarMeta,
  currentFrame,
  connectionStatus,
  echoAnalysis,
  isAudioEnabled,
  isMuted,
  muteUntil,
  lastAlertTime,
  monitoredRadiusKm,
  alertLog,
  onToggleAudio,
  onTestSound,
  onMuteTemporary,
  onUnmute,
  onChangeMonitoredRadius,
}) => {
  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'conectado':
        return 'text-emerald-400';
      case 'atualizando':
        return 'text-amber-400';
      case 'desatualizado':
        return 'text-orange-400';
      case 'indisponivel':
        return 'text-rose-400';
    }
  };

  const getEchoBadge = () => {
    if (!echoAnalysis || echoAnalysis.echoPixelCount === 0) {
      return {
        text: 'Céu Limpo de Precipitação',
        sub: 'Ausência de ecos no raio de vigilância',
        color: 'text-emerald-400 border-emerald-900/60 bg-emerald-950/30',
      };
    }
    if (echoAnalysis.maxDbzEstimate >= 50) {
      return {
        text: 'Chuva Forte / Granizo Potencial',
        sub: `Refletividade máxima de ${echoAnalysis.maxDbzEstimate} dBZ`,
        color: 'text-rose-400 border-rose-900/60 bg-rose-950/40',
      };
    }
    if (echoAnalysis.maxDbzEstimate >= 35) {
      return {
        text: 'Precipitação Moderada',
        sub: `Refletividade máxima de ${echoAnalysis.maxDbzEstimate} dBZ`,
        color: 'text-amber-400 border-amber-900/60 bg-amber-950/40',
      };
    }
    return {
      text: 'Precipitação Leve / Chuvisco',
      sub: `Refletividade estimada em ${echoAnalysis.maxDbzEstimate} dBZ`,
      color: 'text-cyan-400 border-cyan-900/60 bg-cyan-950/40',
    };
  };

  const echoBadge = getEchoBadge();

  return (
    <aside className="w-full lg:w-96 bg-slate-950/95 border-l border-slate-800/80 p-4 flex flex-col gap-5 overflow-y-auto shrink-0 text-slate-300 select-none">
      {/* 1. Radar Station Telemetry Block */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">
              Fonte Oficial Conectada
            </div>
            <h2 className="text-sm font-semibold text-slate-100">{radarMeta.name}</h2>
          </div>
          <span className={`text-xs font-mono font-medium ${getStatusColor()}`}>
            ● {connectionStatus.toUpperCase()}
          </span>
        </div>

        <div className="space-y-1.5 text-xs text-slate-400 border-t border-slate-800/80 pt-2.5">
          <div className="flex justify-between">
            <span>Operador:</span>
            <span className="text-slate-200 text-right truncate max-w-[200px]">
              {radarMeta.operator}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Localização:</span>
            <span className="text-slate-200">{radarMeta.location}</span>
          </div>
          <div className="flex justify-between font-mono tabular-nums">
            <span>Coordenadas:</span>
            <span className="text-slate-300">
              {radarMeta.coordinates.lat.toFixed(4)}°, {radarMeta.coordinates.lon.toFixed(4)}°
            </span>
          </div>
          <div className="flex justify-between">
            <span>Tecnologia:</span>
            <span className="text-cyan-300">{radarMeta.band}</span>
          </div>
          <div className="flex justify-between">
            <span>Frequência varredura:</span>
            <span className="text-slate-200">~6 minutos</span>
          </div>
        </div>

        {/* Timestamps */}
        {currentFrame && (
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 bg-slate-950/60 -mx-4 -mb-4 p-3 rounded-b-xl space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-cyan-400" />
                <span>Horário Brasília (BRT):</span>
              </span>
              <span className="text-slate-100 font-mono font-semibold tabular-nums">
                {currentFrame.brtDisplay}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Horário Universal (UTC):</span>
              <span className="font-mono tabular-nums">{currentFrame.utcDisplay}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
              <span>Idade da observação:</span>
              <span className="font-mono text-slate-300 tabular-nums">
                {currentFrame.ageMinutes === 0 ? 'Agora (recente)' : `Há ${currentFrame.ageMinutes} min`}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* 2. Echo Detection & Real-time Area Monitoring */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>Detecção em Chapecó</span>
          </div>

          {/* Monitored radius selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px] font-mono">
            {[50, 100, 150, 200].map((r) => (
              <button
                key={r}
                onClick={() => onChangeMonitoredRadius(r)}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  monitoredRadiusKm === r
                    ? 'bg-cyan-600 text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={`Raio de vigilância de ${r} km ao redor de Chapecó`}
              >
                {r}k
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic status badge */}
        <div className={`p-3 rounded-lg border mb-3 ${echoBadge.color}`}>
          <div className="text-xs font-semibold">{echoBadge.text}</div>
          <div className="text-[11px] opacity-80 mt-0.5">{echoBadge.sub}</div>
        </div>

        {/* Quantified Metrics */}
        {echoAnalysis && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Área de Ecos</div>
              <div className="text-lg font-bold font-mono text-slate-100 tabular-nums">
                {echoAnalysis.coverageAreaKm2}{' '}
                <span className="text-xs text-slate-400 font-normal">km²</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {echoAnalysis.coveragePercent}% do raio
              </div>
            </div>

            <div className="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800/80">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Refletividade</div>
              <div className="text-lg font-bold font-mono text-cyan-300 tabular-nums">
                {echoAnalysis.maxDbzEstimate}{' '}
                <span className="text-xs text-slate-400 font-normal">dBZ</span>
              </div>
              <div className="text-[10px] text-slate-500">
                {echoAnalysis.echoPixelCount} pixels analisados
              </div>
            </div>
          </div>
        )}

        <div className="mt-2 text-[11px] text-slate-400 leading-relaxed italic">
          * Varredura restrita ao raio de {monitoredRadiusKm} km centrado nas coordenadas de Chapecó.
        </div>
      </section>

      {/* 3. Single Audible Alert System */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <Bell className="w-4 h-4 text-cyan-400" />
            <span>Alerta Sonoro Único</span>
          </div>

          <button
            onClick={onToggleAudio}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors border ${
              isAudioEnabled
                ? 'bg-cyan-600 border-cyan-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {isAudioEnabled ? 'Ativado' : 'Desativado'}
          </button>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span>Status do Áudio:</span>
            <span className="font-medium text-slate-200">
              {isAudioEnabled
                ? isMuted
                  ? 'Silenciado temporariamente'
                  : 'Pronto para novas detecções'
                : 'Alertas desligados'}
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-400">
            <span>Última emissão de som:</span>
            <span className="font-mono text-slate-200 tabular-nums">
              {lastAlertTime || 'Nenhum alerta recente'}
            </span>
          </div>

          {/* Audio Action Buttons */}
          <div className="pt-2 flex items-center gap-2">
            <button
              onClick={onTestSound}
              className="flex-1 py-1.5 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-lg border border-slate-700 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
              title="Testar sinal sonoro de dois tons via Web Audio API"
            >
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Testar Som</span>
            </button>

            {isMuted ? (
              <button
                onClick={onUnmute}
                className="py-1.5 px-3 bg-amber-950/60 border border-amber-800 text-amber-300 rounded-lg text-xs font-medium hover:bg-amber-900/60 transition-colors"
              >
                Reativar
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onMuteTemporary(15)}
                  className="py-1.5 px-2 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 rounded-lg border border-slate-700 text-[11px] transition-colors"
                  title="Silenciar alertas sonoros pelos próximos 15 minutos"
                >
                  Mudo 15m
                </button>
                <button
                  onClick={() => onMuteTemporary(60)}
                  className="py-1.5 px-2 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 rounded-lg border border-slate-700 text-[11px] transition-colors"
                  title="Silenciar alertas sonoros pelos próximos 60 minutos"
                >
                  Mudo 1h
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Protection against duplicate alerts */}
        <div className="mt-3 pt-2.5 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center gap-1 text-slate-300 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Filtro Anti-Duplicação Ativo</span>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Emite apenas um bip no surgimento de nova precipitação confirmada. Bloqueia repetições
            na mesma imagem e impõe intervalo de segurança de 10 min entre toques.
          </p>
        </div>
      </section>

      {/* 4. Event History Log */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
          <div className="flex items-center gap-1.5">
            <History className="w-4 h-4 text-cyan-400" />
            <span>Histórico de Detecções</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 tabular-nums">
            {alertLog.length} eventos
          </span>
        </div>

        <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs pr-1">
          {alertLog.length === 0 ? (
            <div className="p-3 text-center text-slate-500 text-[11px] italic bg-slate-950/40 rounded-lg">
              Aguardando varreduras. Nenhum evento de formação de precipitação registrado nesta sessão.
            </div>
          ) : (
            alertLog.map((item) => (
              <div
                key={item.id}
                className="p-2 bg-slate-950/60 rounded-lg border border-slate-800/80 flex flex-col gap-0.5"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-200">{item.title}</span>
                  <span className="font-mono text-slate-400 tabular-nums">{item.brtTime}</span>
                </div>
                <div className="text-[10px] text-slate-400">{item.details}</div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Notice on Complementary Tool */}
      <footer className="text-[10px] text-slate-500 leading-relaxed px-1">
        Aviso meteorológico: Este monitor é uma ferramenta complementar de visualização e alerta. Para decisões de emergência e ordens de evacuação, siga sempre as diretrizes emitidas pela Defesa Civil de Santa Catarina.
      </footer>
    </aside>
  );
};
