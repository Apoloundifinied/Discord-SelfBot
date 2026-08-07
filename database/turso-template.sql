-- ============================================================================
-- VOID — TEMPLATE DE BANCO TURSO
-- ============================================================================
-- Este arquivo cria TODAS as tabelas que o VOID precisa (mensagens, identidade,
-- rastreio e Minha Conta). Cole no console SQL do Turso e execute.
--
-- COMO USAR (2 minutos):
--   1. Crie o banco: https://turso.tech  →  Databases  →  Create database
--   2. Abra o banco criado e clique em "Open console" (ou "Run SQL")
--   3. Cole TODO o conteúdo deste arquivo no editor e clique em Run
--   4. Copie a URL do banco (ex.: libsql://voce-bancoteste.turso.io) e gere o
--      token de acesso em Settings  →  Tokens  →  Generate
--   5. No VOID: aba Banco de Dados → cole URL + token → Salvar
--
-- Pode rodar quantas vezes quiser: todos os comandos são idempotentes
-- (CREATE TABLE IF NOT EXISTS).
-- ============================================================================


-- ============================================================================
-- 1. MENSAGENS
-- ============================================================================

create table if not exists discord_messages (
  id integer primary key autoincrement,
  message_id text not null unique,
  author_name text not null,
  message_content text,
  captured_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  source_info text not null default '{}'
);

create index if not exists discord_messages_captured_at_idx
  on discord_messages (captured_at desc);

create index if not exists discord_messages_guild_id_idx
  on discord_messages (json_extract(source_info, '$.guild_id'));

create index if not exists discord_messages_author_name_idx
  on discord_messages (author_name);


-- ============================================================================
-- 2. IDENTIDADE (perfil público de usuários)
-- ============================================================================

create table if not exists identity_profiles (
  user_id text primary key,
  username text,
  discriminator text,
  global_name text,
  avatar text,
  banner text,
  about_me text,
  public_flags integer,
  premium_type integer,
  accent_color integer,
  avatar_decoration text,
  created_at text,
  mutual_friends_count integer,
  mutual_friends text not null default '[]',
  fetched_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists identity_guilds (
  user_id text not null,
  guild_id text not null,
  guild_name text,
  nick text,
  joined_at text,
  roles text not null default '[]',
  primary key (user_id, guild_id)
);

create table if not exists identity_presence (
  user_id text primary key,
  status text,
  activities text not null default '[]',
  client_status text not null default '{}',
  fetched_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists identity_connections (
  user_id text not null,
  platform text not null,
  name text,
  verified integer not null default 0,
  primary key (user_id, platform)
);

create index if not exists identity_guilds_user_id_idx
  on identity_guilds (user_id);


-- ============================================================================
-- 3. RASTREIO (monitoramento agendado)
-- ============================================================================

create table if not exists tracked_users (
  user_id text primary key,
  interval_minutes integer not null default 60,
  added_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_checked_at text
);

create table if not exists identity_history (
  id integer primary key autoincrement,
  user_id text not null,
  field text not null,
  old_value text,
  new_value text,
  changed_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists identity_history_user_id_idx
  on identity_history (user_id, changed_at desc);

create table if not exists identity_presence_history (
  id integer primary key autoincrement,
  user_id text not null,
  status text,
  activities text not null default '[]',
  client_status text not null default '{}',
  observed_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists identity_presence_history_user_id_idx
  on identity_presence_history (user_id, observed_at desc);

create table if not exists identity_search_messages (
  id integer primary key autoincrement,
  user_id text not null,
  guild_id text not null,
  channel_id text,
  channel_name text,
  message_id text not null unique,
  content text,
  sent_at text,
  fetched_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists identity_search_messages_user_id_idx
  on identity_search_messages (user_id, sent_at desc);


-- ============================================================================
-- 4. MINHA CONTA (self — snapshot da conta dona do token)
-- ============================================================================

create table if not exists self_account (
  user_id text primary key,
  username text,
  discriminator text,
  global_name text,
  avatar text,
  banner text,
  public_flags integer,
  premium_type integer,
  mfa_enabled integer not null default 0,
  locale text,
  verified integer not null default 0,
  phone integer not null default 0,
  email integer not null default 0,
  created_at text,
  settings text not null default '{}',
  billing_country text,
  fetched_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists self_relationships (
  user_id text not null,
  target_user_id text not null,
  username text,
  discriminator text,
  global_name text,
  avatar text,
  type text not null,
  nickname text,
  since text,
  primary key (user_id, target_user_id)
);

create table if not exists self_notes (
  user_id text not null,
  target_user_id text not null,
  note text not null default '',
  primary key (user_id, target_user_id)
);

create table if not exists self_channels (
  user_id text not null,
  channel_id text not null,
  name text,
  type integer not null default 1,
  recipients text not null default '[]',
  last_message_id text,
  primary key (user_id, channel_id)
);

create table if not exists self_guilds (
  user_id text not null,
  guild_id text not null,
  name text,
  icon text,
  owner integer not null default 0,
  permissions text,
  primary key (user_id, guild_id)
);

create table if not exists self_affinities (
  user_id text not null,
  kind text not null,
  target_id text not null,
  score text,
  rank integer,
  data text not null default '{}',
  primary key (user_id, kind, target_id)
);

create table if not exists self_friend_suggestions (
  user_id text not null,
  suggested_user_id text not null,
  username text,
  global_name text,
  avatar text,
  mutual_friends_count integer,
  data text not null default '{}',
  primary key (user_id, suggested_user_id)
);

create table if not exists self_entitlements (
  user_id text not null,
  entitlement_id text not null,
  sku_id text,
  name text,
  type integer,
  consumed integer not null default 0,
  primary key (user_id, entitlement_id)
);

create table if not exists self_library (
  user_id text not null,
  app_id text not null,
  name text,
  type integer,
  primary key (user_id, app_id)
);

create table if not exists self_payment_sources (
  user_id text not null,
  source_id text not null,
  type text,
  brand text,
  last4 text,
  expires_month integer,
  expires_year integer,
  is_default integer not null default 0,
  invalid integer not null default 0,
  country text,
  nickname text,
  data text not null default '{}',
  primary key (user_id, source_id)
);


-- ============================================================================
-- FIM DO TEMPLATE — todas as tabelas criadas com sucesso.
-- ============================================================================
