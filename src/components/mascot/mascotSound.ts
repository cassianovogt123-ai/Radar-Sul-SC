// Efeitos sonoros suaves do Pingo, gerados na hora (sem arquivos de áudio).
// Usa o mesmo AudioContext do app; o mudo do Pingo é independente dos outros sons.
import { getAudioContext } from '../../utils/audio';

const MUTE_KEY = 'mascotMuted';

export function isMascotMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMascotMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

type Note = { f0: number; f1?: number; at: number; dur: number; type?: OscillatorType; gain?: number };

function play(notes: Note[], master = 0.07) {
  if (isMascotMuted()) return;
  try {
    const ctx = getAudioContext();
    const t0 = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    out.gain.value = master;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    out.connect(lp).connect(ctx.destination);
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = n.type ?? 'sine';
      const s = t0 + n.at;
      osc.frequency.setValueAtTime(n.f0, s);
      if (n.f1) osc.frequency.exponentialRampToValueAtTime(n.f1, s + n.dur);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(n.gain ?? 1, s + Math.min(0.03, n.dur / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, s + n.dur);
      osc.connect(g).connect(out);
      osc.start(s);
      osc.stop(s + n.dur + 0.05);
    }
  } catch {
    /* áudio indisponível: segue em silêncio */
  }
}

export const mascotSound = {
  /** "Miau" curtinho ao tocar no Pingo */
  meow: () =>
    play(
      [
        { f0: 620, f1: 900, at: 0, dur: 0.12, type: 'triangle' },
        { f0: 900, f1: 560, at: 0.12, dur: 0.22, type: 'triangle' },
      ],
      0.06,
    ),
  /** Bolha de fala / toque leve */
  pop: () => play([{ f0: 520, f1: 980, at: 0, dur: 0.09 }], 0.05),
  /** Acerto */
  success: () =>
    play(
      [
        { f0: 660, at: 0, dur: 0.14 },
        { f0: 880, at: 0.1, dur: 0.16 },
        { f0: 1320, at: 0.2, dur: 0.22, gain: 0.6 },
      ],
      0.06,
    ),
  /** Erro gentil */
  oops: () => play([{ f0: 420, f1: 300, at: 0, dur: 0.24, type: 'triangle' }], 0.05),
  /** Comemoração ao concluir */
  celebrate: () =>
    play(
      [523, 659, 784, 1047].map((f, i) => ({ f0: f, at: i * 0.09, dur: 0.2, gain: 0.8 })),
      0.06,
    ),
};
