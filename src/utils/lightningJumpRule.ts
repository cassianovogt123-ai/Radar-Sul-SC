const MIN_PIXELS = 15; // ~15 km² com raios: abaixo disso é ruído, não tempestade

/**
 * Regra do salto (adaptada do método "2σ" de Schultz et al., 2009/2011):
 * média dos 2 minutos mais recentes bem acima da média dos 10 anteriores.
 * shortcut: mede ÁREA com raios na imagem, não contagem de descargas; trocar se houver dado de contagem.
 */
export function isJump(series: number[]): { jump: boolean; before: number; now: number } {
  if (series.length < 6) return { jump: false, before: 0, now: 0 };
  const recent = series.slice(-2);
  const hist = series.slice(0, -2);
  const now = recent.reduce((a, b) => a + b, 0) / recent.length;
  const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
  const sd = Math.sqrt(hist.reduce((a, b) => a + (b - mean) ** 2, 0) / hist.length);
  const jump = now >= MIN_PIXELS && now > mean + 2 * sd && now >= 1.5 * mean;
  return { jump, before: Math.round(mean), now: Math.round(now) };
}
