'use strict';

const { assertValidTableName } = require('./turso');

// Nomes fixos das tabelas de identidade. Mantidos em um único lugar para que a
// camada de dados nunca espalhe nomes mágicos pelo código.
const TABLES = {
  profiles: 'identity_profiles',
  guilds: 'identity_guilds',
  presence: 'identity_presence',
  connections: 'identity_connections',
};

const TRACKED = 'tracked_users';
const HISTORY = 'identity_history';
const PRESENCE_HISTORY = 'identity_presence_history';
const SEARCH_MESSAGES = 'identity_search_messages';

for (const name of Object.values(TABLES)) assertValidTableName(name);

function nowIso() {
  return new Date().toISOString();
}

/** Upsert da identidade básica (username, tag, avatar, banner, bio, badges, nitro, cor, criação). */
async function upsertProfile(client, row) {
  await client.execute({
    sql: `INSERT INTO ${TABLES.profiles}
            (user_id, username, discriminator, global_name, avatar, banner, about_me,
             public_flags, premium_type, accent_color, avatar_decoration, created_at,
             mutual_friends_count, mutual_friends, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (user_id) DO UPDATE SET
            username = excluded.username,
            discriminator = excluded.discriminator,
            global_name = excluded.global_name,
            avatar = excluded.avatar,
            banner = excluded.banner,
            about_me = excluded.about_me,
            public_flags = excluded.public_flags,
            premium_type = excluded.premium_type,
            accent_color = excluded.accent_color,
            avatar_decoration = excluded.avatar_decoration,
            created_at = excluded.created_at,
            mutual_friends_count = excluded.mutual_friends_count,
            mutual_friends = excluded.mutual_friends,
            fetched_at = excluded.fetched_at`,
    args: [
      row.user_id,
      row.username ?? null,
      row.discriminator ?? null,
      row.global_name ?? null,
      row.avatar ?? null,
      row.banner ?? null,
      row.about_me ?? null,
      row.public_flags ?? null,
      row.premium_type ?? null,
      row.accent_color ?? null,
      row.avatar_decoration ?? null,
      row.created_at ?? null,
      row.mutual_friends_count ?? null,
      JSON.stringify(row.mutual_friends ?? []),
      nowIso(),
    ],
  });
}

/**
 * Grava a lista completa de guilds mútuas de um usuário.
 * Estratégia "delete + insert": a lista de guilds é uma fotografia do momento
 * da coleta; substituir é mais correto do que acumular entradas obsoletas.
 */
