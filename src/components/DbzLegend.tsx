import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const STEPS = [
  { dbz: '15', color: '#00d0ff', label: 'Chuvisco' },
  { dbz: '25', color: '#0066ff', label: 'Chuva leve' },
  { dbz: '35', color: '#00cc44', label: 'Chuva moderada' },
  { dbz: '45', color: '#ffd000', label: 'Chuva forte' },
  { dbz: '55', color: '#ff3300', label: 'Granizo provável' },
  { dbz: '65+', color: '#cc00cc', label: 'Tempestade severa' },
];

export const DbzLegend: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="glass rounded-2xl p-3 w-full sm:w-64 text-xs">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="w-full flex items-center justify-between gap-2 cursor-pointer"
        title="Ver o significado de cada faixa"
      >
        <span className="eyebrow">Refletividade · dBZ</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      <div className="mt-2.5 flex h-2 overflow-hidden rounded-full ring-1 ring-white/10">
        {STEPS.map((s) => (
          <div key={s.dbz} className="flex-1" style={{ backgroundColor: s.color }} title={`${s.dbz} dBZ · ${s.label}`} />
        ))}
      </div>
      <div className="mt-1.5 flex font-mono text-[10px] text-slate-400 tabular-nums">
        {STEPS.map((s) => (
          <span key={s.dbz} className="flex-1 text-center">
            {s.dbz}
          </span>
        ))}
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
          {STEPS.map((s) => (
            <div key={s.dbz} className="flex items-center gap-2.5 text-[11px]">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
              <span className="font-mono text-slate-400 tabular-nums w-8">{s.dbz}</span>
              <span className="text-slate-200">{s.label}</span>
            </div>
          ))}
          <p className="pt-2 text-[10px] leading-relaxed text-slate-500">
            O radar mede gotas e gelo em suspensão, não nuvens sem precipitação.
          </p>
        </div>
      )}
    </div>
  );
};
