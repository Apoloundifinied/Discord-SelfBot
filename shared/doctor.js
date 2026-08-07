'use strict';

/**
 * Diagnóstico consolidado do produto — uma única fonte de verdade usada pelo
 * CLI `npm run doctor` e pela rota GET /api/health do dashboard.
 *
 * Cobre: versão, Node.js, licença, banco de dados (Turso/SQLite local),
 * token do Discord e última coleta.
 *
 * Sem dependências pesadas: o teste de token é delegado a fleet/test-token.js
 * (child process) — o mesmo testador que o dashboard já usa — para este módulo
 * rodar tanto no CLI raiz quanto dentro do Next.js sem puxar
 * discord.js-selfbot-v13 para dashboard/.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { parseEnvFile } = require('./envFile');
const { createTursoClient, assertValidTableName } = require('./turso');
const { loadPublicKey, verifyLicenseKey, getMachineId } = require('./license');

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}$/;
const NODE_MIN = [20, 18];
const TOKEN_TEST_TIMEOUT_MS = 20000;

// ---------------------------------------------------------------------------
// Versão e ambiente
// ---------------------------------------------------------------------------

/** Lê a versão do produto do package.json da raiz. Retorna null se ilegível. */
function readVersion(rootDir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

/** Node >= 20.18? (engines do package.json). */
function nodeOk(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  return major > NODE_MIN[0] || (major === NODE_MIN[0] && minor >= NODE_MIN[1]);
}

// ---------------------------------------------------------------------------
// Configuração em disco (CLI) — o dashboard usa a config em memória + estes
// arquivos apenas para token/contas (que não vivem na runtime config).
// ---------------------------------------------------------------------------

function readEnvConfig(rootDir) {
  const scraper = parseEnvFile(path.join(rootDir, 'scraper', '.env'));
  const fleet = parseEnvFile(path.join(rootDir, 'fleet', '.env'));
  const dash = parseEnvFile(path.join(rootDir, 'dashboard', '.env.local'));

  let accounts = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(rootDir, 'fleet', 'accounts.json'), 'utf8'));
    if (Array.isArray(raw)) accounts = raw;
  } catch {
    /* sem accounts.json — fleet ainda não configurada */
  }

  return {
    tursoUrl: scraper.TURSO_DATABASE_URL?.trim() || fleet.TURSO_DATABASE_URL?.trim() || dash.TURSO_DATABASE_URL?.trim() || '',
    tursoAuthToken: scraper.TURSO_AUTH_TOKEN?.trim() || fleet.TURSO_AUTH_TOKEN?.trim() || dash.TURSO_AUTH_TOKEN?.trim() || '',
    tursoTable: scraper.TURSO_TABLE?.trim() || fleet.TURSO_TABLE?.trim() || dash.TURSO_TABLE?.trim() || 'discord_messages',
    scraperToken: scraper.DISCORD_TOKEN?.trim() || '',
    fleetAccounts: accounts.filter(a => a && typeof a.token === 'string' && a.token.trim()),
  };
}

// ---------------------------------------------------------------------------
// Licença
// ---------------------------------------------------------------------------

/**
 * Estado de licença desta instalação (mesma verificação do dashboard: chave
 * ativada localmente, assinatura contra a chave pública embarcada + validade
 * temporal + vínculo opcional de máquina).
 */
function checkLicense({ rootDir }) {
  const result = {
    mode: fs.existsSync(path.join(rootDir, 'licenses', 'private.pem.enc')) ? 'owner' : 'client',
    enforce: process.env.LICENSE_ENFORCE === 'true' || process.env.LICENSE_ENFORCE === '1',
    publicKeyPresent: fs.existsSync(path.join(rootDir, 'licenses', 'public.pem')),
    activated: false,
    valid: false,
    reason: null,
    subject: null,
    expiresAt: null,
    machineBound: false,
  };

  if (!result.publicKeyPresent) {
    result.reason = 'chave-publica-ausente';
    return result;
  }

  let activation = null;
  if (fs.existsSync(path.join(rootDir, 'licenses', 'activation.json'))) {
    try {
      activation = JSON.parse(fs.readFileSync(path.join(rootDir, 'licenses', 'activation.json'), 'utf8'));
    } catch {
      activation = null;
    }
  }
  if (!activation?.key) {
    result.reason = 'sem-ativacao';
    return result;
  }
  result.activated = true;

  let check;
  try {
    check = verifyLicenseKey({ publicKeyPem: loadPublicKey(path.join(rootDir, 'licenses', 'public.pem')), key: activation.key });
  } catch {
    check = { ok: false, reason: 'verificacao-falhou' };
  }
  if (!check.ok) {
    result.reason = check.reason;
    return result;
  }

  const payload = check.payload;
  const bound = Boolean(payload.mid);
  const machineMatch = !bound || activation.machineId === getMachineId();
  result.valid = machineMatch;
  result.reason = machineMatch ? null : 'maquina-diferente';
  result.subject = payload.sub ?? null;
  result.expiresAt = payload.exp ? new Date(payload.exp * 1000).toISOString() : null;
  result.machineBound = bound;
  return result;
}

