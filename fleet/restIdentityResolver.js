'use strict';

/**
 * Resolução de identidade de usuário 100% via REST (sem abrir sessão de
 * gateway), usando o layer HTTP da lib discord.js-selfbot-v13 — o fetch puro
 * do Node recebe 401 falso do Cloudflare na frente do Discord.
 *
 * Diferenças em relação ao fleet/identityResolver.js (gateway):
 * - Presença/atividades: NÃO existem via REST — identity.presence fica null.
 * - Guilds mútuas: o nome da guild vem de GET /guilds/:id (o endpoint de
 *   membro não devolve o nome).
 */

const config = require('./config');
const { createTursoClient, assertValidTableName } = require('../shared/turso');
const { upsertIdentity } = require('../shared/identityStore');
const {
  fetchMe,
  fetchProfile,
  fetchGuild,
  fetchMember,
  fetchRoles,
  fetchConnections,
  DiscordApiError,
} = require('../shared/discordRest');

assertValidTableName(config.tursoTable);

let dbClient;
function getDb() {
  if (!dbClient) dbClient = createTursoClient({ url: config.tursoUrl, authToken: config.tursoAuthToken });
  return dbClient;
}

const DISCORD_EPOCH_MS = 1420070400000;

/** Data de criação da conta a partir do ID (snowflake). */
function snowflakeToDate(userId) {
  const n = BigInt(userId);
  return new Date(Number(n >> 22n) + DISCORD_EPOCH_MS).toISOString();
}

/**
 * Resolve e persiste o snapshot de identidade de um usuário via REST.
 * @param {string} token Token de usuário válido (REST)
 * @param {string} userId ID numérico do usuário alvo
 * @param {{ source?: string }} [meta] Metadados da coleta
 */
async function resolveUserIdentityRest(token, userId, meta = {}) {
  let profileData;
  try {
    profileData = await fetchProfile(token, userId);
  } catch (err) {
    if (err instanceof DiscordApiError && err.status === 401) {
      throw new Error('Token inválido ou conta sinalizada pelo Discord (HTTP 401).');
    }
    throw new Error('Perfil inacessível para esta conta (sem guild mútua ou usuário inexistente).');
  }

  const user = profileData?.user;
  if (!user) {
    throw new Error('Perfil inacessível para esta conta (sem guild mútua ou usuário inexistente).');
  }

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
    // Presença/rich presence só existem no gateway — via REST não há como obter.
    presence: null,
    connections: [],
  };

  // Guilds mútuas: membro + nome da guild + roles, com teto de 5 guilds em
  // paralelo para não estourar rate limit.
  const mutualIds = mutualGuilds.map(g => g.id).filter(Boolean);
  const batchSize = 5;
  for (let i = 0; i < mutualIds.length; i += batchSize) {
    const slice = mutualIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      slice.map(async guildId => {
        const [member, guild, roles] = await Promise.all([
          fetchMember(token, guildId, userId).catch(() => null),
          fetchGuild(token, guildId).catch(() => null),
          fetchRoles(token, guildId).catch(() => null),
        ]);
        const roleMap = new Map((Array.isArray(roles) ? roles : []).map(r => [r.id, r]));
        return {
          guild_id: guildId,
          guild_name: guild?.name ?? null,
          nick: member?.nick ?? null,
          joined_at: member?.joined_at ?? null,
          roles: (Array.isArray(member?.roles) ? member.roles : [])
            .filter(id => id !== guildId) // remove @everyone
            .map(id => roleMap.get(id))
            .filter(Boolean)
            .map(r => ({ id: r.id, name: r.name, color: r.color ?? 0 })),
        };
      }),
    );
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) identity.guilds.push(result.value);
    }
  }

  // Conexões: o Discord só expõe as conexões da PRÓPRIA conta logada.
  let isOwn = false;
  try {
    const me = await fetchMe(token);
    isOwn = me.id === userId;
    if (isOwn) {
      const connections = await fetchConnections(token);
      identity.connections = (Array.isArray(connections) ? connections : []).map(c => ({
        platform: c.type ?? 'unknown',
        name: c.name ?? null,
        verified: Boolean(c.verified),
      }));
    }
  } catch {
    // conexões indisponíveis — mantém lista vazia
  }

  await upsertIdentity(getDb(), userId, identity);
  return {
    user_id: userId,
    source: meta.source ?? 'rest',
    is_own: isOwn,
    ...identity,
  };
}

module.exports = { resolveUserIdentityRest };
