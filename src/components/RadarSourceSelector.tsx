import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

// Seleção de radar: Chapecó (Defesa Civil SC, já existente) ou Mosaico Simepar (Paraná).
// O Simepar não oferece API nem imagem individual do radar de Teixeira Soares: a única
// imagem pública é o mosaico estadual (Cascavel + Teixeira Soares), exibido aqui como tal.

export type RadarSourceId = 'chapeco' | 'simepar';

const STORAGE_KEY = 'radar_chapeco_selected_source';

export const RADAR_SOURCE_OPTIONS: { id: RadarSourceId; label: string; title: string; description: string }[] = [
  {
    id: 'chapeco',
    label: 'Chapecó · SC',
    title: 'Radar de Chapecó — Defesa Civil SC',
    description: 'Radar de Chapecó (Defesa Civil SC) sobre o mapa, com feixe, ecos e alertas.',
  },
  {
    id: 'simepar',
    label: 'Paraná · Simepar',
    title: 'Mosaico Simepar — radares do Paraná (Cascavel + Teixeira Soares)',
    description: 'Imagem oficial do Simepar que combina os radares de Cascavel e Teixeira Soares.',
  },
];

export function loadSavedRadarSource(): RadarSourceId | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'chapeco' || v === 'simepar' ? v : null;
  } catch {
    return null;
  }
}

export function saveRadarSource(id: RadarSourceId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

/** Controle compacto (mesmo padrão do seletor de mapa base). */
export const RadarSourceSelector: React.FC<{
  value: RadarSourceId;
  onChange: (id: RadarSourceId) => void;
}> = ({ value, onChange }) => (
  <div
    role="radiogroup"
    aria-label="Radar"
    className="absolute top-14 left-3 sm:top-16 sm:left-4 z-[700] glass rounded-xl p-1 flex items-center gap-0.5"
  >
    {RADAR_SOURCE_OPTIONS.map((opt) => (
      <button
        key={opt.id}
        role="radio"
        aria-checked={value === opt.id}
        onClick={() => onChange(opt.id)}
        title={opt.title}
        className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
          value === opt.id
            ? 'bg-cyan-400/20 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]'
            : 'text-slate-300 hover:text-white hover:bg-white/10'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

/** Escolha do radar na primeira vez que o app é aberto. */
export const RadarSourceWelcome: React.FC<{ onChoose: (id: RadarSourceId) => void }> = ({ onChoose }) => (
  <div className="absolute inset-0 z-[900] grid place-items-center bg-[#050b18]/80 backdrop-blur-sm p-4">
    <div className="glass rounded-2xl p-4 w-full max-w-sm">
      <p className="eyebrow mb-1">Bem-vindo</p>
      <h2 className="text-[15px] font-semibold text-white mb-3">Qual radar você quer ver?</h2>
      <div className="flex flex-col gap-2">
        {RADAR_SOURCE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onChoose(opt.id)}
            className="text-left rounded-xl px-3 py-2.5 border border-white/10 hover:border-cyan-400/40 hover:bg-cyan-400/10 transition-colors cursor-pointer"
          >
            <span className="block text-sm font-medium text-slate-100">{opt.label}</span>
            <span className="block text-[12px] text-slate-400">{opt.description}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Você pode trocar a qualquer momento no canto superior do mapa.</p>
    </div>
  </div>
);

// Imagem pública do mosaico na página oficial https://www.simepar.br/simepar/radar_msc
const SIMEPAR_MOSAIC_URL = 'https://lb01.simepar.br/riak/pgw-radar/product1.jpeg';
const REFRESH_MS = 2 * 60 * 1000;

/** Visualização do mosaico do Simepar. Em caso de falha, mostra aviso — nunca outra imagem. */
export const SimeparMosaicView: React.FC<{ onBackToChapeco: () => void }> = ({ onBackToChapeco }) => {
  const [src, setSrc] = useState<string>(`${SIMEPAR_MOSAIC_URL}?t=${Date.now()}`);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const reload = useCallback(() => {
    setStatus('loading');
    setSrc(`${SIMEPAR_MOSAIC_URL}?t=${Date.now()}`);
  }, []);

  useEffect(() => {
    const id = setInterval(reload, REFRESH_MS);
    return () => clearInterval(id);
  }, [reload]);

  const handleError = () => {
    // tenta uma vez sem o parâmetro anti-cache antes de declarar indisponível
    if (src !== SIMEPAR_MOSAIC_URL) {
      setSrc(SIMEPAR_MOSAIC_URL);
      return;
    }
    setStatus('error');
  };

  return (
    <div className="absolute inset-0 z-[600] bg-[#050b18] flex flex-col pt-[6.5rem] sm:pt-28 pb-3 px-3 sm:px-4">
      <div className="relative flex-1 min-h-0 grid place-items-center">
        {status !== 'error' && (
          <img
            key={src}
            src={src}
            alt="Mosaico de radar do Simepar — Paraná"
            onLoad={() => {
              setStatus('ok');
              setLoadedAt(
                new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date())
              );
            }}
            onError={handleError}
            className={`max-w-full max-h-full object-contain rounded-xl ${status === 'loading' && !loadedAt ? 'opacity-0' : ''}`}
          />
        )}

        {status === 'loading' && !loadedAt && (
          <div className="absolute inset-0 grid place-items-center text-[12px] text-slate-400 font-mono">
            Carregando imagem do Simepar…
          </div>
        )}

        {status === 'error' && (
          <div className="glass rounded-2xl p-4 max-w-sm text-center">
            <AlertTriangle className="w-5 h-5 text-amber-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-100 mb-1">Radar do Paraná indisponível</p>
            <p className="text-[12px] text-slate-400 mb-3">
              Não foi possível obter a imagem do Simepar agora. Nenhum dado de outro radar está sendo exibido no lugar.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button onClick={reload} className="btn">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tentar de novo</span>
              </button>
              <button onClick={onBackToChapeco} className="btn" data-active="true">
                <span>Voltar para Chapecó</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 mt-2 glass rounded-xl px-3 py-2 flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-400 leading-snug">
          Mosaico Simepar (Cascavel + Teixeira Soares). Se Teixeira Soares estiver fora do ar, a imagem mostra só Cascavel.
          <span className="text-slate-500"> © SIMEPAR</span>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {loadedAt && <span className="font-mono text-[11px] text-slate-500 tabular-nums">{loadedAt}</span>}
          <button onClick={reload} className="btn btn-icon" aria-label="Atualizar imagem do Simepar" title="Atualizar imagem do Simepar">
            <RefreshCw className={`w-4 h-4 ${status === 'loading' ? 'animate-spin text-cyan-300' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
};
