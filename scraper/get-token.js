'use strict';

/**
 * Utilitário para obter o token da conta via login por QR Code
 * (o mesmo método usado pelo app oficial do Discord em "Login por QR Code").
 *
 * Uso:
 *   node scraper/get-token.js
 *
 * Um QR Code será impresso no terminal. Escaneie com o app do Discord
 * (Configurações > Escanear QR Code) na conta que você quer usar no scraper.
 * Após escanear e confirmar no celular, o token será exibido no terminal
 * para você colar em scraper/.env (DISCORD_TOKEN=...) ou em fleet/accounts.json.
 */

const { Client } = require('../src/index');
const { createLogger } = require('../shared/logger');

const log = createLogger('get-token');
const client = new Client();

client.on('ready', () => {
  log.success(`Login concluído como ${client.user.tag}`);
  console.log(`\n  TOKEN: ${client.token}\n`);
  log.info('Copie o token acima para DISCORD_TOKEN (scraper/.env) ou fleet/accounts.json.');
  client.destroy();
  process.exit(0);
});

log.info('Gerando QR Code... escaneie com o app do Discord (Configurações > Escanear QR Code)\n');

client.QRLogin().catch(err => {
  log.error(`Falha no login por QR Code: ${err.message}`);
  process.exit(1);
});
