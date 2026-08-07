-- Schema para Turso (SQLite). Execute no Turso via `turso db shell` ou no painel.
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

-- Identidade: snapshot do perfil público de um usuário.
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

-- Identidade: guilds mútuas do usuário com as contas da fleet.
create table if not exists identity_guilds (
  user_id text not null,
  guild_id text not null,
  guild_name text,
  nick text,
  joined_at text,
  roles text not null default '[]',
  primary key (user_id, guild_id)
);

-- Identidade: presença/atividades mais recentes observadas.
-- client_status: em quais tipos de dispositivo a conta está ativa agora
-- (ex.: {"desktop":"online","mobile":"idle"}) — dado exposto pela API do Discord.
create table if not exists identity_presence (
  user_id text primary key,
  status text,
  activities text not null default '[]',
  client_status text not null default '{}',
  fetched_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Identidade: conexões vinculadas (Spotify, Steam, GitHub etc.) — só da própria conta.
create table if not exists identity_connections (
  user_id text not null,
  platform text not null,
  name text,
  verified integer not null default 0,
  primary key (user_id, platform)
);

create index if not exists identity_guilds_user_id_idx
  on identity_guilds (user_id);

-- Rastreio: usuários sendo monitorados com snapshots agendados.
create table if not exists tracked_users (
  user_id text primary key,
  interval_minutes integer not null default 60,
  added_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_checked_at text
);

-- Histórico: mudanças observadas no perfil (nick/username/avatar/banner/bio/badges...).
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

-- Histórico: snapshots de presença ao longo do tempo (status + atividades + dispositivos).
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

-- Mensagens de um usuário recuperadas via busca por autor (messages/search).
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
