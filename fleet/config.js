'use strict';

const path = require('path');
const { boolean, integer, list, loadEnv } = require('../shared/config');

loadEnv(__dirname);

module.exports = {
  tursoUrl: process.env.TURSO_DATABASE_URL?.trim(),
  tursoAuthToken: process.env.TURSO_AUTH_TOKEN?.trim(),
  tursoTable: process.env.TURSO_TABLE?.trim() || 'discord_messages',
  guildIds: list('GUILD_IDS'),
  channelIds: list('CHANNEL_IDS'),
  ignoreBots: boolean('IGNORE_BOTS', true),
  insertBatchSize: integer('INSERT_BATCH_SIZE', 50, { min: 1, max: 1000 }),
  insertFlushMs: integer('INSERT_FLUSH_MS', 1000, { min: 100, max: 60000 }),
  restartDelayMs: integer('RESTART_DELAY_MS', 15000, { min: 0, max: 300000 }),
  maxRestartsPerAccount: integer('MAX_RESTARTS_PER_ACCOUNT', 3, { min: 0, max: 20 }),
  accountsFile: process.env.ACCOUNTS_FILE?.trim() || path.join(__dirname, 'accounts.json'),
  trackingLoopSeconds: integer('TRACKING_LOOP_SECONDS', 60, { min: 10, max: 3600 }),
};
