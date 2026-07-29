'use strict';

/**
 * Processo "pai" da fleet: substitui o papel do servidor (VPS) no diagrama
 * original, mas rodando localmente na própria máquina.
 *
 * Cada "instância" do diagrama vira um child process (fleet/instance.js)
 * criado via `fork`. O manager:
 * - Lê fleet/accounts.json (label + token de cada conta)
 * - Sobe um processo filho por conta e envia o token via IPC (nunca por env/argv)
 * - Acompanha o status de cada instância (ready, joined, listening, warning, ...)
 * - Reinicia instâncias que caírem por erro (até um limite), mas NUNCA reinicia
 *   uma conta marcada como banida/bloqueada (exit code 2) ou que precise de
 *   entrada manual (exit code 3)
 * - Ao encerrar (Ctrl+C ou SIGTERM), pede um shutdown gracioso para todas as
 *   instâncias e, se alguma não responder a tempo, força o encerramento com tree-kill
 *
 * Pode ser usado de duas formas, sem nenhuma diferença de comportamento entre elas:
 * - Standalone via CLI: `npm run fleet` (não há processo pai, controle só por sinais OS).
 * - Controlado pelo dashboard: iniciado via `fork()` a partir de dashboard/lib, que pode
 *   enviar comandos por IPC ('add-account' / 'remove-account') e recebe de volta um
 *   snapshot de status ('fleet-status') sempre que algo muda.
 *
 * Não existe mais um "servidor de exibição" separado: o console deste processo (ou o
 * painel do dashboard, quando controlado por ele) mostra o status, e a tabela
 * discord_messages no Supabase é o armazenamento final dos dados coletados.
 */

const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const treeKill = require('tree-kill');
const config = require('./config');
const { createLogger } = require('../shared/logger');

const log = createLogger('fleet');
const SHUTDOWN_GRACE_MS = 5000;
const DASHBOARD_INTERVAL_MS = 30000;

/** Estado de todas as instâncias, indexado por label. */
const fleet = new Map();
let shuttingDown = false;

/** Envia um snapshot do status atual para o processo pai, se houver um (dashboard). */
function reportStatus() {
  if (!process.send) return;
  process.send({
    type: 'fleet-status',
    accounts: [...fleet.values()].map(entry => ({
      label: entry.label,
      status: entry.status,
      restarts: entry.restarts,
    })),
  });
}

function loadAccounts() {
  if (!fs.existsSync(config.accountsFile)) {
    log.error(`Arquivo de contas não encontrado: ${config.accountsFile}`);
    log.info('Copie fleet/accounts.example.json para fleet/accounts.json e preencha os tokens.');
    log.info('Dica: use "npm run get-token" para obter cada token via QR code com segurança.');
    return [];
  }

  const raw = JSON.parse(fs.readFileSync(config.accountsFile, 'utf8'));
  return Array.isArray(raw) ? raw : [];
}

function createInstance(account) {
  const child = fork(path.join(__dirname, 'instance.js'));
  const entry = {
    label: account.label,
    token: account.token,
    child,
    status: 'starting',
    restarts: fleet.get(account.label)?.restarts ?? 0,
    dead: false,
  };
  fleet.set(account.label, entry);

  child.on('message', msg => onInstanceMessage(entry, msg));
  child.on('exit', code => onInstanceExit(entry, code));

  child.send({ type: 'init', token: account.token, label: account.label });
  reportStatus();

  return entry;
}

