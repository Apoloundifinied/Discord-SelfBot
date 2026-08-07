'use strict';

/**
 * Cliente REST para a API do Discord usando a lib discord.js-selfbot-v13.
 *
 * POR QUE NÃO `fetch` PURO: o Discord fica atrás do Cloudflare, que bloqueia
 * o fingerprint TLS/HTTP de bots (ex.: fetch nativo do Node) devolvendo 401
 * falso mesmo com token válido. A lib usa um layer HTTP que passa, então o
 * caminho correto é usar `client.api` dela com o token definido — SEM abrir
 * sessão de gateway.
 */

const { Client } = require('discord.js-selfbot-v13');

let cachedClient = null;
let cachedToken = null;

/**
 * Retorna um Client da lib com o token definido (sem login/gateway), para
 * usar apenas o layer REST (client.api). Cacheado por token.
 * @param {string} token Token de usuário
 */
function getRestClient(token) {
  if (!cachedClient || cachedToken !== token) {
    cachedClient = new Client();
    cachedClient.token = token;
    cachedToken = token;
  }
  return cachedClient;
}

/** Erro com o status HTTP e a mensagem retornados pelo Discord. */
class DiscordApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Discord respondeu com HTTP ${status}.`);
    this.name = 'DiscordApiError';
    this.status = status;
    this.body = body;
  }
}

/** Normaliza um erro da lib em DiscordApiError, preservando o status. */
function toApiError(err) {
  const status = err?.httpStatus ?? err?.status ?? err?.code;
  if (typeof status === 'number') {
    return new DiscordApiError(status, { message: err.message });
  }
  return err;
}

/** Valida o token e devolve o usuário dono (GET /users/@me). */
async function fetchMe(token) {
  try {
    const me = await getRestClient(token).api.users['@me'].get();
    if (!me?.id) throw new DiscordApiError(401, { message: 'Resposta sem id de usuário.' });
    return me;
  } catch (err) {
    throw toApiError(err);
  }
}

/** GET /users/:id/profile (endpoint não documentado, com guilds mútuas). */
async function fetchProfile(token, userId) {
  try {
    return await getRestClient(token).api.users[userId].profile.get({
      query: {
        with_mutual_guilds: true,
        with_mutual_friends: true,
        with_mutual_friends_count: true,
      },
    });
  } catch (err) {
    throw toApiError(err);
  }
}

/** GET /guilds/:guildId (nome da guild). */
async function fetchGuild(token, guildId) {
  return getRestClient(token).api.guilds[guildId].get();
}

/** GET /guilds/:guildId/members/:userId (nick, joined_at, roles). */
async function fetchMember(token, guildId, userId) {
  return getRestClient(token).api.guilds[guildId].members[userId].get();
}

/** GET /guilds/:guildId/roles (nome/cor dos cargos). */
async function fetchRoles(token, guildId) {
  return getRestClient(token).api.guilds[guildId].roles.get();
}

/** GET /users/@me/connections (só para a própria conta). */
async function fetchConnections(token) {
  return getRestClient(token).api.users['@me'].connections.get();
}

/** GET /users/@me/guilds — servidores da conta logada. */
async function fetchMyGuilds(token) {
  return getRestClient(token).api.users['@me'].guilds.get();
}

/** GET /users/@me/relationships — amigos, bloqueados, pendentes. */
async function fetchMyRelationships(token) {
  return getRestClient(token).api.users['@me'].relationships.get();
}

/** GET /users/@me/notes — notas privadas que o dono escreveu sobre usuários. */
async function fetchMyNotes(token) {
  return getRestClient(token).api.users['@me'].notes.get();
}

/** GET /users/@me/channels — lista de DMs ativos da conta. */
async function fetchMyChannels(token) {
  return getRestClient(token).api.users['@me'].channels.get();
}

/** GET /friend-suggestions — amigos sugeridos pelo algoritmo do Discord. */
async function fetchFriendSuggestions(token) {
  return getRestClient(token).api['friend-suggestions'].get();
}

/** GET /users/@me/affinities/users — ranking de interação com usuários. */
async function fetchUserAffinities(token) {
  return getRestClient(token).api.users['@me'].affinities.users.get();
}

/** GET /users/@me/affinities/guilds — ranking de interação com servidores. */
async function fetchGuildAffinities(token) {
  return getRestClient(token).api.users['@me'].affinities.guilds.get();
}

/** GET /users/@me/entitlements — compras/assinaturas da conta. */
async function fetchMyEntitlements(token) {
  return getRestClient(token).api.users['@me'].entitlements.get();
}

/** GET /users/@me/library — jogos/aplicativos da conta. */
async function fetchMyLibrary(token) {
  return getRestClient(token).api.users['@me'].library.get();
}

/** GET /users/@me/settings — preferências da conta. */
async function fetchMySettings(token) {
  return getRestClient(token).api.users['@me'].settings.get();
}

/**
 * GET /users/@me/billing/payment-sources — métodos de pagamento da conta.
 * Devolve o objeto completo como o Discord envia (o próprio endpoint já
 * limita a dados não sensíveis: últimos 4 dígitos, marca, validade, país e o
 * endereço de cobrança embutido quando presente). Número completo e CVV não
 * existem na resposta da API. Consumo consciente: é o dado do próprio dono da
 * conta, exibido apenas no painel local.
 */
async function fetchPaymentSources(token) {
  const sources = await getRestClient(token).api.users['@me'].billing['payment-sources'].get();
  return Array.isArray(sources) ? sources : [];
}

/** GET /users/@me/billing/country-code — código do país da conta (ex.: BR). */
async function fetchBillingCountryCode(token) {
  return getRestClient(token).api.users['@me'].billing['country-code'].get();
}

/**
 * GET /guilds/:guildId/messages/search (endpoint não documentado do cliente,
 * o mesmo que alimenta a barra de busca do Discord). Permite recuperar
 * mensagens de um autor em um servidor mesmo sem o scraper ter passado por lá.
 *
 * A resposta vem como { messages: [[message, channel], ...], total_results,
 * offset, analytics_id } — cada item é um PAR [message, channel].
 *
 * Paginação: o cliente usa limit 25 por página e avança com `offset` (0, 25,
 * 50, ...) até alcançar total_results.
 */
async function searchGuildMessages(token, guildId, { authorId, offset = 0, limit = 25 }) {
  return getRestClient(token).api.guilds[guildId]['messages/search'].get({
    query: { author_id: authorId, offset, limit },
  });
}

module.exports = {
  getRestClient,
  fetchMe,
  fetchProfile,
  fetchGuild,
  fetchMember,
  fetchRoles,
  fetchConnections,
  fetchMyGuilds,
  searchGuildMessages,
  fetchMyRelationships,
  fetchMyNotes,
  fetchMyChannels,
  fetchFriendSuggestions,
  fetchUserAffinities,
  fetchGuildAffinities,
  fetchMyEntitlements,
  fetchMyLibrary,
  fetchMySettings,
  fetchPaymentSources,
  fetchBillingCountryCode,
  DiscordApiError,
};
