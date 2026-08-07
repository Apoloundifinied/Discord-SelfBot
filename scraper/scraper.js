'use strict';

const config = require('./config');
const state = require('./state');
const { insertMessages } = require('./tursoClient');
const { randomDelay, isRateLimitError } = require('../shared/utils');
const { createLogger } = require('../shared/logger');

const log = createLogger('scraper');

/**
 * Resolve a lista final de canais de texto a raspar, a partir de CHANNEL_IDS
 * e/ou GUILD_IDS (nesse caso, todos os canais de texto legíveis do servidor).
 */
function resolveChannels(client) {
  const channels = new Map();

  for (const id of config.channelIds) {
    const channel = client.channels.cache.get(id);
    if (!channel) {
      log.warn(`Canal ${id} não encontrado/inacessível, ignorando.`);
      continue;
    }
    if (!channel.isText()) {
      log.warn(`Canal ${id} não é um canal de texto, ignorando.`);
      continue;
    }
    channels.set(channel.id, channel);
  }

  for (const guildId of config.guildIds) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      log.warn(`Servidor ${guildId} não encontrado/inacessível, ignorando.`);
      continue;
    }
    for (const channel of guild.channels.cache.values()) {
      if (channel.isText() && channel.viewable) {
        channels.set(channel.id, channel);
      }
    }
  }

  return [...channels.values()];
}

/** Converte uma Message do discord.js-selfbot-v13 em uma linha da tabela discord_messages. */
function messageToRow(message) {
  const guild = message.guild;
  const channel = message.channel;

  return {
    message_id: message.id,
    author_name: message.author?.tag ?? message.author?.username ?? 'unknown',
    message_content: message.content ?? '',
    source_info: {
      message_id: message.id,
      channel_id: channel?.id ?? null,
      channel_name: channel?.name ?? null,
      guild_id: guild?.id ?? null,
      guild_name: guild?.name ?? null,
      sent_at: message.createdAt?.toISOString?.() ?? null,
      edited_at: message.editedAt?.toISOString?.() ?? null,
      attachments: message.attachments?.size ? [...message.attachments.values()].map(a => a.url) : [],
    },
  };
}

/** Envia as linhas para o Turso em lotes, para não estourar o payload de uma vez. */
async function flushRows(rows) {
  for (let i = 0; i < rows.length; i += config.insertBatchSize) {
    const batch = rows.slice(i, i + config.insertBatchSize);
    await insertMessages(batch);
  }
}

/**
 * Busca uma página de mensagens com retry/backoff em caso de erro ou rate limit.
 */
async function fetchWithRetry(channel, query) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await channel.messages.fetch(query, { cache: false });
    } catch (err) {
      attempt++;
      if (attempt > config.maxRetries) throw err;

      const backoff = isRateLimitError(err)
        ? 15000 * attempt // rate limit: espera bem mais
        : 3000 * attempt; // outro erro: backoff exponencial simples

      log.warn(
        `Erro ao buscar mensagens em #${channel.name ?? channel.id} ` +
          `(tentativa ${attempt}/${config.maxRetries}): ${err.message}. Aguardando ${backoff}ms...`,
      );
      await randomDelay(backoff, backoff + 2000);
    }
  }
}

/**
 * Raspa um único canal, respeitando o limite por execução e salvando progresso
 * incrementalmente em `scraper/data/state.json`.
 *
 * Estratégia:
 *  - Enquanto o histórico completo não tiver sido varrido (`backfillDone=false`),
 *    pagina para trás (`before`) a partir do ponto onde parou da última vez.
 *  - Depois que o histórico completo já foi raspado uma vez, passa a buscar
 *    apenas mensagens novas (`after`), evitando reprocessar tudo de novo.
 */
async function scrapeChannel(channel, guildLabel) {
  const label = `#${channel.name ?? channel.id}${guildLabel ? ` (${guildLabel})` : ''}`;
  const channelState = state.get(channel.id);

  let fetchedThisRun = 0;
  let firstBatch = true;

  log.info(`Iniciando ${label} — modo: ${channelState.backfillDone ? 'incremental' : 'histórico'}`);

  while (fetchedThisRun < config.maxMessagesPerChannelPerRun || config.maxMessagesPerChannelPerRun === 0) {
    const remaining = config.maxMessagesPerChannelPerRun === 0
      ? config.messagesPerRequest
      : Math.min(config.messagesPerRequest, config.maxMessagesPerChannelPerRun - fetchedThisRun);
    const query = { limit: remaining };

    if (!channelState.backfillDone) {
      if (channelState.oldest) query.before = channelState.oldest;
    } else {
      if (channelState.newest) query.after = channelState.newest;
    }

    const messages = await fetchWithRetry(channel, query);
    if (!messages.size) {
      if (!channelState.backfillDone) {
        // Chegou ao início do histórico do canal.
        state.set(channel.id, { backfillDone: true });
        log.success(`${label}: histórico completo raspado.`);
      } else {
        log.info(`${label}: nenhuma mensagem nova.`);
      }
      break;
    }

    const sorted = [...messages.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    const rows = sorted.map(messageToRow);
    await flushRows(rows);

    fetchedThisRun += sorted.length;

    const newestInBatch = sorted[0].id;
    const oldestInBatch = sorted[sorted.length - 1].id;

    const patch = {};
    if (firstBatch && !channelState.newest) patch.newest = newestInBatch;
    if (!channelState.backfillDone) patch.oldest = oldestInBatch;
    else patch.newest = newestInBatch;
    state.set(channel.id, patch);
    Object.assign(channelState, patch);
    firstBatch = false;

    log.info(`${label}: +${sorted.length} mensagens (total nesta execução: ${fetchedThisRun})`);

    // Se veio menos que o limite pedido, não há mais páginas nessa direção.
    if (messages.size < config.messagesPerRequest) {
      if (!channelState.backfillDone) {
        state.set(channel.id, { backfillDone: true });
        log.success(`${label}: histórico completo raspado.`);
      }
      break;
    }

    // Pausa "humanizada" entre requisições — principal proteção anti-ban/anti-ratelimit.
    await randomDelay(config.minDelayMs, config.maxDelayMs);
  }
}

/** Executa a raspagem de todos os canais configurados, sequencialmente. */
async function run(client) {
  const channels = resolveChannels(client);

  if (!channels.length) {
    log.warn('Nenhum canal para raspar. Configure CHANNEL_IDS e/ou GUILD_IDS no scraper/.env');
    return;
  }

  log.info(`${channels.length} canal(is) na fila.`);

  for (const channel of channels) {
    try {
      await scrapeChannel(channel, channel.guild?.name);
    } catch (err) {
      log.error(`Falha ao raspar #${channel.name ?? channel.id}: ${err.message}`);
    }

    // Pausa maior entre canais para distribuir a carga de requisições ao longo do tempo.
    await randomDelay(config.minChannelDelayMs, config.maxChannelDelayMs);
  }

  log.success('Execução concluída.');
}

module.exports = { run, resolveChannels, scrapeChannel, messageToRow };
