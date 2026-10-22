import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Phone, RotateCcw, Volume2, VolumeX, X, MessageSquareText } from 'lucide-react';
import { Pingo, PingoAction, PingoMood } from './Pingo';
import { mascotSound, isMascotMuted, setMascotMuted } from './mascotSound';
import {
  CHEERS,
  EMERGENCY_NUMBERS,
  KIT_ITEMS,
  OOPS,
  PHASES,
  PhaseId,
  SCENARIOS,
  Scenario,
  ScenarioId,
} from './mascotContent';

type View = { kind: 'menu' } | { kind: 'scenario'; id: ScenarioId; tab: PhaseId | 'quiz' } | { kind: 'kit' };

const PROGRESS_KEY = 'mascotProgress';
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

function loadProgress(): ScenarioId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

interface PreparednessHubProps {
  onClose: () => void;
  tipsOn: boolean;
  onToggleTips: () => void;
  onCollapse: () => void;
}

/** Hub educativo: o Pingo ensina o que fazer antes, durante e depois de cada desastre. */
export const PreparednessHub: React.FC<PreparednessHubProps> = ({ onClose, tipsOn, onToggleTips, onCollapse }) => {
  const [view, setView] = useState<View>({ kind: 'menu' });
  const [speech, setSpeech] = useState('Oi! Eu sou o Pingo 🐱☂️ Escolha um tema e eu te ensino a se proteger.');
  const [mood, setMood] = useState<PingoMood>('joy');
  const [act, setAct] = useState<{ a: PingoAction | null; k: number }>({ a: 'wave', k: 1 });
  const [muted, setMuted] = useState(isMascotMuted);
  const [done, setDone] = useState<ScenarioId[]>(loadProgress);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const say = useCallback((text: string, m: PingoMood = 'normal', a: PingoAction | null = null) => {
    setSpeech(text);
    setMood(m);
    if (a) setAct((p) => ({ a, k: p.k + 1 }));
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [view]);

  const markDone = (id: ScenarioId) => {
    setDone((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
      } catch {
        /* ignora */
      }
      return next;
    });
  };

  const openScenario = (s: Scenario) => {
    mascotSound.pop();
    setView({ kind: 'scenario', id: s.id, tab: 'antes' });
    say(`${s.emoji} ${s.intro}`, 'normal', 'wave');
  };

  const toggleMute = () => {
    const next = !muted;
    setMascotMuted(next);
    setMuted(next);
    if (!next) mascotSound.meow();
  };

  const scenario = view.kind === 'scenario' ? SCENARIOS.find((s) => s.id === view.id)! : null;

  return (
    <div
      className="fixed inset-0 z-[960] flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Guia de prevenção de desastres com o Pingo"
        className="bg-[#0a1324] border border-white/10 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[92dvh] sm:h-[min(760px,92dvh)] flex flex-col shadow-2xl text-slate-200 pb-[env(safe-area-inset-bottom)]"
      >
        {/* Topo */}
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
          {view.kind !== 'menu' && (
            <button
              className="btn btn-icon shrink-0"
              aria-label="Voltar aos temas"
              onClick={() => {
                setView({ kind: 'menu' });
                say('Qual tema vamos ver agora?', 'normal', 'tilt');
              }}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0 flex-1 leading-tight">
            <span className="eyebrow block">Pingo ensina</span>
            <h2 className="text-[15px] font-semibold text-white truncate">
              {view.kind === 'menu' ? 'Guia de prevenção' : view.kind === 'kit' ? 'Mochila de emergência' : `${scenario!.emoji} ${scenario!.title}`}
            </h2>
          </div>
          <button
            className="btn btn-icon shrink-0"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? 'Ligar sons do Pingo' : 'Silenciar sons do Pingo'}
            title={muted ? 'Sons do Pingo desligados' : 'Sons do Pingo ligados'}
          >
            {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button ref={closeRef} className="btn btn-icon shrink-0" onClick={onClose} aria-label="Fechar guia">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pingo falando */}
        <div className="flex items-end gap-2 px-4 pb-3">
          <Pingo action={act.a} actionKey={act.k} mood={mood} className="w-[76px] sm:w-[92px] shrink-0 -mb-1" />
          <div
            key={speech}
            role="status"
            aria-live="polite"
            className="pingo-bubble-in relative flex-1 mb-3 rounded-2xl rounded-bl-md bg-[#fff6e8] text-slate-800 px-3.5 py-2.5 text-[13px] leading-snug font-medium shadow-lg"
          >
            <span className="absolute -left-1.5 bottom-2 w-3 h-3 rotate-45 bg-[#fff6e8]" aria-hidden="true" />
            <span className="relative">{speech}</span>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 border-t border-white/[0.07] pt-4">
          {view.kind === 'menu' && (
            <MenuView
              done={done}
              onOpen={openScenario}
              onKit={() => {
                mascotSound.pop();
                setView({ kind: 'kit' });
                say('Toque nos itens que vão na mochila de emergência. Cuidado com as pegadinhas! 🎒', 'normal', 'wave');
              }}
              tipsOn={tipsOn}
              onToggleTips={onToggleTips}
              onCollapse={onCollapse}
            />
          )}
          {view.kind === 'scenario' && scenario && (
            <ScenarioView
              key={scenario.id}
              scenario={scenario}
              tab={view.tab}
              onTab={(tab) => {
                setView({ kind: 'scenario', id: scenario.id, tab });
                if (tab === 'quiz') say('Hora do teste! Vamos ver o que você aprendeu. 🧠', 'wow', 'tilt');
                else say(PHASES.find((p) => p.id === tab)!.pingo, 'normal', 'twirl');
              }}
              say={say}
              onFinished={(score, total) => {
                if (score >= total - 1) markDone(scenario.id);
              }}
              onMenu={() => {
                setView({ kind: 'menu' });
                say('Qual tema vamos ver agora?', 'normal', 'tilt');
              }}
            />
          )}
          {view.kind === 'kit' && <KitView say={say} />}
        </div>

        {/* Telefones de emergência */}
        <div className="border-t border-white/[0.07] px-4 py-2.5 flex items-center gap-1.5 overflow-x-auto">
          <Phone className="w-3.5 h-3.5 text-rose-300 shrink-0" />
          {EMERGENCY_NUMBERS.map((n) => (
            <a
              key={n.number}
              href={`tel:${n.number}`}
              className="shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-white/10 bg-white/5 text-[11px] text-slate-300 hover:bg-white/10"
            >
              <b className="font-mono text-white">{n.number}</b> {n.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ---------- Menu de cenários ---------- */

const MenuView: React.FC<{
  done: ScenarioId[];
  onOpen: (s: Scenario) => void;
  onKit: () => void;
  tipsOn: boolean;
  onToggleTips: () => void;
  onCollapse: () => void;
}> = ({ done, onOpen, onKit, tipsOn, onToggleTips, onCollapse }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2.5">
      {SCENARIOS.map((s) => {
        const ok = done.includes(s.id);
        return (
          <button
            key={s.id}
            onClick={() => onOpen(s)}
            className={`relative text-left rounded-2xl border bg-gradient-to-br ${s.tone} p-3 sm:p-3.5 cursor-pointer transition-transform hover:-translate-y-0.5 active:scale-[0.98]`}
          >
            <span className="text-[28px] leading-none" aria-hidden="true">
              {s.emoji}
            </span>
            <span className="mt-2 block text-[13px] font-semibold text-white leading-tight">{s.title}</span>
            <span className="mt-0.5 block text-[11px] text-slate-300">{s.short}</span>
            {ok && (
              <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 h-5 px-1.5 rounded-full bg-emerald-400/20 border border-emerald-400/40 text-[10px] font-semibold text-emerald-200">
                <Check className="w-3 h-3" /> feito
              </span>
            )}
          </button>
        );
      })}
    </div>

    <button
      onClick={onKit}
      className="w-full flex items-center gap-3 text-left rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-400/20 to-amber-400/0 p-3 sm:p-3.5 cursor-pointer transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
    >
      <span className="text-[30px] leading-none" aria-hidden="true">
        🎒
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-white">Monte sua mochila de emergência</span>
        <span className="block text-[11px] text-slate-300">Mini jogo: escolha o que levar e o que deixar</span>
      </span>
      <ArrowRight className="w-4 h-4 text-amber-200 ml-auto shrink-0" />
    </button>

    <a
      href="sms:40199"
      className="flex items-start gap-2.5 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 p-3 text-[12px] text-cyan-100 leading-snug"
    >
      <MessageSquareText className="w-4 h-4 mt-0.5 shrink-0 text-cyan-300" />
      <span>
        <b>Receba alertas da Defesa Civil no celular:</b> envie o seu CEP por SMS para <b className="font-mono">40199</b>. É gratuito.
      </span>
    </a>

    <div className="flex flex-wrap items-center gap-2 pt-1">
      <button className="btn" data-active={tipsOn} aria-pressed={tipsOn} onClick={onToggleTips}>
        {tipsOn ? 'Dicas automáticas: ligadas' : 'Dicas automáticas: desligadas'}
      </button>
      <button className="btn" onClick={onCollapse} title="O Pingo vira um botãozinho no canto">
        Recolher o Pingo
      </button>
    </div>
  </div>
);

/* ---------- Cenário: Antes / Durante / Depois / Teste ---------- */

const TABS: { id: PhaseId | 'quiz'; label: string }[] = [...PHASES.map((p) => ({ id: p.id, label: p.label })), { id: 'quiz', label: 'Teste' }];

const ScenarioView: React.FC<{
  scenario: Scenario;
  tab: PhaseId | 'quiz';
  onTab: (t: PhaseId | 'quiz') => void;
  say: (t: string, m?: PingoMood, a?: PingoAction | null) => void;
  onFinished: (score: number, total: number) => void;
  onMenu: () => void;
}> = ({ scenario, tab, onTab, say, onFinished, onMenu }) => {
  const [learned, setLearned] = useState<Set<string>>(new Set());
  const tabIdx = TABS.findIndex((t) => t.id === tab);
  const phase = tab === 'quiz' ? null : PHASES.find((p) => p.id === tab)!;
  const cards = phase ? scenario.phases[phase.id] : [];
  const phaseDone = (id: PhaseId) => scenario.phases[id].every((_, i) => learned.has(`${id}-${i}`));

  const toggle = (i: number) => {
    if (!phase) return;
    const key = `${phase.id}-${i}`;
    const next = new Set(learned);
    if (next.has(key)) {
      next.delete(key);
      setLearned(next);
      return;
    }
    next.add(key);
    setLearned(next);
    const all = cards.every((_, j) => next.has(`${phase.id}-${j}`));
    if (all) {
      mascotSound.success();
      const nextTab = TABS[tabIdx + 1];
      say(`Fase "${phase.label}" concluída! 🎉 Vamos para "${nextTab.label}"?`, 'joy', 'jump');
    } else {
      mascotSound.pop();
      say(`${pick(CHEERS)} ${cards[i].title}: anotado!`, 'joy', pick<PingoAction>(['blink', 'tail', 'twirl']));
    }
  };

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Fases" className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
        {TABS.map((t, i) => {
          const active = t.id === tab;
          const ok = t.id !== 'quiz' && phaseDone(t.id);
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => onTab(t.id)}
              className={`h-9 rounded-lg text-[12px] font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                active ? (t.id === 'quiz' ? 'bg-fuchsia-400/20 text-fuchsia-100' : `${PHASES[i].tone} border`) : 'text-slate-400 hover:text-white'
              }`}
            >
              {ok && <Check className="w-3 h-3 text-emerald-300" />}
              {t.label}
            </button>
          );
        })}
      </div>

      {phase && (
        <>
          <p className="text-[11px] text-slate-400">Toque em cada cartão quando entender a dica.</p>
          <ul className="grid sm:grid-cols-2 gap-2">
            {cards.map((c, i) => {
              const ok = learned.has(`${phase.id}-${i}`);
              return (
                <li key={c.title}>
                  <button
                    onClick={() => toggle(i)}
                    aria-pressed={ok}
                    className={`w-full h-full text-left flex gap-3 rounded-2xl border p-3 cursor-pointer transition-colors ${
                      ok ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'
                    }`}
                  >
                    <span className="text-[22px] leading-none mt-0.5" aria-hidden="true">
                      {c.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-white">{c.title}</span>
                        <span
                          className={`grid place-items-center w-5 h-5 rounded-full border shrink-0 ${
                            ok ? 'bg-emerald-400 border-emerald-300 text-slate-900' : 'border-white/25'
                          }`}
                        >
                          {ok && <Check className="w-3 h-3" strokeWidth={3} />}
                        </span>
                      </span>
                      <span className="block mt-0.5 text-[12px] leading-snug text-slate-300">{c.text}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {tab === 'quiz' && <QuizView key={scenario.id} scenario={scenario} say={say} onFinished={onFinished} onMenu={onMenu} />}

      {tab !== 'quiz' && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <button className="btn" disabled={tabIdx === 0} onClick={() => onTab(TABS[tabIdx - 1].id)} style={tabIdx === 0 ? { visibility: 'hidden' } : undefined}>
            <ArrowLeft className="w-3.5 h-3.5" /> {tabIdx > 0 ? TABS[tabIdx - 1].label : ''}
          </button>
          <button className="btn" data-active={phase ? phaseDone(phase.id) : false} onClick={() => onTab(TABS[tabIdx + 1].id)}>
            {TABS[tabIdx + 1].label} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

/* ---------- Teste rápido ---------- */

const QuizView: React.FC<{
  scenario: Scenario;
  say: (t: string, m?: PingoMood, a?: PingoAction | null) => void;
  onFinished: (score: number, total: number) => void;
  onMenu: () => void;
}> = ({ scenario, say, onFinished, onMenu }) => {
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const total = scenario.quiz.length;
  const q = scenario.quiz[i];

  const choose = (opt: number) => {
    if (chosen !== null) return;
    setChosen(opt);
    if (opt === q.answer) {
      setScore((s) => s + 1);
      mascotSound.success();
      say(`${pick(CHEERS)} ${q.why}`, 'joy', 'jump');
    } else {
      mascotSound.oops();
      say(`${pick(OOPS)} ${q.why}`, 'worried', 'shake');
    }
  };

  const next = () => {
    if (i + 1 < total) {
      setI(i + 1);
      setChosen(null);
      say('Próxima pergunta! Pense com calma. 🤔', 'normal', 'blink');
      return;
    }
    setFinished(true);
    onFinished(score, total);
    if (score === total) {
      mascotSound.celebrate();
      say('Acertou tudo! Você é um(a) guardião(ã) da prevenção! 🏅', 'joy', 'celebrate');
    } else if (score >= total - 1) {
      mascotSound.success();
      say('Muito bem! Quase perfeito. Compartilhe essas dicas com a família! 🐾', 'joy', 'jump');
    } else {
      say('Tudo bem, errar faz parte de aprender. Que tal revisar as fases e tentar de novo?', 'worried', 'tilt');
    }
  };

  const restart = () => {
    setI(0);
    setChosen(null);
    setScore(0);
    setFinished(false);
    say('Vamos de novo! Eu acredito em você. 💪', 'normal', 'wave');
  };

  if (finished) {
    return (
      <div className="text-center rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
        <div className="text-[34px] tracking-widest" aria-label={`${score} de ${total} acertos`}>
          {Array.from({ length: total }, (_, k) => (k < score ? '⭐' : '☆')).join('')}
        </div>
        <p className="text-[15px] font-semibold text-white">
          {score} de {total} acertos
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn" onClick={restart}>
            <RotateCcw className="w-3.5 h-3.5" /> Refazer teste
          </button>
          <button className="btn" data-active="true" onClick={onMenu}>
            Escolher outro tema
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">
          Pergunta {i + 1} de {total}
        </span>
        <span className="flex gap-1" aria-hidden="true">
          {scenario.quiz.map((_, k) => (
            <span key={k} className={`h-1.5 w-6 rounded-full ${k < i || (k === i && chosen !== null) ? 'bg-fuchsia-300' : 'bg-white/15'}`} />
          ))}
        </span>
      </div>
      <p className="text-[15px] font-semibold text-white leading-snug">{q.q}</p>
      <div className="space-y-2">
        {q.options.map((o, k) => {
          const isRight = chosen !== null && k === q.answer;
          const isWrong = chosen === k && k !== q.answer;
          return (
            <button
              key={o}
              onClick={() => choose(k)}
              disabled={chosen !== null}
              className={`w-full text-left rounded-xl border px-3.5 py-3 text-[13px] transition-colors flex items-center gap-2.5 ${
                isRight
                  ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-100'
                  : isWrong
                    ? 'border-rose-400/60 bg-rose-500/15 text-rose-100 pingo-nope'
                    : chosen !== null
                      ? 'border-white/10 bg-white/[0.03] text-slate-400'
                      : 'border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/10 cursor-pointer'
              }`}
            >
              <span className="grid place-items-center w-6 h-6 rounded-full border border-current/30 text-[11px] font-mono shrink-0">
                {isRight ? '✓' : isWrong ? '✕' : String.fromCharCode(65 + k)}
              </span>
              {o}
            </button>
          );
        })}
      </div>
      {chosen !== null && (
        <div className="flex justify-end">
          <button className="btn" data-active="true" onClick={next}>
            {i + 1 < total ? 'Próxima pergunta' : 'Ver resultado'} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

/* ---------- Mini jogo: mochila de emergência ---------- */

const KitView: React.FC<{ say: (t: string, m?: PingoMood, a?: PingoAction | null) => void }> = ({ say }) => {
  const [round, setRound] = useState(0);
  const items = useMemo(() => [...KIT_ITEMS].sort(() => Math.random() - 0.5), [round]);
  const [packed, setPacked] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [shake, setShake] = useState<string | null>(null);
  const goodTotal = KIT_ITEMS.filter((it) => it.good).length;
  const complete = packed.size === goodTotal;

  const tap = (id: string) => {
    const it = KIT_ITEMS.find((x) => x.id === id)!;
    if (packed.has(id) || rejected.has(id) || complete) return;
    if (it.good) {
      const next = new Set(packed).add(id);
      setPacked(next);
      if (next.size === goodTotal) {
        mascotSound.celebrate();
        say('Mochila pronta! 🎒✨ Guarde a sua perto da porta e revise a cada 6 meses.', 'joy', 'celebrate');
      } else {
        mascotSound.pop();
        say(`${it.icon} ${it.tip}`, 'joy', pick<PingoAction>(['blink', 'tail', 'twirl']));
      }
    } else {
      setRejected(new Set(rejected).add(id));
      setShake(id);
      setTimeout(() => setShake(null), 450);
      mascotSound.oops();
      say(`${it.icon} ${it.tip}`, 'worried', 'shake');
    }
  };

  const restart = () => {
    setPacked(new Set());
    setRejected(new Set());
    setRound((r) => r + 1);
    say('Vamos montar de novo! 🎒', 'normal', 'wave');
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-slate-300">
            Na mochila: <b className="text-white">{packed.size}</b> de {goodTotal} itens essenciais
          </span>
          {(packed.size > 0 || rejected.size > 0) && (
            <button className="text-[11px] text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer" onClick={restart}>
              <RotateCcw className="w-3 h-3" /> Recomeçar
            </button>
          )}
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-400 transition-[width] duration-300" style={{ width: `${(packed.size / goodTotal) * 100}%` }} />
        </div>
      </div>

      {complete && (
        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-3 text-[12px] text-emerald-100">
          <b>Mochila completa!</b> Você separou todos os itens essenciais. Confira a validade da água, comida e remédios de tempos em tempos.
        </div>
      )}

      <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {items.map((it) => {
          const isPacked = packed.has(it.id);
          const isOut = rejected.has(it.id);
          return (
            <li key={it.id}>
              <button
                onClick={() => tap(it.id)}
                disabled={isPacked || isOut}
                aria-label={`${it.label}${isPacked ? ', na mochila' : isOut ? ', não vai na mochila' : ''}`}
                className={`relative w-full aspect-square sm:aspect-[5/4] rounded-2xl border flex flex-col items-center justify-center gap-1 p-1.5 text-center transition-colors ${
                  isPacked
                    ? 'border-emerald-400/50 bg-emerald-400/15'
                    : isOut
                      ? 'border-rose-400/40 bg-rose-500/10 opacity-60'
                      : 'border-white/10 bg-white/[0.05] hover:bg-white/10 cursor-pointer'
                } ${shake === it.id ? 'pingo-nope' : ''}`}
              >
                <span className="text-[26px] leading-none" aria-hidden="true">
                  {it.icon}
                </span>
                <span className="text-[10.5px] leading-tight text-slate-200">{it.label}</span>
                {(isPacked || isOut) && (
                  <span
                    className={`absolute top-1 right-1 grid place-items-center w-4 h-4 rounded-full text-[9px] font-bold ${
                      isPacked ? 'bg-emerald-400 text-slate-900' : 'bg-rose-400 text-slate-900'
                    }`}
                    aria-hidden="true"
                  >
                    {isPacked ? '✓' : '✕'}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