async function replaceGuilds(client, userId, guilds) {
  // DELETE + inserts no MESMO batch: o batch do libsql roda em transação, então
  // uma falha no meio não deixa a lista parcialmente apagada.
  const statements = [{ sql: `DELETE FROM ${TABLES.guilds} WHERE user_id = ?`, args: [userId] }];
  for (const g of guilds) {
    statements.push({
      sql: `INSERT INTO ${TABLES.guilds}
              (user_id, guild_id, guild_name, nick, joined_at, roles)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        userId,
        g.guild_id,
        g.guild_name ?? null,
        g.nick ?? null,
        g.joined_at ?? null,
        JSON.stringify(g.roles ?? []),
      ],
    });
  }
  await client.batch(statements);
}

/** Upsert da presença/atividades mais recentes (inclui client_status). */
async function upsertPresence(client, userId, presence) {
  if (!presence) return;
  await client.execute({
    sql: `INSERT INTO ${TABLES.presence} (user_id, status, activities, client_status, fetched_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (user_id) DO UPDATE SET
            status = excluded.status,
            activities = excluded.activities,
            client_status = excluded.client_status,
            fetched_at = excluded.fetched_at`,
    args: [
      userId,
      presence.status ?? null,
      JSON.stringify(presence.activities ?? []),
      JSON.stringify(presence.client_status ?? {}),
      nowIso(),
    ],
  });
}

/** Grava a lista completa de conexões (só disponível para a própria conta). */
async function replaceConnections(client, userId, connections) {
  // Mesma estratégia transacional de replaceGuilds.
  const statements = [{ sql: `DELETE FROM ${TABLES.connections} WHERE user_id = ?`, args: [userId] }];
  for (const c of connections) {
    statements.push({
      sql: `INSERT INTO ${TABLES.connections} (user_id, platform, name, verified)
            VALUES (?, ?, ?, ?)`,
      args: [userId, c.platform ?? 'unknown', c.name ?? null, c.verified ? 1 : 0],
    });
  }
  await client.batch(statements);
}

/** Persiste um snapshot completo de identidade de uma única vez. */
async function upsertIdentity(client, userId, data) {
  if (!data || !userId) return;

  if (data.profile) await upsertProfile(client, { user_id: userId, ...data.profile });
  await replaceGuilds(client, userId, data.guilds ?? []);
  await upsertPresence(client, userId, data.presence);
  await replaceConnections(client, userId, data.connections ?? []);
}

// Campos do perfil que geram histórico quando mudam (rótulos amigáveis).
const TRACKED_FIELDS = [
  ['username', 'Username'],
  ['discriminator', 'Tag'],
  ['global_name', 'Nome global'],
  ['avatar', 'Avatar'],
  ['banner', 'Banner'],
  ['about_me', 'Bio'],
  ['public_flags', 'Badges'],
  ['premium_type', 'Nitro'],
  ['accent_color', 'Cor de destaque'],
  ['avatar_decoration', 'Decoração de avatar'],
];

// ---------- Rastreio agendado ----------

/** Adiciona/atualiza um usuário na lista de rastreio. */
async function upsertTrackedUser(client, userId, intervalMinutes = 60) {
  await client.execute({
    sql: `INSERT INTO ${TRACKED} (user_id, interval_minutes) VALUES (?, ?)
          ON CONFLICT (user_id) DO UPDATE SET interval_minutes = excluded.interval_minutes`,
    args: [userId, intervalMinutes],
  });
}

/** Remove um usuário do rastreio. */
async function untrackUser(client, userId) {
  await client.execute({ sql: `DELETE FROM ${TRACKED} WHERE user_id = ?`, args: [userId] });
}

/** Lista os usuários rastreados. */
async function listTrackedUsers(client) {
  const res = await client.execute({
    sql: `SELECT user_id, interval_minutes, added_at, last_checked_at FROM ${TRACKED} ORDER BY added_at ASC`,
  });
  return res.rows.map(r => ({
    user_id: r.user_id,
    interval_minutes: r.interval_minutes,
    added_at: r.added_at ?? null,
    last_checked_at: r.last_checked_at ?? null,
  }));
}

/** Marca a última verificação de um usuário rastreado. */
async function markTrackedChecked(client, userId) {
  await client.execute({
    sql: `UPDATE ${TRACKED} SET last_checked_at = ? WHERE user_id = ?`,
    args: [nowIso(), userId],
  });
}

/** Retorna o snapshot atual do perfil de um usuário (para comparar em rastreios). */
async function getProfileSnapshot(client, userId) {
  const res = await client.execute({
    sql: `SELECT * FROM ${TABLES.profiles} WHERE user_id = ? LIMIT 1`,
    args: [userId],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    username: row.username ?? null,
    discriminator: row.discriminator ?? null,
    global_name: row.global_name ?? null,
    avatar: row.avatar ?? null,
    banner: row.banner ?? null,
    about_me: row.about_me ?? null,
    public_flags: row.public_flags ?? null,
    premium_type: row.premium_type ?? null,
    accent_color: row.accent_color ?? null,
    avatar_decoration: row.avatar_decoration ?? null,
  };
}

// ---------- Histórico de mudanças de perfil ----------

/**
 * Compara o snapshot antigo com o novo e grava uma linha em identity_history
 * para cada campo que mudou. Retorna a lista de mudanças registradas.
 */
async function recordProfileChanges(client, userId, oldProfile, newProfile) {
  const oldSnap = oldProfile ?? {};
  const newSnap = newProfile ?? {};
  const changes = [];

  for (const [field, label] of TRACKED_FIELDS) {
    const oldValue = oldSnap[field] ?? null;
    const newValue = newSnap[field] ?? null;
    if (String(oldValue ?? '') === String(newValue ?? '')) continue;
    changes.push({ field, label, old_value: oldValue, new_value: newValue });
  }

  if (!changes.length) return changes;

  const statements = changes.map(change => ({
    sql: `INSERT INTO ${HISTORY} (user_id, field, old_value, new_value, changed_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [userId, change.field, String(change.old_value ?? ''), String(change.new_value ?? ''), nowIso()],
  }));
  await client.batch(statements);
  return changes;
}

/** Retorna o histórico de mudanças de um usuário (mais recentes primeiro). */
async function getProfileHistory(client, userId, limit = 50) {
  const res = await client.execute({
    sql: `SELECT field, old_value, new_value, changed_at FROM ${HISTORY}
          WHERE user_id = ? ORDER BY changed_at DESC LIMIT ?`,
    args: [userId, limit],
  });
  const labels = Object.fromEntries(TRACKED_FIELDS);
  return res.rows.map(r => ({
    field: r.field,
    label: labels[r.field] ?? r.field,
    old_value: r.old_value ?? '',
    new_value: r.new_value ?? '',
    changed_at: r.changed_at ?? null,
  }));
}

// ---------- Histórico de presença ----------

/** Grava um snapshot de presença observado em um momento (inclui client_status). */
async function insertPresenceSnapshot(client, userId, presence) {
  if (!presence) return;
  await client.execute({
    sql: `INSERT INTO ${PRESENCE_HISTORY} (user_id, status, activities, client_status, observed_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      userId,
      presence.status ?? null,
      JSON.stringify(presence.activities ?? []),
      JSON.stringify(presence.client_status ?? {}),
      nowIso(),
    ],
  });
}

/** Retorna os snapshots de presença de um usuário (mais recentes primeiro). */
async function getPresenceHistory(client, userId, limit = 50) {
  const res = await client.execute({
    sql: `SELECT status, activities, client_status, observed_at FROM ${PRESENCE_HISTORY}
          WHERE user_id = ? ORDER BY observed_at DESC LIMIT ?`,
    args: [userId, limit],
  });
  return res.rows.map(r => ({
    status: r.status ?? null,
    activities: JSON.parse(r.activities || '[]'),
    client_status: JSON.parse(r.client_status || '{}'),
    observed_at: r.observed_at ?? null,
  }));
}

// ---------- Mensagens buscadas por autor (messages/search) ----------

/**
 * Insere mensagens de um usuário recuperadas via busca por autor. Usa
 * INSERT OR IGNORE (message_id é único): re-executar a busca nunca duplica.
 */
async function upsertSearchMessages(client, userId, messages) {
  if (!Array.isArray(messages) || !messages.length) return 0;
  const statements = messages.map(m => ({
    sql: `INSERT OR IGNORE INTO ${SEARCH_MESSAGES}
            (user_id, guild_id, channel_id, channel_name, message_id, content, sent_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      userId,
      m.guild_id ?? null,
      m.channel_id ?? null,
      m.channel_name ?? null,
      m.message_id ?? null,
      m.content ?? '',
      m.sent_at ?? null,
    ],
  }));
  await client.batch(statements);
  return messages.length;
}

/** Retorna as mensagens buscadas de um usuário (mais recentes primeiro). */
async function getSearchMessages(client, userId, limit = 100) {
  const res = await client.execute({
    sql: `SELECT guild_id, channel_id, channel_name, message_id, content, sent_at, fetched_at
          FROM ${SEARCH_MESSAGES}
          WHERE user_id = ?
          ORDER BY sent_at DESC
          LIMIT ?`,
    args: [userId, limit],
  });
  return res.rows.map(r => ({
    guild_id: r.guild_id ?? null,
    channel_id: r.channel_id ?? null,
    channel_name: r.channel_name ?? null,
    message_id: r.message_id ?? null,
    content: r.content ?? '',
    sent_at: r.sent_at ?? null,
    fetched_at: r.fetched_at ?? null,
  }));
}

module.exports = {
  upsertIdentity,
  getProfileSnapshot,
  upsertTrackedUser,
  untrackUser,
  listTrackedUsers,
  markTrackedChecked,
  recordProfileChanges,
  getProfileHistory,
  insertPresenceSnapshot,
  getPresenceHistory,
  upsertSearchMessages,
  getSearchMessages,
  TABLES,
};
