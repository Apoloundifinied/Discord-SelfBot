#!/usr/bin/env node
'use strict';

/**
 * VOID — launcher único do produto.
 *
 * O cliente instala o pacote e roda UM comando:
 *   npm install && node void.js        (ou: void, se instalado globalmente)
 *
 * Ele:
 *   1. Valida a versão do Node e a existência do dashboard/.env.local.
 *   2. Garante o build de produção do dashboard (next build na 1ª execução).
 *   3. Sobe o painel (next start) e, se a fleet estiver configurada, a fleet.
 *   4. Abre o navegador no painel.
 *
 * MODO CLIENTE x MODO DONO: se licenses/private.pem.enc NÃO existir, esta é
 * uma instalação de cliente — o launcher força LICENSE_ENFORCE=true (a tela de
 * desbloqueio aparece) e o campo de administração de licenças não existe.
 * Na máquina do dono (com o cofre), o bloqueio fica desligado por padrão.
 *
 * Flags: --port=3000 · --no-fleet · --no-open · --host=127.0.0.1
 */

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const ROOT = __dirname;
const DASH = path.join(ROOT, 'dashboard');
const NEXT_BIN = path.join(DASH, 'node_modules', 'next', 'dist', 'bin', 'next');
const PRIVATE_ENC = path.join(ROOT, 'licenses', 'private.pem.enc');
const DASH_ENV = path.join(DASH, '.env.local');

const children = [];

function log(msg) {
  console.log(`[void] ${msg}`);
}

function fail(msg) {
  console.error(`[void] ERRO: ${msg}`);
  // Nunca deixar filhos órfãos (dashboard/fleet) ao falhar depois do spawn.
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      /* já encerrado */
    }
  }
  process.exit(1);
}

function parseFlags() {
  const flags = { port: 3000, host: '127.0.0.1', fleet: true, open: true };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = /^--([^=]+)=(.*)$/.exec(arg);
    if (eq) {
      const [, k, v] = eq;
      if (k === 'port') flags.port = Number(v);
      else if (k === 'host') flags.host = v;
      continue;
    }
    if (arg === '--port' && argv[i + 1] && !argv[i + 1].startsWith('--')) flags.port = Number(argv[++i]);
    else if (arg === '--host' && argv[i + 1] && !argv[i + 1].startsWith('--')) flags.host = argv[++i];
    else if (arg === '--no-fleet') flags.fleet = false;
    else if (arg === '--no-open') flags.open = false;
  }
  return flags;
}

function checkNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 20 || (major === 20 && minor < 18)) {
    fail(`Node.js >= 20.18 é necessário (você está em ${process.versions.node}).`);
  }
}

function checkPrereqs() {
  if (!fs.existsSync(DASH_ENV)) {
    // Modo portátil/zero-config: em vez de travar, cria o .env.local a partir
    // do exemplo (valores vazios) — o assistente de onboarding configura o
    // banco e o token dentro do painel. A senha local é gerada logo abaixo.
    const example = path.join(DASH, '.env.local.example');
    try {
      if (fs.existsSync(example)) {
        fs.copyFileSync(example, DASH_ENV);
        log('dashboard/.env.local não existia — criado a partir do exemplo. Configure banco e token pelo assistente do painel.');
      } else {
        fs.writeFileSync(DASH_ENV, '# Gerado pelo launcher — configure pelo painel (onboarding).\nDASHBOARD_PASSWORD=\n');
        log('dashboard/.env.local não existia — criado vazio. Configure banco e token pelo assistente do painel.');
      }
    } catch (err) {
      fail(`Não foi possível criar dashboard/.env.local: ${err.message}`);
    }
  }
  if (!fs.existsSync(path.join(ROOT, 'licenses', 'public.pem'))) {
    fail('licenses/public.pem não existe — este build não tem chave pública de licença.');
  }
}

