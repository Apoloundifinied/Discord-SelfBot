'use strict';

const { Client, Options } = require('discord.js-selfbot-v13');
const config = require('./config');
const { upsertMessages } = require('./tursoClient');
const { createMessageBuffer } = require('./messageBuffer');
const { resolveUserIdentity } = require('./identityResolver');
const { searchUserMessagesRest } = require('./searchMessages');
const { collectSelfRest } = require('./selfCollector');

const EXIT_CODES = { crashed: 1, banned: 2 };
const targetGuildIds = new Set();
const messageBuffer = createMessageBuffer({
  batchSize: config.insertBatchSize,
  flushMs: config.insertFlushMs,
  write: upsertMessages,
});

let client;
let label = 'instância';
let shuttingDown = false;

function send(type, payload = {}) {
  process.send?.({ type, label, ...payload });
}

function isAccessError(error) {
  const status = error?.httpStatus ?? error?.status ?? error?.code;
  return status === 401 || status === 403;
}

function toRow(message) {
  return {
    message_id: message.id,
    author_name: message.author?.tag ?? message.author?.username ?? 'unknown',
    message_content: message.content ?? '',
    source_info: {
      message_id: message.id,
      channel_id: message.channelId,
      channel_name: message.channel?.name ?? null,
      guild_id: message.guildId,
      guild_name: message.guild?.name ?? null,
      sent_at: message.createdAt?.toISOString?.() ?? null,
    },
  };
}

async function stop(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await messageBuffer.flush();
    await client?.destroy();
  } finally {
    process.exit(code);
  }
}

async function fail(error) {
  const code = isAccessError(error) ? EXIT_CODES.banned : EXIT_CODES.crashed;
  send(code === EXIT_CODES.banned ? 'banned' : 'crashed', { message: error?.message ?? String(error) });
  await stop(code);
}

async function main(token) {
  if (!config.guildIds.length) throw new Error('Configure ao menos um GUILD_IDS em fleet/.env.');

  // Caches mínimos: cada mensagem vira uma linha no Turso e é descartada em
  // seguida — não faz sentido mantê-la no cache em memória de um processo que
  // roda por dias. MessageManager: 0 desativa o cache de mensagens por completo;
  // o resto usa os padrões da lib (guilds/channels/members/presenças, que o
  // resolver de identidade e a nomeação de canais ainda precisam).
  const minimalCache = Options.cacheWithLimits({
    ...Options.defaultMakeCacheSettings,
    MessageManager: 0,
  });

  client = new Client({
    makeCache: minimalCache,
    sweepers: {
      // Rede de segurança: mesmo com MessageManager 0, limpa qualquer mensagem
      // residual do cache a cada 10 min (evita vazamento em caso de recache).
      messages: { interval: 600, filter: () => true },
    },
  });
  client.on('error', fail);
  client.on('guildCreate', guild => {
    if (config.guildIds.includes(guild.id)) targetGuildIds.add(guild.id);
  });
  client.on('messageCreate', message => {
    if (!targetGuildIds.has(message.guildId)) return;
    if (config.channelIds.length && !config.channelIds.includes(message.channelId)) return;
    if (config.ignoreBots && message.author?.bot) return;
    messageBuffer.push(toRow(message)).catch(error => send('warning', { message: error.message }));
  });
  client.on('ready', () => {
    label = `${label} (${client.user.tag})`;
    for (const guildId of config.guildIds) {
      if (client.guilds.cache.has(guildId)) targetGuildIds.add(guildId);
    }
    send('listening', { user: client.user.tag, guildIds: [...targetGuildIds] });
  });
  await client.login(token);
}

process.on('message', message => {
  if (message?.type === 'init') {
    label = message.label || label;
    main(message.token).catch(fail);
  }
  if (message?.type === 'shutdown') stop();
  if (message?.type === 'resolve-identity') {
    if (!client) {
      // Ainda não logou: responde erro rápido em vez de deixar o dashboard
      // esperando o timeout de 45s.
      send('identity-error', { requestId: message.requestId, error: 'Instância ainda não conectada ao Discord.' });
      return;
    }
    resolveUserIdentity(client, message.userId, { source: label })
      .then(result => send('identity-result', { requestId: message.requestId, ...result }))
      .catch(error => send('identity-error', { requestId: message.requestId, error: error.message }));
  }
  if (message?.type === 'search-messages') {
    if (!client) {
      send('search-error', { requestId: message.requestId, error: 'Instância ainda não conectada ao Discord.' });
      return;
    }
    searchUserMessagesRest(client.token, message.userId, {
      maxPagesPerGuild: message.maxPagesPerGuild,
      maxGuilds: message.maxGuilds,
    })
      .then(result => send('search-result', { requestId: message.requestId, ...result }))
      .catch(error => send('search-error', { requestId: message.requestId, error: error.message }));
  }
  if (message?.type === 'collect-self') {
    if (!client) {
      send('self-error', { requestId: message.requestId, error: 'Instância ainda não conectada ao Discord.' });
      return;
    }
    collectSelfRest(client.token)
      .then(result => send('self-result', { requestId: message.requestId, ...result }))
      .catch(error => send('self-error', { requestId: message.requestId, error: error.message }));
  }
});
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
process.on('unhandledRejection', fail);
