'use strict';

/**
 * E2E do modo padrão (npm run package:client): valida que o pacote sem Node
 * embarcado também sobe o dashboard (o bug dos externals com hash afetava os
 * dois modos). Usa o node do sistema. Mata tudo no final.
 *
 * Uso: node scripts/_e2e-client.js
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3996;

function fail(msg) {
  console.error(`[e2e-client] ERRO: ${msg}`);
  process.exit(1);
}
function step(msg) {
  console.log(`[e2e-client] ${msg}`);
}

async function main() {
  const dir = path.join(ROOT, 'dist', 'void-client');
  if (!fs.existsSync(path.join(dir, 'void.js'))) fail('dist/void-client ausente — rode npm run package:client primeiro.');

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'void-client-e2e-'));
  // Cópia (o packager já deixou o pacote montado em dist/)
  const app = path.join(work, 'void-client');
  fs.cpSync(dir, app, { recursive: true });
  step(`pacote copiado para ${work}`);

  // Modo padrão: o CLIENTE roda `npm install` — simula aqui dentro.
  step('npm install (simulando o cliente)…');
  const ni = spawnSync('npm.cmd install --no-audit --no-fund', [], { cwd: app, stdio: 'inherit', shell: true });
  if (ni.status !== 0) fail('npm install falhou no pacote.');
  const nd = spawnSync('npm.cmd --prefix dashboard install --no-audit --no-fund', [], { cwd: app, stdio: 'inherit', shell: true });
  if (nd.status !== 0) fail('npm install do dashboard falhou.');

  const nodeExe = process.execPath;
  const dashEnv = path.join(app, 'dashboard', '.env.local');
  if (fs.existsSync(dashEnv)) fs.rmSync(dashEnv); // força o auto-create

  step('subindo void.js (node do sistema)…');
  const child = spawn(nodeExe, ['void.js', '--no-open', '--port', String(PORT)], {
    cwd: app,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LICENSE_ENFORCE: 'true' },
  });
  let log = '';
  child.stdout.on('data', d => (log += d));
  child.stderr.on('data', d => (log += d));

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

  // Check autenticado
  const envContent = fs.readFileSync(dashEnv, 'utf8');
  const m = /^DASHBOARD_PASSWORD=(.*)$/m.exec(envContent);
  if (!m || !m[1].trim()) fail('DASHBOARD_PASSWORD não gerada.');
  const auth = `Basic ${Buffer.from(`void:${m[1].trim()}`).toString('base64')}`;
  const res = await fetch(`http://127.0.0.1:${PORT}/api/license/status`, { headers: { authorization: auth } });
  if (res.status !== 200) fail(`request autenticado HTTP ${res.status} (esperado 200).\nLOG:\n${log.slice(-2000)}`);
  step('request autenticado OK (HTTP 200) ✓');
  step('.env.local auto-criado ✓');
  step('externals replicados: ' + (fs.existsSync(path.join(app, 'dashboard', '.next', 'node_modules')) ? 'SIM ✓' : 'NÃO ✗'));

  child.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1500));
  fs.rmSync(work, { recursive: true, force: true });
  step('E2E padrão OK ✓');
}

main().catch(err => {
  console.error('[e2e-client] ERRO:', err.message);
  process.exit(1);
});