// Em produção (next start) o proxy do painel exige DASHBOARD_PASSWORD.
// O launcher garante uma: da env, do .env.local, ou gera e persiste uma nova.
function ensureDashboardPassword() {
  const fromEnv = process.env.DASHBOARD_PASSWORD;
  if (fromEnv) return { password: fromEnv, generated: false };
  const content = fs.existsSync(DASH_ENV) ? fs.readFileSync(DASH_ENV, 'utf8') : '';
  const m = /^DASHBOARD_PASSWORD=(.*)$/m.exec(content);
  if (m && m[1].trim()) return { password: m[1].trim(), generated: false };

  const password = crypto.randomBytes(12).toString('hex');
  // Substitui a linha existente (mesmo que vazia) em vez de duplicar.
  if (/^DASHBOARD_PASSWORD=.*$/m.test(content)) {
    const updated = content.replace(/^DASHBOARD_PASSWORD=.*$/m, `DASHBOARD_PASSWORD=${password}`);
    fs.writeFileSync(DASH_ENV, updated);
  } else {
    const sep = content.length && !content.endsWith('\n') ? '\n' : '';
    fs.appendFileSync(DASH_ENV, `${sep}# Gerada automaticamente pelo launcher — protege o painel local.\nDASHBOARD_PASSWORD=${password}\n`);
  }
  return { password, generated: true };
}

function basicAuthHeader(password) {
  return `Basic ${Buffer.from(`void:${password}`).toString('base64')}`;
}

function portFree(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function findFreePort(start) {
  for (let port = start; port < start + 15; port++) {
    if (await portFree(port)) return port;
  }
  return null;
}

function run(command, args, opts = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: opts.silent ? 'ignore' : 'inherit', ...opts.spawn });
    // 'error' (ex.: binário ausente) também precisa resolver — senão o launcher trava.
    child.on('error', () => resolve(1));
    child.on('close', code => resolve(code));
  });
}

async function ensureBuild() {
  const buildId = path.join(DASH, '.next', 'BUILD_ID');
  if (fs.existsSync(buildId)) return;
  log('primeira execução — compilando o painel (pode levar ~1 min)…');
  const code = await run(process.execPath, [NEXT_BIN, 'build'], { spawn: { cwd: DASH } });
  if (code !== 0) fail('Falha no build do dashboard.');
}

function waitFor(url, ms, password) {
  const deadline = Date.now() + ms;
  const headers = password ? { authorization: basicAuthHeader(password) } : {};
  return new Promise(resolve => {
    const poll = async () => {
      if (Date.now() > deadline) return resolve(false);
      try {
        const res = await fetch(url, { headers });
        if (res.ok) return resolve(true);
      } catch {
        /* ainda subindo */
      }
      setTimeout(poll, 700);
    };
    poll();
  });
}

function openBrowser(url) {
  const platform = process.platform;
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
  } else if (platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
  } else {
    spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  }
}

function shutdown(code = 0) {
  log('encerrando processos filhos…');
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      /* já encerrado */
    }
  }
  setTimeout(() => process.exit(code), 400);
}

