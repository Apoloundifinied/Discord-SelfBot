'use strict';

const { Client } = require('../src/index');
const config = require('./config');
const scraper = require('./scraper');
const { createLogger } = require('../shared/logger');

const log = createLogger('scraper');

if (!config.discordToken) {
  log.error('DISCORD_TOKEN não configurado. Preencha scraper/.env (veja scraper/.env.example).');
  process.exit(1);
}

const client = new Client();

let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('Encerrando... (progresso já foi salvo em scraper/data/state.json)');
  try {
    await client.destroy();
  } finally {
    process.exit(code);
  }
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

client.on('ready', async () => {
  log.success(`Logado como ${client.user.tag}`);
  try {
    await scraper.run(client);
  } catch (err) {
    log.error('Erro fatal durante a raspagem:', err);
  } finally {
    await shutdown(0);
  }
});

client.login(config.discordToken).catch(err => {
  log.error(`Falha no login. Verifique o DISCORD_TOKEN: ${err.message}`);
  process.exit(1);
});
