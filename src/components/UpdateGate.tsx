// Atualização obrigatória do APK: se a release mais nova do GitHub for maior que a versão
// instalada, bloqueia o app até atualizar. O Android sempre pede o toque em "Instalar"
// (app fora da Play Store não pode se instalar sozinho).
import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { getText } from './SatelliteView';

declare const __APP_VERSION__: string;
const REPO = 'cassianovogt123-ai/Radar-Sul-SC';
const APK_URL = `https://github.com/${REPO}/releases/latest/download/VogtSonar-Sul.apk`;

const build = (v: string) => Number(String(v).split('.').pop()); // "1.0.42" / "v1.0.42" -> 42

export const UpdateGate: React.FC = () => {
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    const installed = build(__APP_VERSION__);
    if (!Capacitor.isNativePlatform() || isNaN(installed)) return; // web já é sempre a última; build de teste não checa
    const check = async () => {
      try {
        const tag: string = JSON.parse(await getText(`https://api.github.com/repos/${REPO}/releases/latest`)).tag_name;
        if (build(tag) > installed) setLatest(tag.replace(/^v/, ''));
      } catch {
        /* sem internet ou GitHub fora: não bloqueia o app */
      }
    };
    check();
    const id = setInterval(check, 5 * 60000); // GitHub permite 60 consultas/hora sem login; 12 por hora cabe com folga
    return () => clearInterval(id);
  }, []);

  if (!latest) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="upd-title" className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#1c1442]/95 p-6">
      <div className="max-w-sm w-full rounded-2xl border border-cyan-400/40 bg-slate-900 p-6 text-center shadow-2xl">
        <h2 id="upd-title" className="text-lg font-bold text-cyan-300">Atualização obrigatória</h2>
        <p className="mt-2 text-sm text-slate-300">
          A versão <b>{latest}</b> do VogtSonar Sul está disponível. Você está na {__APP_VERSION__}.
        </p>
        <a
          href={APK_URL}
          className="mt-5 block rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
        >
          Baixar e instalar
        </a>
        <p className="mt-3 text-xs text-slate-400">Depois do download, toque no arquivo e em “Instalar”. Seus ajustes continuam.</p>
      </div>
    </div>
  );
};
