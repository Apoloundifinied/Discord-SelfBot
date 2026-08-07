import { getTursoClient } from '@/lib/tursoServer';

// Nomes fixos das tabelas de identidade — espelham shared/identityStore.js.
const PROFILES = 'identity_profiles';
const GUILDS = 'identity_guilds';
const PRESENCE = 'identity_presence';
const CONNECTIONS = 'identity_connections';
const TRACKED = 'tracked_users';
const HISTORY = 'identity_history';
const PRESENCE_HISTORY = 'identity_presence_history';
const SEARCH_MESSAGES = 'identity_search_messages';

function parseJson(raw, fallback = null) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function parsePresenceRow(row) {
  if (!row) return null;
  return {
    status: row.status ?? null,
    activities: parseJson(row.activities, []),
    client_status: parseJson(row.client_status, {}),
    fetched_at: row.fetched_at ?? null,
  };
}

/** Monta o snapshot completo de identidade de um usuário (perfil, guilds, presença, conexões). */
export async function getIdentity(userId) {
  const db = getTursoClient();

  const [profileRes, guildsRes, presenceRes, connectionsRes] = await Promise.all([
    db.execute({ sql: `SELECT * FROM ${PROFILES} WHERE user_id = ? LIMIT 1`, args: [userId] }),
    db.execute({
      sql: `SELECT guild_id, guild_name, nick, joined_at, roles FROM ${GUILDS} WHERE user_id = ? ORDER BY guild_name COLLATE NOCASE ASC`,
      args: [userId],
    }),
    db.execute({ sql: `SELECT * FROM ${PRESENCE} WHERE user_id = ? LIMIT 1`, args: [userId] }),
    db.execute({ sql: `SELECT platform, name, verified FROM ${CONNECTIONS} WHERE user_id = ? ORDER BY platform ASC`, args: [userId] }),
  ]);

  const profileRow = profileRes.rows[0] ?? null;

  return {
    user_id: userId,
    is_own: connectionsRes.rows.length > 0,
    profile: profileRow
      ? {
          username: profileRow.username ?? null,
          discriminator: profileRow.discriminator ?? null,
          global_name: profileRow.global_name ?? null,
          avatar: profileRow.avatar ?? null,
          banner: profileRow.banner ?? null,
          about_me: profileRow.about_me ?? null,
          public_flags: profileRow.public_flags ?? null,
          premium_type: profileRow.premium_type ?? null,
          accent_color: profileRow.accent_color ?? null,
          avatar_decoration: profileRow.avatar_decoration ?? null,
          created_at: profileRow.created_at ?? null,
          mutual_friends_count: profileRow.mutual_friends_count ?? null,
          mutual_friends: parseJson(profileRow.mutual_friends, []),
          fetched_at: profileRow.fetched_at ?? null,
        }
      : null,
    guilds: guildsRes.rows.map(row => ({
      guild_id: row.guild_id,
      guild_name: row.guild_name ?? null,
      nick: row.nick ?? null,
      joined_at: row.joined_at ?? null,
      roles: parseJson(row.roles, []),
    })),
    presence: parsePresenceRow(presenceRes.rows[0] ?? null),
    connections: connectionsRes.rows.map(row => ({
      platform: row.platform,
      name: row.name ?? null,
      verified: Boolean(row.verified),
    })),
  };
}

/** Lista os usuários em rastreio agendado. */
export async function listTrackedUsers() {
  const db = getTursoClient();
  const res = await db.execute({
    sql: `SELECT user_id, interval_minutes, added_at, last_checked_at FROM ${TRACKED} ORDER BY added_at ASC`,
  });
  return res.rows.map(row => ({
    user_id: row.user_id,
    interval_minutes: row.interval_minutes ?? 60,
    added_at: row.added_at ?? null,
    last_checked_at: row.last_checked_at ?? null,
  }));
}

/** Histórico de mudanças de perfil de um usuário (mais recentes primeiro). */
export async function getProfileHistory(userId, limit = 30) {
  const db = getTursoClient();
  const res = await db.execute({
    sql: `SELECT field, old_value, new_value, changed_at FROM ${HISTORY}
          WHERE user_id = ? ORDER BY changed_at DESC LIMIT ?`,
    args: [userId, limit],
  });
  const labels = {
    username: 'Username',
    discriminator: 'Tag',
    global_name: 'Nome global',
    avatar: 'Avatar',
    banner: 'Banner',
    about_me: 'Bio',
    public_flags: 'Badges',
    premium_type: 'Nitro',
    accent_color: 'Cor de destaque',
    avatar_decoration: 'Decoração de avatar',
  };
  return res.rows.map(row => ({
    field: row.field,
    label: labels[row.field] ?? row.field,
    old_value: row.old_value ?? '',
    new_value: row.new_value ?? '',
    changed_at: row.changed_at ?? null,
  }));
}

/** Snapshots de presença de um usuário ao longo do tempo. */
export async function getPresenceHistory(userId, limit = 30) {
  const db = getTursoClient();
  const res = await db.execute({
    sql: `SELECT status, activities, client_status, observed_at FROM ${PRESENCE_HISTORY}
          WHERE user_id = ? ORDER BY observed_at DESC LIMIT ?`,
    args: [userId, limit],
  });
  return res.rows.map(row => ({
    status: row.status ?? null,
    activities: parseJson(row.activities, []),
    client_status: parseJson(row.client_status, {}),
    observed_at: row.observed_at ?? null,
  }));
}

/** Mensagens de um usuário recuperadas via busca por autor (mais recentes primeiro). */
export async function getUserSearchMessages(userId, limit = 100) {
  const db = getTursoClient();
  const res = await db.execute({
    sql: `SELECT guild_id, channel_id, channel_name, message_id, content, sent_at, fetched_at
          FROM ${SEARCH_MESSAGES}
          WHERE user_id = ?
          ORDER BY sent_at DESC
          LIMIT ?`,
    args: [userId, limit],
  });
  return res.rows.map(row => ({
    guild_id: row.guild_id ?? null,
    channel_id: row.channel_id ?? null,
    channel_name: row.channel_name ?? null,
    message_id: row.message_id ?? null,
    content: row.content ?? '',
    sent_at: row.sent_at ?? null,
    fetched_at: row.fetched_at ?? null,
  }));
}

/** Lista os últimos usuários resolvidos (para a área mostrar histórico recente). */
export async function listRecentProfiles(limit = 8) {
  const db = getTursoClient();
  const res = await db.execute({
    sql: `SELECT user_id, username, discriminator, global_name, fetched_at
          FROM ${PROFILES}
          ORDER BY fetched_at DESC
          LIMIT ?`,
    args: [limit],
  });
  return res.rows.map(row => ({
    user_id: row.user_id,
    username: row.username ?? null,
    discriminator: row.discriminator ?? null,
    global_name: row.global_name ?? null,
    fetched_at: row.fetched_at ?? null,
  }));
}
