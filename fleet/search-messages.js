'use strict';

/**
 * CLI de busca de mensagens por autor SEM depender da fleet (nem do gateway).
 * Usa apenas REST: o token é lido de fleet/accounts.json (ou DISCORD_TOKEN)
 * e as mensagens são buscadas em todas as guilds da conta e persistidas no
 * Turso (identity_search_messages).
 *
 * Uso:
 *   node fleet/search-messages.js <userId>
 *   node fleet/search-messages.js <userId> --account=conta-01
 *   node fleet/search-messages.js <userId> --token=MTM1...
 *   node fleet/search-messages.js <userId> --pages=5 --guilds=2
 *
 * Observação: respeita rate limit de token de usuário com delays internos
 * (6s entre páginas, 10s entre guilds) e teto padrão de 200 msgs/guild.
 */

const fs = require('fs');
const config = require('./config');
const { searchUserMessagesRest } = require('./searchMessages');
const { createLogger } = require('../shared/logger');

const log = createLogger('search-messages');
const USER_ID_RE = /^\d{17,21}$/;

// O exit imediato dispara o crash "UV_HANDLE_CLOSING" no Windows (libuv)
// enquanto o fetch ainda está fechando. Um pequeno atraso resolve.
function finish(code) {
  setTimeout(() => process.exit(code), 100);
}

function usage() {
  log.error('Uso: node fleet/search-messages.js <userId> [--account=label] [--token=token] [--pages=N] [--guilds=N]');
}

function parseArgs(argv) {
  const args = { userId: null, account: null, token: null, pages: null, guilds: null };
  for (const arg of argv) {
    if (arg.startsWith('--account=')) args.account = arg.slice('--account='.length);
    else if (arg.startsWith('--token=')) args.token = arg.slice('--token='.length);
    else if (arg.startsWith('--pages=')) args.pages = Number(arg.slice('--pages='.length));
    else if (arg.startsWith('--guilds=')) args.guilds = Number(arg.slice('--guilds='.length));
    else if (!arg.startsWith('-') && args.userId === null) args.userId = arg;
  }
  return args;
}

function loadToken(args) {
  if (args.token) return args.token;

  const envToken = process.env.DISCORD_TOKEN?.trim();
  if (envToken) return envToken;

  const accountsFile = config.accountsFile;
  if (fs.existsSync(accountsFile)) {
    const accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
    if (Array.isArray(accounts)) {
      const match = args.account ? accounts.find(a => a.label === args.account) : accounts[0];
      if (match?.token) return match.token;
    }
  }

  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.userId || !USER_ID_RE.test(args.userId)) {
    usage();
    finish(1);
    return;
  }

  const token = loadToken(args);
  if (!token) {
    log.error('Nenhum token encontrado. Preencha fleet/accounts.json, use --token=... ou defina DISCORD_TOKEN.');
    finish(1);
    return;
  }

  const opts = {
    maxPagesPerGuild: Number.isFinite(args.pages) && args.pages > 0 ? args.pages : undefined,
    maxGuilds: Number.isFinite(args.guilds) && args.guilds > 0 ? args.guilds : undefined,
  };

  log.info(`Buscando mensagens de ${args.userId} em todas as guilds da conta...`);
  try {
    const summary = await searchUserMessagesRest(token, args.userId, opts);
    log.success(
      `Concluído: ${summary.messages_found} mensagens encontradas em ${summary.guilds} guild(s), ` +
        `${summary.pages} página(s), ${summary.messages_new} novas persistidas.`,
    );
    if (summary.failures.length) {
      log.warn(`${summary.failures.length} guild(s) falharam: ${summary.failures.map(f => f.guild_id).join(', ')}`);
    }
    console.log(JSON.stringify(summary));
    finish(0);
  } catch (err) {
    log.error(`Falha na busca: ${err.message}`);
    if (/401/.test(err.message)) {
      log.error('O token usado está inválido ou a conta foi sinalizada. Obtenha um token válido e tente de novo.');
    }
    finish(1);
  }
}

main();
