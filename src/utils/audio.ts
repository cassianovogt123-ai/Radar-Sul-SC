// Web Audio API Synthesizer for Radar Alert Notifications
// Generates a short, discrete, audible two-tone chime without external audio assets.

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function isAudioUnlocked(): boolean {
  return audioCtx !== null && audioCtx.state === 'running';
}

export async function unlockAudio(): Promise<boolean> {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    // Play an ultra-short inaudible buffer to unlock iOS/Chrome audio restriction
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    return ctx.state === 'running';
  } catch (err) {
    console.warn('Could not unlock audio context:', err);
    return false;
  }
}

/**
 * Plays a single, short, discrete meteorological alert chime:
 * Tone 1: 587.33 Hz (D5) - 100ms
 * Tone 2: 880.00 Hz (A5) - 180ms with gentle exponential decay
 * Total duration: ~280ms. Audible, clean, non-intrusive.
 */
export function playRadarAlertChime(volume: number = 0.7): boolean {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.max(0.05, Math.min(1, volume)), now);
    masterGain.connect(ctx.destination);

    // Osc 1 (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.6, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(now);
    osc1.stop(now + 0.13);

    // Osc 2 (A5) - higher harmonic chime
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880.0, now + 0.08);
    gain2.gain.setValueAtTime(0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.8, now + 0.10);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.33);

    return true;
  } catch (err) {
    console.warn('Failed to play radar alert chime:', err);
    return false;
  }
}

/**
 * Plays a distinct 3-tone chime for cell proximity / approach detection:
 * Ascending arpeggio: F#5 (739.99 Hz) -> A5 (880.00 Hz) -> C#6 (1108.73 Hz)
 * Duration: ~340ms. Clear, discrete, unmistakable from general echo alert.
 */
export function playApproachAlertChime(volume: number = 0.75): boolean {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.max(0.05, Math.min(1, volume)), now);
    masterGain.connect(ctx.destination);

    const tones = [
      { freq: 739.99, start: 0, dur: 0.1 },
      { freq: 880.0, start: 0.08, dur: 0.1 },
      { freq: 1108.73, start: 0.16, dur: 0.18 },
    ];

    tones.forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(t.freq, now + t.start);
      gain.gain.setValueAtTime(0, now + t.start);
      gain.gain.linearRampToValueAtTime(0.55, now + t.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now + t.start);
      osc.stop(now + t.start + t.dur + 0.02);
    });

    return true;
  } catch (err) {
    console.warn('Failed to play approach alert chime:', err);
    return false;
  }
}


/**
 * Converte um instante do relógio da tela (performance.now, em ms) para o
 * relógio do áudio, de modo que o som SAIA DO ALTO-FALANTE nesse instante.
 * Usa o carimbo de saída do próprio aparelho (getOutputTimestamp), que já inclui
 * o atraso de áudio do celular; sem ele, usa uma estimativa.
 */
export function perfToAudioTime(perfMs: number): number {
  const ctx = getAudioContext() as AudioContext & {
    getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number };
  };
  try {
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.performanceTime && ts.performanceTime > 0 && ts.contextTime && ts.contextTime > 0) {
      // contextTime = trecho de áudio que está saindo no alto-falante em performanceTime
      return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    }
  } catch {
    // segue para a estimativa
  }
  return ctx.currentTime + (perfMs - performance.now()) / 1000 - getAudioOutputLatency();
}

/**
 * "Ping" de sonar suave, tocado quando o feixe passa sobre uma nuvem.
 * Tom limpo (~950 Hz, faixa que alto-falante de celular reproduz bem) com
 * leve harmônico e decaimento de ~0,9 s, como um sonar. Volume moderado.
 * intensity (0..1) deixa o ping um pouco mais presente em ecos mais fortes.
 * atAudioTime: instante no relógio do áudio (ver perfToAudioTime); omitido = agora.
 * volume: multiplicador do volume do ping (1 = padrão).
 * Devolve uma função que cancela o ping se ele ainda não tocou (true = cancelado).
 */
export function playSonarPing(
  intensity: number = 0.5,
  atAudioTime?: number,
  volume: number = 1
): (() => boolean) | null {
  try {
    const ctx = getAudioContext(); // também retoma o áudio se o Android o suspendeu
    if (ctx.state !== 'running') return null;
    const now = Math.max(ctx.currentTime + 0.005, atAudioTime ?? 0);
    const k = Math.max(0, Math.min(1, intensity));
    // volume: 1 = nível padrão; o controle do app vai de 0 a ~1,7
    const v = Math.max(0, Math.min(1.7, volume));
    if (v <= 0.001) return null;
    const peak = Math.max(0.0005, (0.22 + 0.13 * k) * v);
    const f = 900 + 120 * k;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    master.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, now);
    osc.frequency.exponentialRampToValueAtTime(f * 0.94, now + 0.9);
    osc.connect(master);

    // harmônico baixinho dá o "brilho" de sonar e ajuda em alto-falante pequeno
    const h = ctx.createOscillator();
    const hg = ctx.createGain();
    h.type = 'sine';
    h.frequency.setValueAtTime(f * 2, now);
    hg.gain.setValueAtTime(0.25, now);
    h.connect(hg);
    hg.connect(master);

    osc.start(now);
    h.start(now);
    osc.stop(now + 0.95);
    h.stop(now + 0.95);
    // cancela só se ainda não começou a tocar; devolve true se cancelou
    return () => {
      if (ctx.currentTime >= now) return false;
      try {
        master.disconnect();
        osc.stop();
        h.stop();
      } catch {
        // já parou
      }
      return true;
    };
  } catch (err) {
    console.warn('Failed to play sonar ping:', err);
    return null;
  }
}
/**
 * Atraso entre agendar um som e ele sair no alto-falante (segundos).
 * Android/WebView costuma ter 100–250 ms; usa o valor informado pelo sistema
 * quando existe, senão uma estimativa segura.
 */
export function getAudioOutputLatency(): number {
  try {
    const ctx = getAudioContext() as AudioContext & { outputLatency?: number };
    const measured = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    if (measured > 0.005) return Math.min(measured, 0.3);
    return /Android/i.test(navigator.userAgent) ? 0.15 : 0.03;
  } catch {
    return 0.1;
  }
}
