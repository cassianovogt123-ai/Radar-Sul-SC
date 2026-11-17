import React from 'react';
import { ExternalLink } from 'lucide-react';

// Copernicus Browser (ESA) dentro do app: abre já na região, com a imagem Sentinel-2 mais recente.
// Dentro dele dá para trocar satélite (Sentinel-1, 2, 3, 5P), camada e data, igual no navegador.
const URL_COPERNICUS =
  'https://browser.dataspace.copernicus.eu/?zoom=9&lat=-27.1&lng=-53.2&datasetId=S2_L2A_CDAS&layerId=1_TRUE_COLOR&date=latest';

export const CopernicusView: React.FC = () => (
  <div className="absolute inset-0 z-[600] bg-[#050b18]">
    {/* faixa logo abaixo do seletor Radar/Satélite/Rios, para nada cobrir os botões do Copernicus */}
    <div className="absolute inset-x-3 sm:inset-x-4 top-[6.25rem] sm:top-[7rem] h-7 flex items-center justify-between text-[11px] text-slate-400">
      <span className="truncate">Copernicus Browser · ESA / Sentinel</span>
      <a
        href={URL_COPERNICUS}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 flex items-center gap-1 text-cyan-300 hover:text-white"
        title="Se a tela ficar em branco, abre o Copernicus no navegador"
      >
        <ExternalLink size={12} /> Abrir no navegador
      </a>
    </div>
    <iframe
      src={URL_COPERNICUS}
      title="Copernicus Browser"
      className="absolute inset-x-0 bottom-0 top-32 sm:top-[8.75rem] w-full border-0"
      allow="fullscreen; geolocation"
    />
  </div>
);
