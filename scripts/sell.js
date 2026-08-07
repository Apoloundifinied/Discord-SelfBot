'use strict';

/**
 * SELL — venda guiada: empacota o cliente portátil e emite a chave de licença
 * num fluxo só. O que o comprador recebe é o ZIP (dist/void-client-vX-win-x64.zip)
 * + a chave impressa aqui. Nada além disso.
 *
 * Uso:
 *   npm run sell                                  # fluxo guiado (pede email/dias/máquina)
 *   npm run sell -- --email cliente@x --days 30   # valores via flags (pula prompts)
 *   npm run sell -- --machine <id>                # vincula à máquina do cliente (venda remota)
 *   npm run sell -- --no-bind                     # chave livre (qualquer máquina)
 *
 * Vínculo de máquina (padrão = LIVRE, o mais seguro): o --bind grava o Machine
 * ID de quem executa o studio — o vendedor — então "máquina atual" NÃO funciona
 * no PC do cliente em venda remota. Use:
 *   --machine <id-do-cliente>  → chave amarrada ao PC do cliente (venda remota)
 *   --bind                     → máquina atual (venda presencial, instala você)
 *   --no-bind (padrão)         → chave livre
 * A senha-mestra vem de LICENSE_MASTER_PASSPHRASE ou é pedida interativamente
 * (nunca gravada) e é validada ANTES do empacotamento.
 */

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const { flags } = require('./package-client');

const ROOT = __dirname.replace(/\\/g, '/').replace(/\/scripts$/, '');
const PKG = require(path.join(ROOT, 'package.json'));
const VERSION = PKG.version;
const ZIP_PATH = path.join(ROOT, 'dist', `void-client-v${VERSION}-win-x64.zip`);
const PACKAGE_CLIENT = path.join(ROOT, 'scripts', 'package-client.js');
const STUDIO = path.join(ROOT, 'licenses', 'studio.js');
const DASH_ENV = path.join(ROOT, 'dashboard', '.env.local');

/**
 * Senha-mestra na ordem: env (LICENSE_MASTER_PASSPHRASE) > dashboard/.env.local
 * > prompt oculto. O .env.local é o mesmo que o README manda configurar para
 * liberar a aba de administração do painel — nada de digitar senha invisível.
 */
function loadPassphrase() {
  const fromEnv = (process.env.LICENSE_MASTER_PASSPHRASE || '').trim();
  if (fromEnv) return fromEnv;
  if (fs.existsSync(DASH_ENV)) {
    const parsed = dotenv.parse(fs.readFileSync(DASH_ENV, 'utf8'));
    const fromFile = (parsed.LICENSE_MASTER_PASSPHRASE || '').trim();
    if (fromFile) {
      // Também vai para o env real, para o subprocesso do studio herdar.
      process.env.LICENSE_MASTER_PASSPHRASE = fromFile;
      return fromFile;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Prompts (TTY)
// ---------------------------------------------------------------------------

function prompt(question, { fallback = null } = {}) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim() || fallback);
    });
  });
}

function promptHidden(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const original = rl._writeToOutput.bind(rl);
    let promptShown = false;
    rl._writeToOutput = str => {
      if (!promptShown) {
        promptShown = true;
        original(str);
      }
    };
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Passos
// ---------------------------------------------------------------------------

function log(msg = '') {
  console.log(`[sell] ${msg}`);
}

function fail(msg) {
  console.error(`[sell] ERRO: ${msg}`);
  process.exitCode = 1;
}

/** Passo 1 — empacota o cliente portátil (mesmo comando de package:portable). */
function packagePortable() {
  log(`Empacotando cliente portátil (pode levar alguns minutos)…`);
  const res = spawnSync(process.execPath, [PACKAGE_CLIENT, '--portable'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (res.status !== 0) {
    fail('Empacotamento falhou — nada foi emitido. Corrija o erro acima e rode de novo.');
    return false;
  }
  if (!fs.existsSync(ZIP_PATH)) {
    fail(`ZIP não encontrado em ${path.relative(ROOT, ZIP_PATH)}.`);
    return false;
  }
  log(`ZIP pronto: ${path.relative(ROOT, ZIP_PATH)}`);
  return true;
}

/**
 * Passo 2 — emite a chave via modo admin (JSON no stdout), com a senha-mestra
 * passada por env (nunca aparece na linha de comando). Retorna o resumo.
 */
function createLicense({ subject, days, machine, bind, passphrase }) {
  if (!passphrase) throw new Error('Senha-mestra ausente.');

  const args = [STUDIO, 'admin', '--action', 'create', '--sub', subject, '--days', String(days)];
  if (machine) args.push('--machine', machine);
  else if (bind) args.push('--bind');

  const res = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LICENSE_MASTER_PASSPHRASE: passphrase },
  });
  if (res.error) throw new Error(`Não foi possível executar o studio: ${res.error.message}`);

  let parsed = null;
  try {
    parsed = JSON.parse(res.stdout.toString('utf8'));
  } catch {
    // stderr do studio tem o erro real quando o JSON falha (ex.: senha errada).
    const errLine = res.stderr.toString('utf8').trim().split('\n').pop();
    throw new Error(errLine || 'Resposta inesperada do studio.');
  }
  if (!parsed.ok) throw new Error(parsed.error || 'Falha ao emitir a chave.');
  return parsed;
}

