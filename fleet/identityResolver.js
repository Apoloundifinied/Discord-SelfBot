'use strict';

const config = require('./config');
const { createTursoClient, assertValidTableName } = require('../shared/turso');
const { upsertIdentity, insertPresenceSnapshot } = require('../shared/identityStore');

assertValidTableName(config.tursoTable);

// Client de banco compartilhado pela resolução de identidade (mesmo client da
// fleet, mas criado aqui para não acoplar este módulo ao client de mensagens).
let dbClient;
function getDb() {
  if (!dbClient) dbClient = createTursoClient({ url: config.tursoUrl, authToken: config.tursoAuthToken });
  return dbClient;
}

const ACTIVITY_TYPES = {
  0: 'Jogando',
  1: 'Streaming',
  2: 'Ouvindo',
  3: 'Assistindo',
  4: 'Custom',
  5: 'Competindo',
};

/**
 * Normaliza uma Activity do discord.js em um objeto serializável e leve.
 * Inclui rich presence (applicationId, details, state, timestamps, assets) —
 * é o que costuma expor SO/hardware/progresso de jogo.
 */
function serializeActivity(activity) {
  const base = {
    name: activity.name ?? null,
    type: ACTIVITY_TYPES[activity.type] ?? `tipo ${activity.type}`,
  };
  if (activity.applicationId) base.applicationId = activity.applicationId;
  if (activity.details) base.details = activity.details;
  if (activity.state) base.state = activity.state;
  if (activity.timestamps) {
    base.timestamps = {
      start: activity.timestamps.start ? new Date(activity.timestamps.start).toISOString() : null,
      end: activity.timestamps.end ? new Date(activity.timestamps.end).toISOString() : null,
    };
  }
  if (activity.assets) {
    base.assets = {
      largeImage: activity.assets.largeImage ?? null,
      largeText: activity.assets.largeText ?? null,
      smallImage: activity.assets.smallImage ?? null,
      smallText: activity.assets.smallText ?? null,
    };
  }
  return base;
}

const DISCORD_EPOCH_MS = 1420070400000;

/** Data de criação da conta a partir do ID (snowflake). */
function snowflakeToDate(userId) {
  const n = BigInt(userId);
  return new Date(Number(n >> 22n) + DISCORD_EPOCH_MS).toISOString();
}

/**
 * Busca o perfil via endpoint não documentado /users/:id/profile.
 * Retorna { user, user_profile, mutual_guilds, mutual_friends, ... } ou null em erro.
 */
async function fetchProfile(client, userId) {
  try {
    return await client.api.users[userId].profile.get({
      query: {
        with_mutual_guilds: true,
        with_mutual_friends: true,
        with_mutual_friends_count: true,
      },
    });
  } catch {
    return null;
  }
}

/**
 * Resolve e persiste o snapshot de identidade de um usuário.
 * @param {import('discord.js-selfbot-v13').Client} client Cliente logado da instância
 * @param {string} userId ID numérico do usuário alvo
 * @param {{ source?: string }} [meta] Metadados da coleta (ex.: label da conta)
 */
async function resolveUserIdentity(client, userId, meta = {}) {
  const profileData = await fetchProfile(client, userId);
  if (!profileData?.user) {
    throw new Error('Usuário não encontrado ou perfil inacessível para esta conta.');
  }

  const user = profileData.user;
  const userProfile = profileData.user_profile ?? {};
  const mutualGuilds = Array.isArray(profileData.mutual_guilds) ? profileData.mutual_guilds : [];

  const mutualFriends = Array.isArray(profileData.mutual_friends) ? profileData.mutual_friends : [];

  const identity = {
    profile: {
      user_id: userId,
      username: user.username ?? null,
      discriminator: user.discriminator ?? null,
      global_name: user.global_name ?? user.username ?? null,
      avatar: user.avatar ?? null,
      banner: user.banner ?? null,
      about_me: userProfile.bio ?? null,
      public_flags: user.public_flags ?? null,
      premium_type: user.premium_type ?? null,
      accent_color: user.accent_color ?? null,
      avatar_decoration: user.avatar_decoration_data?.asset ?? null,
      created_at: snowflakeToDate(userId),
      mutual_friends_count: profileData.mutual_friends_count ?? mutualFriends.length,
      mutual_friends: mutualFriends
        .slice(0, 50)
        .map(f => ({ id: f.id ?? null, username: f.username ?? null, avatar: f.avatar ?? null })),
    },
    guilds: [],
    presence: null,
    connections: [],
  };

  // Guilds mútuas: detalha cada uma (nome, nick, cargo, entrada) com o mínimo
  // de requests — paraleliza com um teto baixo para não estourar rate limit.
  const mutualIds = mutualGuilds.map(g => g.id).filter(Boolean);
  const batchSize = 5;
  for (let i = 0; i < mutualIds.length; i += batchSize) {
    const slice = mutualIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      slice.map(async guildId => {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return null;
        const member = await guild.members.fetch({ user: userId, force: true, cache: false });
        return {
          guild_id: guildId,
          guild_name: guild.name ?? null,
          nick: member.nickname ?? null,
          joined_at: member.joinedAt ? member.joinedAt.toISOString() : null,
          roles: [...member.roles.cache.values()]
            .filter(role => role.id !== guildId) // remove @everyone
            .map(role => ({ id: role.id, name: role.name, color: role.color ?? 0 })),
        };
      }),
    );
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) identity.guilds.push(result.value);
    }
  }

  // Presença: pega do cache de membros (já trafega pelo gateway; zero custo extra).
  for (const guild of client.guilds.cache.values()) {
    const presence = guild.presences.cache.get(userId) ?? guild.members.cache.get(userId)?.presence;
    if (presence?.activities?.length) {
      identity.presence = {
        status: presence.status ?? null,
        // Em quais tipos de dispositivo a conta está ativa agora (ex.:
        // { desktop: 'online', mobile: 'idle' }) — dado exposto pela API.
        client_status: presence.clientStatus ?? presence.client_status ?? null,
        activities: presence.activities
          .filter(a => a.type !== 4 || a.state) // mantém custom status com texto
          .map(serializeActivity),
      };
      break;
    }
  }

  // Conexões: o Discord só expõe as conexões da PRÓPRIA conta logada.
  if (client.user && client.user.id === userId) {
    try {
      const connections = await client.api.users['@me'].connections.get();
      identity.connections = (Array.isArray(connections) ? connections : []).map(c => ({
        platform: c.type ?? 'unknown',
        name: c.name ?? null,
        verified: Boolean(c.verified),
      }));
    } catch {
      // conexões indisponíveis — mantém lista vazia
    }
  }

  await upsertIdentity(getDb(), userId, identity);

  // Snapshot de presença para o histórico (o gateway é a única fonte de
  // presença — o rastreio via REST não tem como capturar).
  await insertPresenceSnapshot(getDb(), userId, identity.presence);

  return { user_id: userId, source: meta.source ?? null, is_own: Boolean(client.user && client.user.id === userId), ...identity };
}

module.exports = { resolveUserIdentity, serializeActivity, ACTIVITY_TYPES };
