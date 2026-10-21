import React from 'react';
import { X, ExternalLink, CheckCircle, AlertCircle, Key, Radio } from 'lucide-react';

interface SourceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SourceModal: React.FC<SourceModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-slate-300">
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-semibold text-slate-100">
              Fontes Meteorológicas & Auditoria de Dados
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 md:p-6 overflow-y-auto space-y-5 text-xs leading-relaxed">
          {/* Official Source */}
          <section className="space-y-2 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
            <div className="flex items-center justify-between">
              <span className="text-cyan-400 font-semibold uppercase tracking-wider text-[11px] font-mono">
                Fonte Primária Oficial Conectada
              </span>
              <span className="text-emerald-400 font-medium flex items-center gap-1 text-[11px]">
                <CheckCircle className="w-3.5 h-3.5" />
                Ativa em Produção
              </span>
            </div>
            <h3 className="text-sm font-semibold text-slate-100">
              Defesa Civil de Santa Catarina / SIFAP / Epagri CIRAM
            </h3>
            <p className="text-slate-300">
              O aplicativo conecta-se diretamente aos servidores oficiais do Sistema Integrado de
              Informações de Desastres Naturais (SIFAP) da Defesa Civil de SC, capturando as
              varreduras geradas pelo radar meteorológico de Chapecó (instalado no Morro da Cruz,
              Oeste Catarinense).
            </p>
            <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div><strong>Frequência de varredura:</strong> ~6 minutos por ciclo.</div>
              <div><strong>Produtos disponíveis:</strong> CAPPI 2km (corte horizontal a 2.000m), CAPPI 3km, PPI e Mosaico C-MAX SC.</div>
              <div><strong>Formato dos dados:</strong> Rasters georreferenciados em EPSG:4326 com coordenadas limítrofes exatas [-55.07°W a -50.13°W / -29.21°S a -24.86°S].</div>
              <div className="pt-1">
                <a
                  href="https://sifap.defesacivil.sc.gov.br/radarsc/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline inline-flex items-center gap-1 font-medium"
                >
                  <span>Validar na página oficial da Defesa Civil SC</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </section>

          {/* Validation Guidelines */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
              Como auditar a autenticidade dos dados em tempo real
            </h4>
            <p className="text-slate-400">
              Para verificar que as imagens e detecções não são simuladas ou fictícias:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
              <li>
                Observe o código da imagem na barra temporal (ex.: <code className="text-cyan-300 font-mono">2026102016240400dBZ.cappi_top.png</code>).
              </li>
              <li>
                Acesse o portal da Defesa Civil SC (<code className="text-cyan-300 font-mono">sifap.defesacivil.sc.gov.br/radarsc/</code>).
              </li>
              <li>
                Selecione o radar <strong>OESTE (CHP)</strong> e o produto <strong>CAPPI 2Km</strong>.
              </li>
              <li>
                Verifique que os ecos, posições e carimbos horários coincidem pixel a pixel com a visualização no mapa deste aplicativo.
              </li>
            </ol>
          </section>

          {/* Multi-Source & Alternative integrations */}
          <section className="space-y-3 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
              Fontes Complementares e Tratamento de Falhas
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <div className="font-semibold text-slate-200 mb-1 flex items-center justify-between">
                  <span>RainViewer Doppler Global</span>
                  <span className="text-[10px] text-cyan-400 font-mono">Tile API</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Mosaico Doppler continental com histórico das últimas 2 horas em intervalos de 10 min. Atua como fonte de comparação e contingência caso os servidores estaduais fiquem fora do ar.
                </p>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <div className="font-semibold text-slate-200 mb-1 flex items-center justify-between">
                  <span>DECEA / REDEMET</span>
                  <span className="text-[10px] text-amber-400 font-mono">Chave API</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  A API oficial do Comando da Aeronáutica exige registro prévio e chave privada (<code className="text-amber-300">REDEMET_API_KEY</code>). O backend está preparado no arquivo <code className="text-slate-300">.env</code> para conectar-se assim que a credencial for inserida.
                </p>
              </div>
            </div>
          </section>

          {/* Technical Limitations */}
          <section className="space-y-1 text-slate-400 bg-slate-950/40 p-3 rounded-lg border border-slate-800/80">
            <div className="text-slate-200 font-semibold mb-1 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Diferença entre Ecos de Radar e Nuvens</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              O radar meteorológico de micro-ondas detecta a refletividade de hidrometeoros com massa
              suficiente para precipitar (gotas de chuva e partículas de gelo/granizo). Nuvens altas ou
              estéreis (como cirros ou estratos secos sem precipitação) não produzem eco reflexivo
              significativo. Portanto, o alerta refere-se estritamente à detecção de <strong>ecos de
              precipitação</strong>.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
