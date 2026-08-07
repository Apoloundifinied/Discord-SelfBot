'use strict';

/**
 * CLI de resolução de identidade SEM depender da fleet (nem do gateway).
 * Usa apenas REST: o token é lido de fleet/accounts.json (ou DISCORD_TOKEN)
 * e o perfil é resolvido e persistido no Turso.
 *
 * Uso:
 *   node fleet/resolve-identity.js <userId>
 *   node fleet/resolve-identity.js <userId> --account=conta-01
 *   node fleet/resolve-identity.js <userId> --token=MTM1...
 *
 * Observação: presença/rich presence NÃO existem via REST — só pelo gateway.
 * A fleet continua sendo a única forma de capturar presença em tempo real.
 */

const fs = require('fs');
const config = require('./config');
const { resolveUserIdentityRest } = require('./restIdentityResolver');
const { createLogger } = require('../shared/logger');

const log = createLogger('resolve-identity');
const USER_ID_RE = /^\d{17,21}$/;

// O exit imediato dispara o crash "UV_HANDLE_CLOSING" no Windows (libuv)
// enquanto o fetch ainda está fechando. Um pequeno atraso resolve.
function finish(code) {
  setTimeout(() => process.exit(code), 100);
}

function usage() {
  log.error('Uso: node fleet/resolve-identity.js <userId> [--account=label] [--token=token]');
}

function parseArgs(argv) {
  const args = { userId: null, account: null, token: null };
  for (const arg of argv) {
    if (arg.startsWith('--account=')) args.account = arg.slice('--account='.length);
    else if (arg.startsWith('--token=')) args.token = arg.slice('--token='.length);
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
      const match = args.account
        ? accounts.find(a => a.label === args.account)
        : accounts[0];
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

  log.info(`Resolvendo identidade de ${args.userId} via REST...`);
  try {
    const result = await resolveUserIdentityRest(token, args.userId, { source: args.account ? `conta:${args.account}` : 'rest' });

    const profile = result.profile || {};
    log.success(
      `Identidade de ${profile.username ?? '?'} (${result.user_id}) persistida. ` +
        `${result.guilds.length} guild(s) mútua(s), ${result.connections.length} conexão(ões).`,
    );
    console.log(JSON.stringify({ user_id: result.user_id, profile: profile.username ?? null, guilds: result.guilds.length, connections: result.connections.length, is_own: result.is_own }));
    finish(0);
  } catch (err) {
    log.error(`Falha ao resolver identidade: ${err.message}`);
    if (/401/.test(err.message)) {
      log.error('O token usado está inválido ou a conta foi sinalizada. Obtenha um token válido e tente de novo.');
    } else {
      log.error('Confira se o usuário compartilha ao menos um servidor com a conta usada.');
    }
    finish(1);
  }
}

main();
