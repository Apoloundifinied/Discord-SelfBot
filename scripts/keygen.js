'use strict';

/**
 * KEYGEN — geração de chave guiada (CLI do dono).
 *
 * O fluxo diário do vendedor em um comando só:
 *   npm run key
 *     → cola o email do cliente
 *     → dias (Enter = 30)
 *     → cola o Machine ID que o cliente mandou (Enter = chave livre)
 *     → imprime o card com a chave DCX1 pronta para enviar.
 *
 * Sem interação (scripts):
 *   npm run key -- --email cliente@x --days 30 --machine <id>
 *   npm run key -- --email cliente@x --days 30 --no-bind
 *
 * A senha-mestra vem de LICENSE_MASTER_PASSPHRASE (env) > dashboard/.env.local
 * > prompt oculto. Nunca é gravada.
 *
 * --licenses-dir é um hook de teste/avançado (sandbox do cofre); o padrão é a
 * pasta licenses/ do projeto.
 */

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn, spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const { banner, keyCard, hint, gold, green, dim, red } = require('./hugging-cli');

const ROOT = path.resolve(__dirname, '..');
const DASH_ENV = path.join(ROOT, 'dashboard', '.env.local');

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = /^--([^=]+)=(.*)$/.exec(arg);
    if (eq) {
      const [, k, v] = eq;
      out[k] = v === 'true' || v === '1' ? true : v;
      continue;
    }
    const flag = /^--([^=]+)$/.exec(arg);
    if (flag && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      out[flag[1]] = argv[++i];
    } else if (flag) {
      out[flag[1]] = true;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Senha-mestra
// ---------------------------------------------------------------------------

function loadPassphrase() {
  const fromEnv = (process.env.LICENSE_MASTER_PASSPHRASE || '').trim();
  if (fromEnv) return fromEnv;
  if (fs.existsSync(DASH_ENV)) {
    const parsed = dotenv.parse(fs.readFileSync(DASH_ENV, 'utf8'));
    const fromFile = (parsed.LICENSE_MASTER_PASSPHRASE || '').trim();
    if (fromFile) {
      process.env.LICENSE_MASTER_PASSPHRASE = fromFile;
      return fromFile;
    }
  }
  return null;
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

function prompt(question, { fallback = null } = {}) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim() || fallback);
    });
  });
}

// ---------------------------------------------------------------------------
// Studio (modo admin: JSON no stdout)
// ---------------------------------------------------------------------------

