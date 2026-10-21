import React, { useState } from 'react';
import { X, Check, Copy, Database, ExternalLink, Shield } from 'lucide-react';

interface SupabaseSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SQL_SCHEMA = `-- 1. Tabela de mensagens comunitárias
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  nickname text not null check (char_length(nickname) between 1 and 30),
  municipality text not null check (char_length(municipality) between 1 and 50),
  content text not null check (char_length(content) between 1 and 300),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  reports_count integer default 0 not null
);

-- 2. Habilitação de RLS
alter table public.chat_messages enable row level security;

create policy "Leitura pública de mensagens ativas"
  on public.chat_messages for select
  using (reports_count < 3);

create policy "Inserção de novas mensagens comunitárias"
  on public.chat_messages for insert
  with check (
    char_length(content) between 1 and 300 and
    char_length(nickname) between 1 and 30 and
    char_length(municipality) between 1 and 50
  );

-- 3. Habilitação de Realtime
alter publication supabase_realtime add table public.chat_messages;`;

export const SupabaseSetupModal: React.FC<SupabaseSetupModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(SQL_SCHEMA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-slate-300">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Configuração Supabase (Banco de Dados & Realtime)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 md:p-5 overflow-y-auto space-y-4 text-xs leading-relaxed">
          <div className="p-3 bg-emerald-950/40 border border-emerald-900/60 rounded-xl text-emerald-300 flex items-start gap-2">
            <Shield className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Chat já ativo:</strong> O aplicativo já está funcionando em tempo real com o motor WebSocket nativo e persistência em disco. Esta integração com o Supabase é opcional caso queira hospedar suas mensagens na nuvem.
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase font-mono text-slate-200">
              Passo a Passo para Conectar ao Supabase:
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
              <li>
                Crie um projeto gratuito em{' '}
                <a
                  href="https://supabase.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 hover:underline inline-flex items-center gap-0.5"
                >
                  supabase.com <ExternalLink className="w-3 h-3 inline" />
                </a>.
              </li>
              <li>Acesse o menu <strong>SQL Editor</strong> e execute o script abaixo.</li>
              <li>
                Acesse <strong>Project Settings &gt; API</strong> e copie a <code>URL</code> e a chave <code>anon public</code>.
              </li>
              <li>
                Adicione no seu arquivo <code>.env</code>:
                <pre className="bg-slate-950 p-2 rounded mt-1 font-mono text-[11px] text-cyan-300">
                  VITE_SUPABASE_URL="https://seu-projeto.supabase.co"&#10;VITE_SUPABASE_ANON_KEY="sua-chave-anon"
                </pre>
              </li>
            </ol>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-slate-400">
                Script SQL (Tabelas, RLS & Realtime):
              </span>
              <button
                onClick={handleCopy}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] flex items-center gap-1 transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copiado!' : 'Copiar SQL'}</span>
              </button>
            </div>
            <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-44">
              {SQL_SCHEMA}
            </pre>
          </div>
        </div>

        <div className="p-3 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
