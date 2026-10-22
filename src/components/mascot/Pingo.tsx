import React from 'react';
import './pingo.css';

/** Ações animadas do Pingo (cada uma roda uma vez quando aplicada). */
export type PingoAction =
  | 'blink'
  | 'tail'
  | 'wave'
  | 'jump'
  | 'twirl'
  | 'tilt'
  | 'rain'
  | 'shake'
  | 'celebrate';

export type PingoMood = 'normal' | 'joy' | 'wow' | 'worried';

interface PingoProps {
  action?: PingoAction | null;
  /** Muda a cada nova ação para reiniciar a animação, mesmo repetida */
  actionKey?: number;
  mood?: PingoMood;
  /** Mostra só o rostinho (versão recolhida) */
  headOnly?: boolean;
  className?: string;
}

const FUR = '#f59e4b';
const FUR_DARK = '#e0832f';
const CREAM = '#fde7c8';
const INK = '#1e293b';

const Eyes: React.FC<{ mood: PingoMood }> = ({ mood }) => {
  if (mood === 'joy') {
    return (
      <g fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round">
        <path d="M45 73 q4 -5.5 8 0" />
        <path d="M67 73 q4 -5.5 8 0" />
      </g>
    );
  }
  const r = mood === 'wow' ? 5 : 3.7;
  const ry = mood === 'wow' ? 5.4 : 4.7;
  return (
    <g>
      <ellipse cx={49} cy={71} rx={r} ry={ry} fill={INK} />
      <ellipse cx={71} cy={71} rx={r} ry={ry} fill={INK} />
      <circle cx={50.4} cy={69.2} r={1.4} fill="#fff" />
      <circle cx={72.4} cy={69.2} r={1.4} fill="#fff" />
      {mood === 'worried' && (
        <g stroke={INK} strokeWidth={2} strokeLinecap="round">
          <path d="M44 63.5 L52.5 60.5" />
          <path d="M67.5 60.5 L76 63.5" />
        </g>
      )}
    </g>
  );
};

const Mouth: React.FC<{ mood: PingoMood }> = ({ mood }) => {
  if (mood === 'wow') return <ellipse cx={60} cy={86.5} rx={2.6} ry={3.2} fill="#7f1d1d" />;
  if (mood === 'joy') return <path d="M54.5 83 q5.5 6.5 11 0 z" fill="#7f1d1d" />;
  if (mood === 'worried') return <path d="M56 86 q4 -3 8 0" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />;
  return (
    <path
      d="M60 81.6 q-2.5 3.6 -5.5 1.6 M60 81.6 q2.5 3.6 5.5 1.6"
      fill="none"
      stroke={INK}
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  );
};

