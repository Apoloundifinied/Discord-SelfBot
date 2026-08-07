'use strict';

const { integer, list, loadEnv } = require('../shared/config');

loadEnv(__dirname);

const minDelayMs = integer('MIN_DELAY_MS', 2500, { min: 0 });
const maxDelayMs = integer('MAX_DELAY_MS', 5500, { min: minDelayMs });
const minChannelDelayMs = integer('MIN_CHANNEL_DELAY_MS', 8000, { min: 0 });
const maxChannelDelayMs = integer('MAX_CHANNEL_DELAY_MS', 15000, { min: minChannelDelayMs });

module.exports = {
  discordToken: process.env.DISCORD_TOKEN?.trim(),
  tursoUrl: process.env.TURSO_DATABASE_URL?.trim(),
  tursoAuthToken: process.env.TURSO_AUTH_TOKEN?.trim(),
  tursoTable: process.env.TURSO_TABLE?.trim() || 'discord_messages',
  channelIds: list('CHANNEL_IDS'),
  guildIds: list('GUILD_IDS'),
  messagesPerRequest: integer('MESSAGES_PER_REQUEST', 100, { min: 1, max: 100 }),
  maxMessagesPerChannelPerRun: integer('MAX_MESSAGES_PER_CHANNEL_PER_RUN', 2000, { min: 0 }),
  minDelayMs,
  maxDelayMs,
  minChannelDelayMs,
  maxChannelDelayMs,
  insertBatchSize: integer('INSERT_BATCH_SIZE', 200, { min: 1, max: 1000 }),
  maxRetries: integer('MAX_RETRIES', 5, { min: 0, max: 20 }),
};