function onInstanceMessage(entry, msg) {
  if (!msg || !msg.type) return;
  entry.status = msg.type;

  const extra = Object.entries(msg)
    .filter(([key]) => !['type', 'label'].includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  const line = `[${entry.label}] ${msg.type}${extra ? ` (${extra})` : ''}`;

  if (msg.type === 'banned' || msg.type === 'crashed') {
    log.error(line);
  } else if (msg.type === 'warning') {
    log.warn(line);
  } else if (msg.type === 'listening' || msg.type === 'joined') {
    log.success(line);
  } else {
    log.info(line);
  }

  reportStatus();
}

function onInstanceExit(entry, code) {
  if (shuttingDown) return;

  if (code === 2) {
    entry.status = 'banned';
    entry.dead = true;
    log.error(`[${entry.label}] conta marcada como banida/bloqueada. Removida da fleet.`);
    reportStatus();
    return;
  }

  if (code === 3) {
    entry.status = 'needs-manual-join';
    entry.dead = true;
    log.error(
      `[${entry.label}] o Discord pediu captcha para entrar no servidor via convite. ` +
        'Entre no servidor MANUALMENTE uma vez com esta conta (app oficial do Discord) e rode "npm run fleet" de novo ' +
        '— depois de já ser membro, a instância não precisa mais aceitar o convite, só escuta as mensagens.',
    );
    reportStatus();
    return;
  }

  if (code === 0) {
    entry.status = 'stopped';
    reportStatus();
    return;
  }

  entry.restarts += 1;
  if (entry.restarts > config.maxRestartsPerAccount) {
    entry.status = 'gave-up';
    entry.dead = true;
    log.error(`[${entry.label}] excedeu o limite de ${config.maxRestartsPerAccount} reinícios. Desistindo desta conta.`);
    reportStatus();
    return;
  }

  entry.status = 'restarting';
  log.warn(
    `[${entry.label}] processo encerrou com código ${code}. ` +
      `Reiniciando em ${config.restartDelayMs}ms (tentativa ${entry.restarts}/${config.maxRestartsPerAccount})...`,
  );
  reportStatus();
  setTimeout(() => {
    if (!shuttingDown) createInstance({ label: entry.label, token: entry.token });
  }, config.restartDelayMs);
}

function printDashboard() {
  const lines = [...fleet.values()].map(entry => `  - ${entry.label}: ${entry.status}`);
  log.info(`status da fleet (${fleet.size} conta(s)):\n${lines.join('\n')}`);
}

/** Adiciona uma conta em tempo de execução (comando 'add-account' via IPC), sem afetar as demais. */
function addAccount(account) {
  if (!account?.label || !account?.token) return;
  if (fleet.has(account.label) && !fleet.get(account.label).dead) {
    log.warn(`[${account.label}] já está rodando, ignorando pedido de adição duplicado.`);
    return;
  }
  log.info(`[${account.label}] adicionando nova instância...`);
  createInstance(account);
}

/** Remove uma conta em tempo de execução (comando 'remove-account' via IPC). */
function removeAccount(label) {
  const entry = fleet.get(label);
  if (!entry) return;

  entry.dead = true;
  fleet.delete(label);
  log.info(`[${label}] removendo instância...`);

  if (entry.child.connected) entry.child.send({ type: 'shutdown' });
  setTimeout(() => {
    if (entry.child.exitCode === null && entry.child.pid) treeKill(entry.child.pid);
  }, SHUTDOWN_GRACE_MS);

  reportStatus();
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  log.info('Encerrando fleet... enviando shutdown gracioso para todas as instâncias.');

  const alive = [...fleet.values()].filter(entry => !entry.dead && entry.child.connected);
  alive.forEach(entry => entry.child.send({ type: 'shutdown' }));

  await new Promise(resolve => setTimeout(resolve, SHUTDOWN_GRACE_MS));

  for (const entry of alive) {
    if (entry.child.exitCode === null && entry.child.pid) {
      log.warn(`[${entry.label}] não encerrou a tempo, forçando kill (tree-kill).`);
      treeKill(entry.child.pid);
    }
  }

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Comandos de controle recebidos via IPC (só chegam quando iniciado por `fork()`,
// ex.: pelo dashboard). Em uso standalone via CLI, `process.send` é undefined e
// nenhuma mensagem chega aqui — o comportamento não muda.
process.on('message', msg => {
  if (msg?.type === 'add-account') addAccount(msg.account);
  else if (msg?.type === 'remove-account') removeAccount(msg.label);
  else if (msg?.type === 'shutdown') shutdown();
});

function main() {
  const accounts = loadAccounts();
  log.info(`Iniciando ${accounts.length} instância(s)...`);

  accounts.forEach(account => createInstance(account));

  setInterval(printDashboard, DASHBOARD_INTERVAL_MS);
}

main();