async function main() {
  const flags = parseFlags();
  checkNode();
  checkPrereqs();

  // Modo cliente: sem cofre do dono -> bloqueio de licença OBRIGATÓRIO.
  const clientMode = !fs.existsSync(PRIVATE_ENC);
  const env = { ...process.env };
  if (clientMode && process.env.LICENSE_ENFORCE === undefined) env.LICENSE_ENFORCE = 'true';

  // Senha do painel local (Basic Auth do proxy em produção).
  // MODO CLIENTE: SEM senha — o portão da instalação é a LICENÇA (tela de
  // desbloqueio). O navegador abre na raiz direto, sem login. A senha só
  // existe no modo dono, e o launcher a passa na URL — nem o dono vê a tela
  // de login pelo fluxo normal.
  const dashPassword = clientMode ? { password: '', generated: false } : ensureDashboardPassword();
  // Em cliente, forçar vazio também sobrescreve qualquer DASHBOARD_PASSWORD
  // que um launcher antigo tenha persistido no .env.local (o Next não
  // sobrescreve env já definida no processo).
  env.DASHBOARD_PASSWORD = dashPassword.password;
  if (dashPassword.generated) log(`senha local do painel gerada e salva em dashboard/.env.local (${dashPassword.password})`);

  log('───────────────');
  log('   H U G G I N G');
  log('   console de inteligência · discord');
  log('───────────────');
  log(clientMode ? 'modo cliente · bloqueio de licença ativo' : 'modo dono · administração de licenças disponível');

  await ensureBuild();

  const port = (await findFreePort(flags.port)) ?? fail('Nenhuma porta livre entre 3000 e 3014.');
  const url = `http://${flags.host}:${port}`;

  log(`subindo o painel em ${url}…`);
  const dash = spawn(process.execPath, [NEXT_BIN, 'start', '-H', flags.host, '-p', String(port)], {
    cwd: DASH,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  children.push(dash);

  const ready = await waitFor(`${url}/api/license/status`, 60000, dashPassword.password);
  if (!ready) fail('O painel não respondeu a tempo.');

  if (flags.fleet) {
    const fleetEnvPath = path.join(ROOT, 'fleet', '.env');
    const accountsPath = path.join(ROOT, 'fleet', 'accounts.json');
    // A fleet só sobe quando o banco JÁ está configurado e há ao menos uma
    // conta com token. Se os arquivos existirem mas vazios (ex.: pasta antiga
    // ou onboarding ainda não concluído), a fleet quebraria no require do
    // cliente de banco e entraria em loop de restart — feio para o cliente.
    if (fs.existsSync(fleetEnvPath) && fs.existsSync(accountsPath)) {
      const fleetEnv = fs.readFileSync(fleetEnvPath, 'utf8');
      // Mesmo critério do fleet/config.js: URL presente E (local OU token).
      const urlMatch = /^TURSO_DATABASE_URL=(.+)$/m.exec(fleetEnv);
      const url = urlMatch?.[1]?.trim();
      const tokenMatch = /^TURSO_AUTH_TOKEN=(.+)$/m.exec(fleetEnv);
      const dbConfigured = Boolean(url && (url.startsWith('file:') || tokenMatch?.[1]?.trim()));
      let hasAccount = false;
      try {
        const parsed = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
        hasAccount = Array.isArray(parsed) && parsed.some(a => a && a.label && a.token);
      } catch {
        /* accounts.json inválido — trata como não configurado */
      }
      if (dbConfigured && hasAccount) {
        log('subindo a fleet (mensagens em tempo real)…');
        const fleet = spawn(process.execPath, [path.join(ROOT, 'fleet', 'manager.js')], {
          cwd: ROOT,
          env,
          stdio: ['ignore', 'inherit', 'inherit'],
        });
        children.push(fleet);
      } else {
        log('fleet aguardando configuração (banco e/ou contas pendentes — configure pelo painel). Pulando por enquanto.');
      }
    } else {
      log('fleet não configurada (faltam fleet/.env ou fleet/accounts.json) — pulando.');
    }
  }

  if (flags.open) {
    if (clientMode) {
      // Cliente: sem senha — abre a RAÍZ. A tela de desbloqueio da licença
      // (Machine ID + chave DCX1) é o primeiro portão, como deve ser.
      openBrowser(url);
    } else {
      // Dono: troca a senha por um cookie httpOnly e cai na raiz SEM
      // credenciais. Abrir a raiz direto com `void:senha@` quebraria TODAS as
      // fetches do app (o navegador recusa Request com credenciais na URL).
      const creds = `void:${encodeURIComponent(dashPassword.password)}`;
      openBrowser(`${url.replace('://', `://${creds}@`)}/api/auth/login`);
    }
  }

  log('tudo no ar. Ctrl+C para encerrar.');
  if (clientMode) {
    log('esta instalação está bloqueada por licença — cole a chave recebida na tela de desbloqueio.');
  }
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main();
