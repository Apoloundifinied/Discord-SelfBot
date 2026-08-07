'use strict';

/**
 * Busca de mensagens por autor via REST (GET /guilds/:id/messages/search),
 * usando o layer HTTP da lib discord.js-selfbot-v13 (o fetch puro leva 401
 * falso do Cloudflare na frente do Discord).
 *
 * Estratégia de exploração segura:
 * - Percorre as guilds da conta logada (fetchMyGuilds) e busca o autor em cada.
 * - Paginação por `offset` (25 por página) até `total_results` ou o teto configurado.
 * - Delay entre páginas e entre guilds para respeitar rate limit de token de usuário.
 * - Persiste em identity_search_messages (message_id único, sem duplicar).
 */

const config = require('./config');
const { createTursoClient, assertValidTableName } = require('../shared/turso');
const { upsertSearchMessages } = require('../shared/identityStore');
const { fetchMyGuilds, searchGuildMessages, DiscordApiError } = require('../shared/discordRest');

assertValidTableName(config.tursoTable);

let dbClient;
function getDb() {
  if (!dbClient) dbClient = createTursoClient({ url: config.tursoUrl, authToken: config.tursoAuthToken });
  return dbClient;
}

const PAGE_SIZE = 25;
const MAX_PAGES_PER_GUILD = 8; // teto por guild por execução (8 * 25 = 200 msgs)
const DELAY_BETWEEN_PAGES_MS = 6000;
const DELAY_BETWEEN_GUILDS_MS = 10000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Normaliza um par [message, channel] da resposta da busca em uma linha. */
function toRow(userId, guildId, pair) {
  const [message, channel] = Array.isArray(pair) ? pair : [];
  if (!message?.id) return null;
  return {
    user_id: userId,
    guild_id: guildId,
    channel_id: message.channel_id ?? channel?.id ?? null,
    channel_name: channel?.name ?? null,
    message_id: String(message.id),
    content: message.content ?? '',
    sent_at: message.timestamp ?? null,
  };
}

/**
 * Busca e persiste as mensagens de um autor em todas as guilds da conta.
 * @param {string} token Token de usuário válido (REST)
 * @param {string} userId ID numérico do autor alvo
 * @param {{ maxPagesPerGuild?: number, maxGuilds?: number }} [opts] Limites de exploração
 * @returns {Promise<{user_id: string, guilds: number, pages: number, messages_found: number, messages_new: number, failures: Array<{guild_id: string, error: string}>}>}
 */
async function searchUserMessagesRest(token, userId, opts = {}) {
  const maxPagesPerGuild = opts.maxPagesPerGuild ?? MAX_PAGES_PER_GUILD;
  const maxGuilds = opts.maxGuilds ?? Infinity;

  const guilds = await fetchMyGuilds(token);
  const summary = {
    user_id: userId,
    guilds: Array.isArray(guilds) ? guilds.length : 0,
    pages: 0,
    messages_found: 0,
    messages_new: 0,
    failures: [],
  };

  const slice = (Array.isArray(guilds) ? guilds : []).slice(0, maxGuilds);

  for (const guild of slice) {
    const guildId = guild?.id;
    if (!guildId) continue;

    let offset = 0;
    try {
      for (let page = 0; page < maxPagesPerGuild; page += 1) {
        const data = await searchGuildMessages(token, guildId, {
          authorId: userId,
          offset,
          limit: PAGE_SIZE,
        });

        const pairs = Array.isArray(data?.messages) ? data.messages : [];
        if (!pairs.length) break;

        const rows = pairs.map(pair => toRow(userId, guildId, pair)).filter(Boolean);
        if (rows.length) {
          const inserted = await upsertSearchMessages(getDb(), userId, rows);
          summary.messages_found += rows.length;
          summary.messages_new += inserted;
          summary.pages += 1;
        }

        const totalResults = Number(data?.total_results ?? 0);
        offset += pairs.length;
        if (offset >= totalResults || totalResults === 0) break;
        if (page < maxPagesPerGuild - 1) await sleep(DELAY_BETWEEN_PAGES_MS);
      }
    } catch (err) {
      // Guild sem acesso (403), rate limit (429) ou erro de rede: anota e segue.
      summary.failures.push({
        guild_id: guildId,
        error: err instanceof DiscordApiError ? `HTTP ${err.status}` : err.message,
      });
    }

    await sleep(DELAY_BETWEEN_GUILDS_MS);
  }

  return summary;
}

module.exports = { searchUserMessagesRest };
