'use strict';

/**
 * CLI de coleta do "self" SEM depender da fleet (nem do gateway).
 * Usa apenas REST: o token é lido de fleet/accounts.json (ou DISCORD_TOKEN)
 * e o snapshot completo da conta é persistido no Turso (tabelas self_*).
 *
 * Uso:
 *   node fleet/self.js
 *   node fleet/self.js --account=conta-01
 *   node fleet/self.js --token=MTM1...
 *
 * Dados sensíveis (billing) são gravados SEMPRE redigidos (tipo, marca,
 * últimos 4, país) — nunca número completo, CVV ou endereço.
 */

const fs = require('fs');
const config = require('./config');
const { collectSelfRest } = require('./selfCollector');
const { createLogger } = require('../shared/logger');

const log = createLogger('self');

// O exit imediato dispara o crash "UV_HANDLE_CLOSING" no Windows (libuv)
// enquanto o fetch ainda está fechando. Um pequeno atraso resolve.
function finish(code) {
  setTimeout(() => process.exit(code), 100);
}

function parseArgs(argv) {
  const args = { account: null, token: null };
  for (const arg of argv) {
    if (arg.startsWith('--account=')) args.account = arg.slice('--account='.length);
    else if (arg.startsWith('--token=')) args.token = arg.slice('--token='.length);
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

  const token = loadToken(args);
  if (!token) {
    log.error('Nenhum token encontrado. Preencha fleet/accounts.json, use --token=... ou defina DISCORD_TOKEN.');
    finish(1);
    return;
  }

  log.info('Coletando snapshot completo da conta (self) via REST...');
  try {
    const summary = await collectSelfRest(token);

    const sections = Object.entries(summary.sections)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => `${name}=${count}`)
      .join(', ');

    log.success(`Concluído: ${summary.user_id ?? '?'} — ${sections || 'nenhuma seção com dados'}`);
    if (summary.failures.length) {
      log.warn(`${summary.failures.length} seção(ões) falharam: ${summary.failures.map(f => `${f.section}(${f.error})`).join(', ')}`);
    }
    console.log(JSON.stringify(summary));
    finish(0);
  } catch (err) {
    log.error(`Falha na coleta: ${err.message}`);
    if (/401/.test(err.message)) {
      log.error('O token usado está inválido ou a conta foi sinalizada. Obtenha um token válido e tente de novo.');
    }
    finish(1);
  }
}

main();
