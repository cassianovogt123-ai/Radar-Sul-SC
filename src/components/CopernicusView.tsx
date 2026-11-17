import React, { useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { Browser } from '@capacitor/browser';

// Copernicus Browser (ESA): abre já na região, com a imagem Sentinel-2 mais recente.
// O site bloqueia ser mostrado dentro de outro app (iframe fica em branco), então abre numa
// janela do Chrome por cima do app; o X dela volta para o radar.
const URL_COPERNICUS =
  'https://browser.dataspace.copernicus.eu/?zoom=9&lat=-27.1&lng=-53.2&datasetId=S2_L2A_CDAS&layerId=1_TRUE_COLOR&date=latest';

const abrir = () => Browser.open({ url: URL_COPERNICUS, toolbarColor: '#050b18' });

export const CopernicusView: React.FC = () => {
  useEffect(() => {
    abrir();
  }, []);

  return (
    <div className="absolute inset-0 z-[600] bg-[#050b18] flex items-center justify-center p-6">
      <div className="glass rounded-2xl p-5 max-w-sm text-center space-y-3">
        <p className="text-sm text-slate-200">Copernicus Browser · ESA / Sentinel</p>
        <p className="text-xs text-slate-400">
          Imagens de satélite mais recentes e anteriores. Abre numa janela por cima do app; toque no X para voltar.
        </p>
        <button
          onClick={abrir}
          className="h-10 px-4 rounded-xl bg-cyan-400/20 text-cyan-100 text-sm font-medium inline-flex items-center gap-2 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]"
        >
          <ExternalLink size={16} /> Abrir Copernicus
        </button>
      </div>
    </div>
  );
};
