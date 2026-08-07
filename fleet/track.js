'use strict';

/**
 * CLI de rastreio agendado de usuários (histórico de nick/avatar/presença).
 *
 * Uso:
 *   node fleet/track.js add <userId> [intervaloMin]   # adiciona ao rastreio (padrão 60min)
 *   node fleet/track.js remove <userId>               # remove do rastreio
 *   node fleet/track.js list                          # lista usuários rastreados
 *   node fleet/track.js check <userId>                # verifica um usuário agora
 *   node fleet/track.js run [segundos]                # loop contínuo (checa a cada N segundos,
 *                                                     # respeitando o intervalo de cada usuário)
 *
 * O token é lido de fleet/accounts.json (primeira conta), de --token=... ou
 * de DISCORD_TOKEN. Usa apenas REST — não abre gateway.
 */

const fs = require('fs');
const config = require('./config');
const { createLogger } = require('../shared/logger');
const { createTursoClient, assertValidTableName } = require('../shared/turso');
const identityStore = require('../shared/identityStore');
const { checkUser, runTrackingPass } = require('./identityTracker');

assertValidTableName(config.tursoTable);

const log = createLogger('track');
const USER_ID_RE = /^\d{17,21}$/;

let dbClient;
function getDb() {
  if (!dbClient) dbClient = createTursoClient({ url: config.tursoUrl, authToken: config.tursoAuthToken });
  return dbClient;
}

function usage() {
  log.error('Uso: node fleet/track.js <add|remove|list|check|run> [userId] [intervaloMin]');
}

function parseArgs(argv) {
  const args = { command: argv[0], userId: null, interval: null, token: null };
  for (const arg of argv.slice(1)) {
    if (arg.startsWith('--token=')) args.token = arg.slice('--token='.length);
    else if (USER_ID_RE.test(arg) && !args.userId) args.userId = arg;
    else if (/^\d+$/.test(arg) && !args.interval) args.interval = Number(arg);
  }
  return args;
}

function loadToken(args) {
  if (args.token) return args.token;
  const envToken = process.env.DISCORD_TOKEN?.trim();
  if (envToken) return envToken;
  if (fs.existsSync(config.accountsFile)) {
    const accounts = JSON.parse(fs.readFileSync(config.accountsFile, 'utf8'));
    if (Array.isArray(accounts) && accounts[0]?.token) return accounts[0].token;
  }
  return null;
}

// Exit atrasado evita o crash "UV_HANDLE_CLOSING" do Windows (libuv).
function finish(code) {
  setTimeout(() => process.exit(code), 100);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = loadToken(args);
  if (!token) {
    log.error('Nenhum token encontrado. Preencha fleet/accounts.json ou use --token=...');
    finish(1);
    return;
  }

  switch (args.command) {
    case 'add': {
      if (!args.userId) return usage();
      await identityStore.upsertTrackedUser(getDb(), args.userId, args.interval ?? 60);
      log.success(`Usuário ${args.userId} adicionado ao rastreio (intervalo ${args.interval ?? 60}min).`);
      finish(0);
      return;
    }

    case 'remove': {
      if (!args.userId) return usage();
      await identityStore.untrackUser(getDb(), args.userId);
      log.success(`Usuário ${args.userId} removido do rastreio.`);
      finish(0);
      return;
    }

    case 'list': {
      const users = await identityStore.listTrackedUsers(getDb());
      if (!users.length) {
        log.info('Nenhum usuário rastreado. Use: node fleet/track.js add <userId>');
      } else {
        log.info('Usuários rastreados:');
        for (const u of users) {
          console.log(
            `  - ${u.user_id} | intervalo ${u.interval_minutes}min | última checagem ${u.last_checked_at ?? '—'}`,
          );
        }
      }
      finish(0);
      return;
    }

    case 'check': {
      if (!args.userId) return usage();
      const outcome = await checkUser(token, args.userId);
      if (!outcome.ok) {
        log.error(`Falha ao verificar ${args.userId}: ${outcome.error}`);
        finish(1);
        return;
      }
      log.success(
        `${args.userId}: ${outcome.changes.length} mudança(s) registrada(s), presença ${outcome.presence ? 'capturada' : 'ausente (REST)'}.`,
      );
      finish(0);
      return;
    }

    case 'run': {
      const loopSeconds = args.interval ?? 300;
      log.info(
        `Loop de rastreio iniciado (checagem a cada ${loopSeconds}s, respeitando o intervalo de cada usuário). Ctrl+C para parar.`,
      );
      await runTrackingPass(token, { force: true }); // primeira passada imediata
      setInterval(() => {
        runTrackingPass(token).catch(err => log.error(`Erro no loop: ${err.message}`));
      }, loopSeconds * 1000);
      return; // mantém o processo vivo
    }

    default:
      usage();
      finish(1);
  }
}

main().catch(err => {
  log.error(`Erro: ${err.message}`);
  finish(1);
});
