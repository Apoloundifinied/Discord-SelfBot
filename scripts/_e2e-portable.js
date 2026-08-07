'use strict';

/**
 * E2E do pacote portátil: descompacta o zip numa pasta limpa, sobe o launcher
 * com o node.exe embarcado e valida que o painel responde — inclusive com um
 * request autenticado (Basic Auth com a senha gerada) esperando 200 + JSON de
 * licença. Mata tudo no final.
 *
 * Uso: node scripts/_e2e-portable.js
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const BS_TAR = 'C:\\Windows\\System32\\tar.exe';
const PORT = 3999;

function fail(msg) {
  console.error(`[e2e] ERRO: ${msg}`);
  process.exit(1);
}

function step(msg) {
  console.log(`[e2e] ${msg}`);
}

function latestZip() {
  const dir = path.join(ROOT, 'dist');
  if (!fs.existsSync(dir)) return null;
  const zips = fs
    .readdirSync(dir)
    .filter(f => /^void-client-v[^-]+-win-x64\.zip$/.test(f))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return zips.length ? path.join(dir, zips[0].name) : null;
}

async function main() {
  const ZIP = latestZip();
  if (!ZIP) fail('nenhum zip void-client-v*-win-x64.zip em dist/ — rode npm run package:portable primeiro.');

  // 1. Descompactar em pasta limpa
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'void-e2e-'));
  step(`descompactando ${path.basename(ZIP)} em ${work}…`);
  const ex = spawnSync(BS_TAR, ['-xf', ZIP, '-C', work], { stdio: 'inherit' });
  if (ex.status !== 0) fail('falha ao descompactar');
  const app = path.join(work, 'void-client');

  // 2. Sanidade: node.exe embarcado existe e roda
  const nodeExe = path.join(app, 'node', 'node.exe');
  if (!fs.existsSync(nodeExe)) fail('node/node.exe ausente no pacote');
  const ver = spawnSync(nodeExe, ['--version'], { encoding: 'utf8' });
  step(`node embarcado: ${ver.stdout.trim()}`);

  // 3. .env.local NÃO deve existir antes (auto-create é o teste)
  const dashEnv = path.join(app, 'dashboard', '.env.local');
  if (fs.existsSync(dashEnv)) step('Aviso: .env.local já existia no pacote (esperado: ausente)');

  // 4. Subir o launcher com o node embarcado, sem abrir navegador
  step('subindo void.js (node embarcado, --no-open)…');
  const child = spawn(nodeExe, ['void.js', '--no-open', '--port', String(PORT)], {
    cwd: app,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LICENSE_ENFORCE: 'true' },
  });
  let log = '';
  child.stdout.on('data', d => (log += d));
  child.stderr.on('data', d => (log += d));

  // 5. Poll até o painel responder (proxy em pé = 401 sem auth)
  const deadline = Date.now() + 90000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/license/status`);
      if (res.status === 401 || res.status === 200) up = true;
    } catch {
      /* ainda subindo */
    }
    if (!up) await new Promise(r => setTimeout(r, 1500));
  }
  if (!up) {
    child.kill('SIGTERM');
    fail(`painel não subiu. Log:\n${log.slice(-3000)}`);
  }
  step('painel no ar (proxy respondendo)');

  // 6. Check FORTE: request autenticado com a senha gerada no .env.local
  const dashEnvNow = fs.readFileSync(dashEnv, 'utf8');
  const m = /^DASHBOARD_PASSWORD=(.*)$/m.exec(dashEnvNow);
  if (!m || !m[1].trim()) fail(`DASHBOARD_PASSWORD não foi gerada no .env.local:\n${dashEnvNow}`);
  const auth = `Basic ${Buffer.from(`void:${m[1].trim()}`).toString('base64')}`;
  const res = await fetch(`http://127.0.0.1:${PORT}/api/license/status`, { headers: { authorization: auth } });
  const raw = await res.text();
  if (res.status !== 200) {
    child.kill('SIGTERM');
    fail(`request autenticado retornou HTTP ${res.status} (esperado 200).\nBODY: ${raw.slice(0, 500)}\nLOG:\n${log.slice(-3000)}`);
  }
  const body = JSON.parse(raw);
  step(`request autenticado OK (HTTP 200) — lock screen: ${JSON.stringify(body).slice(0, 120)}…`);

  step(`.env.local auto-criado: ${fs.existsSync(dashEnv) ? 'SIM ✓' : 'NÃO ✗'}`);
  step(`licenses/public.pem presente: ${fs.existsSync(path.join(app, 'licenses', 'public.pem')) ? 'SIM ✓' : 'NÃO ✗'}`);
  step(`VOID.bat presente: ${fs.existsSync(path.join(app, 'VOID.bat')) ? 'SIM ✓' : 'NÃO ✗'}`);
  step(`node_modules raiz: ${fs.existsSync(path.join(app, 'node_modules')) ? 'SIM ✓' : 'NÃO ✗'}`);
  step(`node_modules dashboard: ${fs.existsSync(path.join(app, 'dashboard', 'node_modules')) ? 'SIM ✓' : 'NÃO ✗'}`);

  // 7. Encerrar e limpar
  child.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1500));
  step('processos encerrados. Limpando pasta temporária…');
  fs.rmSync(work, { recursive: true, force: true });
  step('E2E OK ✓');
}

main().catch(err => {
  console.error('[e2e] ERRO:', err.message);
  process.exit(1);
});