function runStudio(studio, action, args) {
  const res = spawnSync(process.execPath, [studio, 'admin', `--action=${action}`, ...args], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  if (res.error) throw new Error(`Não foi possível executar o studio: ${res.error.message}`);
  let parsed;
  try {
    parsed = JSON.parse(res.stdout.toString('utf8').trim().split('\n').pop());
  } catch {
    const errLine = res.stderr.toString('utf8').trim().split('\n').pop();
    throw new Error(errLine || 'Resposta inesperada do studio.');
  }
  if (!parsed.ok) throw new Error(parsed.error || 'Falha na operação do studio.');
  return parsed;
}

/** Confirma que a senha abre o cofre antes de qualquer emissão. */
function checkPassphrase(studio, passphrase) {
  process.env.LICENSE_MASTER_PASSPHRASE = passphrase;
  const res = runStudio(studio, 'list', []);
  // list devolve { ok, count, keys } — qualquer resposta ok já validou o cofre.
  if (typeof res.count !== 'number') throw new Error('Resposta inesperada do studio.');
  return res;
}

function validateDays(raw) {
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return null;
  return days;
}

// ---------------------------------------------------------------------------
// Área de transferência (Windows — melhor esforço, nunca falha o fluxo)
// ---------------------------------------------------------------------------

function copyToClipboard(text) {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve(false);
    try {
      const child = spawn('clip', [], { stdio: ['pipe', 'ignore', 'ignore'] });
      child.on('error', () => resolve(false));
      child.on('close', () => resolve(true));
      child.stdin.on('error', () => resolve(false));
      child.stdin.write(text);
      child.stdin.end();
    } catch {
      resolve(false);
    }
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const f = parseFlags(process.argv.slice(2));
  const interactive = process.stdin.isTTY;
  const studio = path.join(typeof f['licenses-dir'] === 'string' && f['licenses-dir'] ? f['licenses-dir'] : path.join(ROOT, 'licenses'), 'studio.js');

  console.log(banner('console do dono · geração de chaves DCX1'));
  console.log('');

  // --- 1. Senha-mestra ---
  let passphrase = loadPassphrase();
  if (!passphrase && !interactive) {
    console.error(red('[key] ERRO: LICENSE_MASTER_PASSPHRASE não definida (nem em dashboard/.env.local) e sem terminal interativo.'));
    process.exitCode = 1;
    return;
  }
  if (!passphrase) passphrase = await promptHidden('Senha-mestra do cofre: ');
  if (!passphrase) {
    console.error(red('[key] ERRO: senha-mestra vazia não é permitida.'));
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(studio)) {
    console.error(red(`[key] ERRO: studio.js não encontrado em ${path.relative(ROOT, studio)}. Rode na raiz do projeto.`));
    process.exitCode = 1;
    return;
  }
  try {
    checkPassphrase(studio, passphrase);
  } catch (err) {
    console.error(red(`[key] ERRO: ${err.message}`));
    process.exitCode = 1;
    return;
  }
  console.log(dim('  cofre desbloqueado ✓'));

  // --- 2. Dados do cliente ---
  let email = typeof f.email === 'string' && f.email ? f.email : null;
  if (!email && interactive) email = await prompt('Email/ID do cliente: ');
  if (!email) {
    console.error(red('[key] ERRO: email/ID do cliente é obrigatório (--email ou digite).'));
    process.exitCode = 1;
    return;
  }

  let days = validateDays(f.days);
  if (!days && interactive) {
    const raw = await prompt('Dias de licença (Enter = 30): ', { fallback: '30' });
    days = validateDays(raw);
  }
  if (!days) {
    console.error(red('[key] ERRO: dias inválido (inteiro entre 1 e 3650).'));
    process.exitCode = 1;
    return;
  }

  // Vínculo: --machine <id-do-cliente> (remoto) · --bind (máquina atual) ·
  // --no-bind ou Enter (livre). Mesma regra do sell.js — nunca vincular à
  // máquina do VENDEDOR sem querer.
  // --bind pode vir como boolean true ou string 'true'/'1'.
  const explicitBind = f.bind === true || f.bind === 'true' || f.bind === '1';
  const noBind = f['no-bind'] === true;
  let machine = typeof f.machine === 'string' && f.machine ? f.machine : null;
  let bind = explicitBind;
  if (!machine && !explicitBind && !noBind && interactive) {
    const raw = await prompt(
      'Máquina do cliente? [Enter = chave livre · cole o Machine ID que ele te mandou · "atual" = só neste PC]: ',
      { fallback: 'livre' },
    );
    if (raw && raw.toLowerCase() === 'atual') bind = true;
    else if (raw && raw.toLowerCase() !== 'livre') machine = raw;
  }

  // --- 3. Emite ---
  const args = [`--sub=${email}`, `--days=${days}`];
  if (machine) args.push(`--machine=${machine}`);
  else if (bind) args.push('--bind');

  let license;
  try {
    license = runStudio(studio, 'create', args);
  } catch (err) {
    console.error(red(`[key] ERRO: ${err.message}`));
    process.exitCode = 1;
    return;
  }

  // --- 4. Card de entrega ---
  const bound = machine || bind;
  console.log(keyCard({
    id: license.id,
    subject: license.subject,
    expiresAt: new Date(license.expiresAt).toLocaleString('pt-BR'),
    machine: bound ? (machine || 'máquina atual') : 'livre (qualquer máquina)',
  }));
  console.log('');
  console.log(gold('╔═ CHAVE — envie ao cliente por WhatsApp/e-mail ═╗'));
  console.log(gold(`  ${license.key}`));
  console.log(gold('╚══════════════════════════════════════════════╝'));
  console.log('');
  console.log(hint('A chave fica registrada no cofre (list) — se precisar, use `npm run keys`.'));

  // --- 5. Copiar (opcional) ---
  const wantCopy = f.copy === true || f.copy === 'true' || f.copy === '1';
  if (!wantCopy && interactive) {
    const raw = await prompt('Copiar a chave para a área de transferência? [s/N]: ', { fallback: 'n' });
    if (raw.toLowerCase() === 's' || raw.toLowerCase() === 'sim') {
      if (await copyToClipboard(license.key)) console.log(green('  ✓ chave copiada — cole no chat do cliente.'));
      else console.log(hint('não foi possível copiar — copie manualmente.'));
    }
  } else if (wantCopy) {
    if (await copyToClipboard(license.key)) console.log(green('  ✓ chave copiada para a área de transferência.'));
    else console.log(hint('não foi possível copiar — copie manualmente.'));
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(red(`[key] ERRO: ${err.message}`));
    process.exitCode = 1;
  });
}

module.exports = { parseFlags, loadPassphrase, checkPassphrase, runStudio, validateDays, copyToClipboard };