/** Confirma que a senha-mestra abre o cofre (barato — evita empacotar em vão). */
function checkPassphrase(passphrase) {
  if (!passphrase) throw new Error('Senha-mestra ausente.');
  // list desbloqueia o cofre (unlock) e o banco de chaves — senha errada falha.
  const res = spawnSync(process.execPath, [STUDIO, 'admin', '--action', 'list'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LICENSE_MASTER_PASSPHRASE: passphrase },
  });
  if (res.error) throw new Error(`Não foi possível executar o studio: ${res.error.message}`);
  let parsed = null;
  try {
    parsed = JSON.parse(res.stdout.toString('utf8'));
  } catch {
    throw new Error(res.stderr.toString('utf8').trim().split('\n').pop() || 'Falha ao validar a senha-mestra.');
  }
  if (!parsed.ok) throw new Error(parsed.error || 'Senha-mestra inválida.');
  if (!parsed.count && parsed.keys === undefined) {
    throw new Error('Resposta inesperada do studio.');
  }
  return true;
}

function validateDays(raw) {
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return null;
  return days;
}

/** Imprime o bloco de entrega: ZIP + chave. */
function printDelivery(license, { machine, bind }) {
  const bound = machine || bind;
  const mb = (fs.statSync(ZIP_PATH).size / 1024 / 1024).toFixed(1);
  log('');
  log('══════════════════════ ENTREGA AO CLIENTE ══════════════════════');
  log(`  ZIP  : ${path.relative(ROOT, ZIP_PATH)} (${mb} MB)`);
  log(`  chave: ${license.id} · ${license.subject} · expira ${new Date(license.expiresAt).toLocaleString('pt-BR')}`);
  log(`  máquina: ${bound ? (machine || 'atual') : 'livre (qualquer máquina)'}`);
  log('');
  log('  ╔═ CHAVE — envie junto com o ZIP ═╗');
  log(`  ${license.key}`);
  log('  ╚═════════════════════════════════════╝');
  log('');
  log('  Instruções: o cliente descompacta o ZIP, dá dois cliques em VOID.bat');
  log('  e cola esta chave na tela de desbloqueio.');
  log('═════════════════════════════════════════════════════════════════');
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

async function main() {
  const f = flags();
  const interactive = process.stdin.isTTY;

  // --- 1. Senha-mestra: env > dashboard/.env.local > prompt. Validada ANTES
  // do empacotamento, para não rodar o build de minutos e só então descobrir
  // que está errada. ---
  let passphrase = loadPassphrase();
  if (!passphrase && !interactive) {
    return fail('LICENSE_MASTER_PASSPHRASE não definida (nem em dashboard/.env.local) e sem terminal interativo.');
  }
  if (!passphrase) passphrase = await promptHidden('Senha-mestra do cofre: ');
  if (!passphrase) return fail('Senha-mestra vazia não é permitida.');
  try {
    checkPassphrase(passphrase);
  } catch (err) {
    return fail(err.message);
  }

  // --- 2. Coleta de dados do cliente (flags ou prompts) ---
  let email = typeof f.email === 'string' && f.email ? f.email : null;
  if (!email && interactive) email = await prompt('Email/ID do cliente: ');
  if (!email) return fail('Email/ID do cliente é obrigatório (--email ou digite).');

  let days = validateDays(f.days);
  if (!days && interactive) {
    const raw = await prompt('Dias de licença (Enter = 30): ', { fallback: '30' });
    days = validateDays(raw);
  }
  if (!days) return fail('Dias inválido (inteiro entre 1 e 3650).');

  // Vínculo. Padrão SEGURO = livre: `--bind` grava o Machine ID de quem roda o
  // studio (o vendedor), então a chave "máquina atual" NÃO funciona no PC do
  // cliente em venda remota. Vinculação só por opção explícita:
  //   --machine <id-do-cliente>  → chave amarrada ao PC do cliente (venda remota)
  //   --bind                     → máquina atual (venda presencial, instala você)
  //   --no-bind / padrão         → chave livre
  const explicitBind = f.bind === true || f.bind === 'true' || f.bind === '1';
  const noBind = f['no-bind'] === true || f['no-bind'] === 'true' || f['no-bind'] === '1';
  let machine = typeof f.machine === 'string' && f.machine ? f.machine : null;
  let bindFromPrompt = false;
  if (!machine && !explicitBind && !noBind && interactive) {
    const raw = await prompt(
      'Vincular à máquina? [Enter = chave livre · cole o Machine ID do cliente (ele vê na tela de desbloqueio, botão copiar) · "atual" = só nesta máquina]: ',
      { fallback: 'livre' },
    );
    if (raw && raw.toLowerCase() === 'atual') bindFromPrompt = true;
    else if (raw && raw.toLowerCase() !== 'livre') machine = raw;
  }
  const bind = bindFromPrompt || explicitBind;

  // --- 3. Empacota ---
  if (!packagePortable()) return;

  // --- 4. Emite a chave ---
  try {
    const license = createLicense({
      subject: email,
      days,
      machine: machine || null,
      bind: bind && !machine && !noBind,
      passphrase,
    });
    printDelivery(license, { machine: machine || null, bind: bind && !machine && !noBind });
  } catch (err) {
    fail(err.message);
  }
}

if (require.main === module) {
  main().catch(err => fail(err.message));
}

module.exports = { loadPassphrase, validateDays, checkPassphrase, packagePortable, createLicense, printDelivery };

// `flags` vem do package-client (reuso — mesma semântica de flags da CLI).