// ---------------------------------------------------------------------------
// Banco de dados (Turso remoto ou SQLite local file:)
// ---------------------------------------------------------------------------

/**
 * Testa a conexão com o banco e coleta contagem de mensagens + última coleta.
 * Cria e fecha um client próprio — nunca usa o client cacheado do servidor.
 */
async function checkDatabase({ url, authToken, table }) {
  const local = Boolean(url && url.startsWith('file:'));
  const configured = Boolean(url && (authToken || local));
  const base = { configured, local, connected: false, error: null, messageCount: null, lastCollectedAt: null };

  if (!configured) {
    base.error = 'Banco de dados não configurado.';
    return base;
  }

  let client;
  try {
    // Config errada (nome de tabela) é distinta de banco fora do ar: valida
    // ANTES de tocar o client e interpolar o nome em SQL.
    assertValidTableName(table);
    client = createTursoClient({ url, authToken });
    await client.execute('SELECT 1');

    try {
      const count = await client.execute({ sql: `SELECT COUNT(*) AS c FROM ${table}`, args: [] });
      base.messageCount = Number(count.rows?.[0]?.c ?? 0);
    } catch {
      base.messageCount = null; // tabela ainda não criada (schema não aplicado)
    }
    try {
      const last = await client.execute({ sql: `SELECT MAX(captured_at) AS t FROM ${table}`, args: [] });
      base.lastCollectedAt = last.rows?.[0]?.t ?? null;
    } catch {
      /* banco sem a coluna captured_at — ignorado */
    }
    base.connected = true;
    return base;
  } catch (err) {
    base.error = err?.message ?? String(err);
    return base;
  } finally {
    if (client) {
      try {
        client.close();
      } catch {
        /* client já encerrado */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Token do Discord (teste ao vivo contra /users/@me)
// ---------------------------------------------------------------------------

function testTokenViaChild(token, rootDir) {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [path.join(rootDir, 'fleet', 'test-token.js'), token],
      { timeout: TOKEN_TEST_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          if (error.killed || error.signal) {
            resolve({ ok: false, status: null, error: 'Tempo esgotado ao testar o token (rede lenta ou Cloudflare).' });
          } else {
            resolve({ ok: false, status: null, error: `Falha ao executar o testador: ${error.message}` });
          }
          return;
        }
        try {
          const line = stdout.trim().split('\n').pop();
          resolve(JSON.parse(line));
        } catch {
          resolve({ ok: false, status: null, error: 'Resposta ilegível do testador de token.' });
        }
      },
    );
  });
}

/** Valida um token de usuário contra a API (formato + teste ao vivo). */
async function checkToken({ token, rootDir }) {
  const result = { present: Boolean(token), formatOk: false, valid: false, status: null, user: null, error: null };
  if (!token) {
    result.error = 'Nenhum token configurado (scraper/.env ou fleet/accounts.json).';
    return result;
  }
  if (!TOKEN_FORMAT.test(token)) {
    result.error = 'Formato de token inválido.';
    return result;
  }
  result.formatOk = true;

  const tested = await testTokenViaChild(token, rootDir);
  result.status = tested.status ?? null;
  result.user = tested.user ?? null;
  result.valid = Boolean(tested.ok);
  result.error = tested.error ?? null;
  return result;
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

/**
 * Roda o diagnóstico completo.
 * @param {object} opts
 * @param {{tursoUrl: string, tursoAuthToken: string, tursoTable: string,
 *          scraperToken: string, fleetAccounts: Array}} opts.config
 * @param {string} opts.rootDir Raiz do repositório
 */
async function runDiagnostics({ config, rootDir }) {
  const [license, database, token] = await Promise.all([
    checkLicense({ rootDir }),
    checkDatabase({ url: config.tursoUrl, authToken: config.tursoAuthToken, table: config.tursoTable }),
    checkToken({ token: config.scraperToken || config.fleetAccounts[0]?.token?.trim() || '', rootDir }),
  ]);

  const problems = [];
  if (!nodeOk()) problems.push('node');
  if (license.enforce && !license.valid) problems.push('license');
  if (database.configured && !database.connected) problems.push('database');
  if (token.present && !token.valid) problems.push('token');

  return {
    ok: problems.length === 0,
    problems,
    version: readVersion(rootDir),
    node: process.versions.node,
    nodeOk: nodeOk(),
    platform: `${process.platform} ${process.arch}`,
    checkedAt: new Date().toISOString(),
    license,
    database,
    token,
    fleet: {
      configured: config.fleetAccounts.length > 0,
      accounts: config.fleetAccounts.length,
      withToken: config.fleetAccounts.filter(a => Boolean(a.token?.trim())).length,
    },
    scraperTokenPresent: Boolean(config.scraperToken),
  };
}

module.exports = {
  readVersion,
  readEnvConfig,
  nodeOk,
  checkLicense,
  checkDatabase,
  checkToken,
  runDiagnostics,
};
