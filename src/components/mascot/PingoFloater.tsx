import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Pingo, PingoAction, PingoMood } from './Pingo';
import { PreparednessHub } from './PreparednessHub';
import { QUICK_TIPS } from './mascotContent';
import { mascotSound } from './mascotSound';

const COLLAPSED_KEY = 'mascotCollapsed';
const TIPS_KEY = 'mascotTips';

const readFlag = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
};
const writeFlag = (key: string, value: boolean) => {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* ignora */
  }
};

// Ações aleatórias com pesos (a dica em balão é tratada à parte)
const IDLE: [PingoAction | 'tip', number][] = [
  ['blink', 2],
  ['tail', 2],
  ['wave', 1.5],
  ['jump', 1],
  ['twirl', 1.5],
  ['tilt', 1],
  ['rain', 1],
  ['tip', 2.5],
];

function pickIdle(tipsOn: boolean): PingoAction | 'tip' {
  const list = IDLE.filter(([a]) => tipsOn || a !== 'tip');
  let r = Math.random() * list.reduce((s, [, w]) => s + w, 0);
  for (const [a, w] of list) {
    if ((r -= w) <= 0) return a;
  }
  return 'blink';
}

const GAP = 8; // distância dos painéis do mapa
const EDGE = 12; // margem da borda inferior

/**
 * Pingo flutuando no canto inferior esquerdo do mapa.
 * Fica sempre acima dos painéis que já existem nesse canto (legenda, controles),
 * sem mexer neles, e se esconde se algum menu abrir por cima dele.
 */
