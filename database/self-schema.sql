-- Seção Self: snapshot completo da conta dona do token (exploração do self).
-- Execute no Turso via `turso db shell` ou pelo painel.

-- Retrato da conta: perfil oficial + settings (preferências, pastas de guilds).
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

-- Relações sociais: amigos, bloqueados e pendentes, com nickname privado e data de amizade.
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

-- Notas privadas que o dono da conta escreveu sobre usuários.
create table if not exists self_notes (
  user_id text not null,
  target_user_id text not null,
  note text not null default '',
  primary key (user_id, target_user_id)
);

-- DMs ativos da conta (nomes dos contatos, sem conteúdo).
create table if not exists self_channels (
  user_id text not null,
  channel_id text not null,
  name text,
  type integer not null default 1,
  recipients text not null default '[]',
  last_message_id text,
  primary key (user_id, channel_id)
);

-- Servidores da conta, com pastas e organização.
create table if not exists self_guilds (
  user_id text not null,
  guild_id text not null,
  name text,
  icon text,
  owner integer not null default 0,
  permissions text,
  primary key (user_id, guild_id)
);

-- Affinities: ranking de interação com usuários e servidores.
create table if not exists self_affinities (
  user_id text not null,
  kind text not null,
  target_id text not null,
  score text,
  rank integer,
  data text not null default '{}',
  primary key (user_id, kind, target_id)
);

-- Sugestões de amigos do algoritmo do Discord.
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

-- Entitlements: compras/assinaturas da conta (Nitro, boosts, etc.).
create table if not exists self_entitlements (
  user_id text not null,
  entitlement_id text not null,
  sku_id text,
  name text,
  type integer,
  consumed integer not null default 0,
  primary key (user_id, entitlement_id)
);

-- Biblioteca: jogos/aplicativos da conta.
create table if not exists self_library (
  user_id text not null,
  app_id text not null,
  name text,
  type integer,
  primary key (user_id, app_id)
);

-- Métodos de pagamento da conta. Guarda o objeto completo como o Discord
-- entrega (últimos 4 dígitos, marca, validade, país e endereço de cobrança
-- embutido quando presente) + o JSON bruto. Número completo e CVV não existem
-- na resposta da API do Discord. Exibido apenas no painel local, para o dono.
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