/** Gatinho com guarda-chuva, desenhado em SVG e animado por CSS. */
export const Pingo: React.FC<PingoProps> = ({ action = null, actionKey = 0, mood = 'normal', headOnly = false, className = '' }) => (
  <svg
    key={actionKey}
    viewBox={headOnly ? '26 33 68 64' : '0 -16 140 166'}
    className={`pingo ${action ? `is-${action}` : ''} ${className}`}
    style={headOnly ? { overflow: 'hidden' } : undefined}
    aria-hidden="true"
    focusable="false"
  >
    {!headOnly && <ellipse cx={62} cy={146} rx={32} ry={4.5} fill="#000" opacity={0.28} className="pingo-shadow" />}

    <g className="pingo-bob">
      <g className="pingo-jump">
        {/* Rabo */}
        <g className="pingo-tail">
          <path
            d="M78 128 C 104 131, 114 114, 106 99 C 102 91, 109 85, 114 91"
            fill="none"
            stroke={FUR}
            strokeWidth={9}
            strokeLinecap="round"
          />
          <path d="M106 99 C 102 91, 109 85, 114 91" fill="none" stroke={FUR_DARK} strokeWidth={9} strokeLinecap="round" />
        </g>

        {/* Corpo */}
        <ellipse cx={60} cy={114} rx={29} ry={26} fill={FUR} />
        <path d="M33 108 q6 2 9 -2 M32 117 q6 2 9 -2 M87 108 q-6 2 -9 -2" fill="none" stroke={FUR_DARK} strokeWidth={2.4} strokeLinecap="round" />
        <ellipse cx={60} cy={121} rx={17} ry={17} fill={CREAM} />
        <ellipse cx={47} cy={139} rx={9.5} ry={5.5} fill={CREAM} />
        <ellipse cx={73} cy={139} rx={9.5} ry={5.5} fill={CREAM} />

        {/* Braço esquerdo (acena) */}
        <g className="pingo-arm-l">
          <path d="M40 101 Q 37 112 40 121" fill="none" stroke={FUR_DARK} strokeWidth={10} strokeLinecap="round" />
          <circle cx={40} cy={123} r={6} fill={CREAM} />
        </g>

        {/* Guarda-chuva (base inclinada; a animação roda por dentro) */}
        <g transform="rotate(-15 88 96)">
          <g className="pingo-umbrella">
            <line x1={88} y1={-6} x2={88} y2={100} stroke="#334155" strokeWidth={2.8} strokeLinecap="round" />
            <path d="M88 100 q0 9 -7 9 q-6 0 -6 -6" fill="none" stroke="#334155" strokeWidth={2.8} strokeLinecap="round" />
            <g className="pingo-canopy">
              <path
                d="M40 20 C 42 -4, 134 -4, 136 20 Q128 14 120 20 Q112 14 104 20 Q96 14 88 20 Q80 14 72 20 Q64 14 56 20 Q48 14 40 20 Z"
                fill="#22d3ee"
              />
              <path d="M88 -1.5 Q 66 2 56 20 Q 64 14 72 20 Q 77 6 88 -1.5 Z" fill="#fbbf24" />
              <path d="M88 -1.5 Q 91 8 88 20 Q 96 14 104 20 Q 99 5 88 -1.5 Z" fill="#fbbf24" />
              <path d="M88 -1.5 Q 124 1 136 20 Q 128 14 120 20 Q 111 4 88 -1.5 Z" fill="#fbbf24" />
              <path d="M50 12 C 60 3, 74 -0.5, 86 -1" fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth={2} strokeLinecap="round" />
              <circle cx={88} cy={-7.5} r={2.8} fill="#334155" />
            </g>
          </g>
        </g>

        {/* Cabeça */}
        <g className="pingo-head">
          <polygon points="33,62 37,35 54,51" fill={FUR} />
          <polygon points="38,57 40,43 49,52" fill="#f9a8b8" />
          <polygon points="87,62 83,35 66,51" fill={FUR} />
          <polygon points="82,57 80,43 71,52" fill="#f9a8b8" />
          <ellipse cx={60} cy={72} rx={28} ry={24} fill={FUR} />
          <g fill="none" stroke={FUR_DARK} strokeWidth={2.6} strokeLinecap="round">
            <path d="M53.5 50 q2 6 0 10" />
            <path d="M60 49 v10" />
            <path d="M66.5 50 q-2 6 0 10" />
          </g>
          <ellipse cx={60} cy={82} rx={12.5} ry={8.5} fill={CREAM} />
          <circle cx={41} cy={81} r={4.6} fill="#fb7185" opacity={0.35} />
          <circle cx={79} cy={81} r={4.6} fill="#fb7185" opacity={0.35} />
          <g className="pingo-eyes">
            <Eyes mood={mood} />
          </g>
          <path d="M57 77.6 h6 l-3 3.4 z" fill="#f472b6" />
          <Mouth mood={mood} />
          <g stroke="#fff" strokeOpacity={0.75} strokeWidth={1} strokeLinecap="round">
            <path d="M44 80 L30 77.5" />
            <path d="M44 84 L30 86" />
            <path d="M76 80 L90 77.5" />
            <path d="M76 84 L90 86" />
          </g>
        </g>

        {/* Braço direito segurando o cabo */}
        <path d="M79 109 Q 86 102 86.5 94" fill="none" stroke={FUR_DARK} strokeWidth={10} strokeLinecap="round" />
        <circle cx={86.5} cy={91} r={6.5} fill={CREAM} />
      </g>
    </g>

    {/* Gotas de chuva (ação "rain") */}
    {!headOnly && (
      <g className="pingo-rain" fill="#bae6fd">
        {[26, 48, 72, 98, 116].map((x, i) => (
          <path key={x} className="pingo-drop" style={{ animationDelay: `${i * 0.18}s` }} d={`M${x} -15 C ${x + 4} -9, ${x + 4} -4, ${x} -4 C ${x - 4} -4, ${x - 4} -9, ${x} -15 Z`} />
        ))}
      </g>
    )}
  </svg>
);