export const PingoFloater: React.FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [collapsed, setCollapsed] = useState(() => readFlag(COLLAPSED_KEY, false));
  const [tipsOn, setTipsOn] = useState(() => readFlag(TIPS_KEY, true));
  const [hubOpen, setHubOpen] = useState(false);
  const [act, setAct] = useState<{ a: PingoAction | null; k: number }>({ a: null, k: 0 });
  const [mood, setMood] = useState<PingoMood>('normal');
  const [bubble, setBubble] = useState<string | null>(null);
  const [bottom, setBottom] = useState(EDGE);
  const [covered, setCovered] = useState(false);
  const bubbleTimer = useRef<number | null>(null);
  const lastTip = useRef(-1);

  const doAction = useCallback((a: PingoAction) => setAct((p) => ({ a, k: p.k + 1 })), []);

  const showBubble = useCallback((text: string, ms = 6000, m: PingoMood = 'normal') => {
    setBubble(text);
    setMood(m);
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => {
      setBubble(null);
      setMood('normal');
    }, ms);
  }, []);

  useEffect(() => () => {
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
  }, []);

  // Posição: logo acima dos painéis "glass" que ocupam o canto inferior esquerdo
  const measure = useCallback(() => {
    const el = rootRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const pr = parent.getBoundingClientRect();
    const colRight = pr.left + 130;
    let top = pr.bottom - EDGE;
    parent.querySelectorAll<HTMLElement>('.glass').forEach((g) => {
      if (el.contains(g) || g.closest('[role="dialog"]')) return;
      const r = g.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.top < pr.top + pr.height * 0.4) return; // só painéis da metade de baixo
      if (r.left > colRight || r.right < pr.left) return; // só os que tocam a coluna do Pingo
      // ignora painéis cobertos por outra camada (ex.: radar atrás do satélite)
      const hit = document.elementFromPoint(r.left + Math.min(24, r.width / 2), r.top + Math.min(12, r.height / 2));
      if (hit && parent.contains(hit) && !g.contains(hit) && !el.contains(hit)) return;
      top = Math.min(top, r.top - GAP);
    });
    const b = Math.max(EDGE, Math.round(pr.bottom - top));
    setBottom((prev) => (Math.abs(prev - b) < 2 ? prev : b));

    // Algum menu aberto (som do feixe, previsão…) sobre o Pingo? Ele sai da frente.
    const mr = el.getBoundingClientRect();
    let isCovered = false;
    parent.querySelectorAll<HTMLElement>('[role="dialog"]').forEach((d) => {
      if (el.contains(d)) return;
      const r = d.getBoundingClientRect();
      if (r.width && r.right > mr.left && r.left < mr.right && r.bottom > mr.top && r.top < mr.bottom) isCovered = true;
    });
    setCovered(isCovered);
  }, []);

  useLayoutEffect(() => {
    measure();
    const id = window.setInterval(measure, 700);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, [measure, collapsed]);

  // Saudação ao abrir o app
  useEffect(() => {
    if (collapsed) return;
    const t = window.setTimeout(() => {
      doAction('wave');
      showBubble('Oi! Eu sou o Pingo 🐱☂️ Toque em mim para aprender a se proteger de desastres.', 7000, 'joy');
    }, 2500);
    return () => window.clearTimeout(t);
    // só na primeira montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ações aleatórias a cada 5–12 s
  useEffect(() => {
    if (collapsed || hubOpen) return;
    let timer: number;
    const loop = () => {
      timer = window.setTimeout(() => {
        if (!document.hidden) {
          const a = pickIdle(tipsOn);
          if (a === 'tip') {
            let i = Math.floor(Math.random() * QUICK_TIPS.length);
            if (i === lastTip.current) i = (i + 1) % QUICK_TIPS.length;
            lastTip.current = i;
            doAction(Math.random() < 0.5 ? 'wave' : 'tilt');
            showBubble(QUICK_TIPS[i], 6000);
          } else {
            doAction(a);
          }
        }
        loop();
      }, 5000 + Math.random() * 7000);
    };
    loop();
    return () => window.clearTimeout(timer);
  }, [collapsed, hubOpen, tipsOn, doAction, showBubble]);

  const openHub = () => {
    mascotSound.meow();
    setBubble(null);
    setHubOpen(true);
  };

  const closeHub = useCallback(() => {
    setHubOpen(false);
    doAction('wave');
    showBubble('Até logo! Estou aqui se precisar. 🐾', 4000, 'joy');
    window.setTimeout(() => buttonRef.current?.focus(), 0);
  }, [doAction, showBubble]);

  const toggleTips = () => {
    const next = !tipsOn;
    writeFlag(TIPS_KEY, next);
    setTipsOn(next);
  };

  const collapse = () => {
    writeFlag(COLLAPSED_KEY, true);
    setCollapsed(true);
    setHubOpen(false);
    setBubble(null);
  };

  const expand = () => {
    writeFlag(COLLAPSED_KEY, false);
    setCollapsed(false);
    mascotSound.meow();
    doAction('jump');
    showBubble('Voltei! 😺 Toque em mim para abrir o guia.', 4500, 'joy');
  };

  return (
    <>
      <div
        ref={rootRef}
        className={`absolute left-3 sm:left-4 z-[670] flex items-end gap-1.5 pointer-events-none transition-[bottom,opacity,transform] duration-300 ${
          covered ? 'opacity-0 translate-y-2' : 'opacity-100'
        }`}
        style={{ bottom }}
      >
        {collapsed ? (
          <button
            onClick={expand}
            className="pointer-events-auto grid place-items-center w-11 h-11 rounded-full border border-amber-300/40 bg-[#0a1324]/90 shadow-lg cursor-pointer hover:border-amber-300/70"
            aria-label="Mostrar o Pingo, gatinho da prevenção"
            title="Mostrar o Pingo"
          >
            <Pingo headOnly className="w-8 h-8" />
          </button>
        ) : (
          <>
            <button
              ref={buttonRef}
              onClick={openHub}
              tabIndex={covered ? -1 : 0}
              className={`group cursor-pointer rounded-2xl ${covered ? '' : 'pointer-events-auto'}`}
              aria-label="Pingo, o gatinho da prevenção: abrir guia de emergência"
              title="Pingo: o que fazer em enchentes, temporais, deslizamentos e incêndios"
            >
              <Pingo
                action={act.a}
                actionKey={act.k}
                mood={mood}
                className="w-[72px] sm:w-[88px] drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)] transition-transform group-hover:scale-105 group-active:scale-95"
              />
            </button>

            {bubble && !covered && (
              <div
                key={bubble}
                role="status"
                aria-live="polite"
                className="pingo-bubble-in pointer-events-auto relative mb-[46px] sm:mb-[58px] max-w-[min(230px,calc(100vw-120px))] rounded-2xl rounded-bl-md bg-[#fff6e8] text-slate-800 pl-3 pr-7 py-2 text-[12px] leading-snug font-medium shadow-xl cursor-pointer"
                onClick={openHub}
              >
                <span className="absolute -left-1.5 bottom-2 w-3 h-3 rotate-45 bg-[#fff6e8]" aria-hidden="true" />
                <span className="relative">{bubble}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setBubble(null);
                  }}
                  className="absolute top-1 right-1 grid place-items-center w-5 h-5 rounded-full text-slate-500 hover:bg-slate-900/10 cursor-pointer"
                  aria-label="Fechar dica"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {hubOpen && <PreparednessHub onClose={closeHub} tipsOn={tipsOn} onToggleTips={toggleTips} onCollapse={collapse} />}
    </>
  );
};
