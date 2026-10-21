-- ====================================================================
-- Radar Chapecó - Esquema SQL para Chat Comunitário Regional (Supabase)
-- ====================================================================

-- 1. Criação da tabela de mensagens
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  nickname text not null check (char_length(nickname) between 1 and 30),
  municipality text not null check (char_length(municipality) between 1 and 50),
  content text not null check (char_length(content) between 1 and 300),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  reports_count integer default 0 not null
);

-- 2. Habilitação de Row Level Security (RLS) para proteção contra alterações indevidas
alter table public.chat_messages enable row level security;

-- Política 1: Todos podem ler mensagens ativas (não ocultadas por denúncias)
create policy "Leitura pública de mensagens ativas"
  on public.chat_messages for select
  using (reports_count < 3);

-- Política 2: Qualquer usuário autenticado (ou anônimo com chave pública) pode enviar mensagens válidas
create policy "Inserção de novas mensagens comunitárias"
  on public.chat_messages for insert
  with check (
    char_length(content) between 1 and 300 and
    char_length(nickname) between 1 and 30 and
    char_length(municipality) between 1 and 50
  );

-- Política 3: Usuários podem reportar/denunciar mensagens (incrementando contador)
create policy "Denúncia de mensagens comunitárias"
  on public.chat_messages for update
  using (true)
  with check (reports_count >= 1);

-- 3. Habilitação de Realtime no Supabase para transmissão instantânea
alter publication supabase_realtime add table public.chat_messages;

-- 4. Criação de índice para performance de leitura por data
create index if not exists idx_chat_messages_created_at
  on public.chat_messages (created_at desc);
