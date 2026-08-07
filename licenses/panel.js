'use strict';

/**
 * HUGGING PANEL — painel local do dono para emitir e gerenciar chaves.
 *
 *   npm run panel          → sobe em http://127.0.0.1:3355/?t=<token>
 *
 * - Só escuta em 127.0.0.1 (nunca na rede). Toda a página e cada API exigem o
 *   token de sessão impresso no terminal — quem não tem o token não chama nada.
 * - A senha-mestra vem de LICENSE_MASTER_PASSPHRASE (env) > dashboard/.env.local
 *   > prompt oculto no boot. Nunca é gravada; o painel a usa para cada chamada
 *   ao studio (spawn com env, nunca na linha de comando).
 * - Reusa licenses/studio.js (modo admin) — nenhuma lógica de cofre duplicada.
 *
 * Flags:
 *   --port=3355            porta (padrão 3355)
 *   --no-open              não abre o navegador sozinho
 *   --licenses-dir=<path>  hook de teste/sandbox (padrão: pasta licenses/)
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { spawn, spawnSync } = require('node:child_process');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..');
const DASH_ENV = path.join(ROOT, 'dashboard', '.env.local');
const RAVEN_SVG = path.join(ROOT, 'dashboard', 'public', 'brand', 'huginn.svg');
const { banner, gold, dim, red } = require('../scripts/hugging-cli');

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

function parseFlags(argv) {
  const out = { port: 3355, open: true };
  const VALUE = new Set(['port', 'licenses-dir']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = /^--([^=]+)=(.*)$/.exec(arg);
    if (eq) {
      const [, k, v] = eq;
      if (k === 'port') out.port = Number(v);
      else if (k === 'licenses-dir') out.licensesDir = v;
      else if (k === 'no-open') out.open = false;
      continue;
    }
    const flag = /^--([^=]+)$/.exec(arg);
    if (flag && VALUE.has(flag[1]) && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      const k = flag[1];
      // Normaliza para a MESMA chave da forma --flag=valor (camelCase).
      if (k === 'port') out.port = Number(argv[++i]);
      else if (k === 'licenses-dir') out.licensesDir = argv[++i];
    } else if (arg === '--no-open') {
      out.open = false;
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

// ---------------------------------------------------------------------------
// Studio (modo admin: JSON no stdout)
// ---------------------------------------------------------------------------

function runStudio(studio, action, args) {
  const res = spawnSync(process.execPath, [studio, 'admin', `--action=${action}`, ...args], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  if (res.error) throw new Error(`Falha ao executar o studio: ${res.error.message}`);
  let parsed;
  try {
    parsed = JSON.parse(res.stdout.toString('utf8').trim().split('\n').pop());
  } catch {
    const errLine = res.stderr.toString('utf8').trim().split('\n').pop();
    throw new Error(errLine || 'Resposta inesperada do studio.');
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Token de sessão (comparação em tempo constante)
// ---------------------------------------------------------------------------

function tokenMatches(expected, given) {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(payload);
}

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 64 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function createServer({ studio, token }) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    // Anti DNS-rebinding barato: só aceita Host local (127.0.0.1/localhost/::1).
    // Um site malicioso não consegue forjar o Host no navegador — a requisição
    // chegaria com o domínio dele e seria rejeitada aqui.
    const host = String(req.headers.host || '').split(':')[0].toLowerCase();
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
      return json(res, 403, { error: 'Acesso negado: painel só aceita requisições locais.' });
    }

    const queryToken = url.searchParams.get('t') || '';
    const headerToken = req.headers['x-panel-token'] || '';
    const authed = tokenMatches(token, queryToken) || tokenMatches(token, headerToken);

    // Favicon: silencioso (o navegador sempre pede; sem token não é erro).
    if (req.method === 'GET' && url.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Página: exige o token (o link impresso no terminal já o carrega).
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
      if (!authed) return json(res, 401, { error: 'Token de sessão ausente ou inválido. Rode `npm run panel` de novo.' });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(renderHtml());
      return;
    }

    if (!authed) return json(res, 401, { error: 'Token de sessão ausente ou inválido.' });

    try {
      // --- GET /api/status — cofre + contagem ---
      if (req.method === 'GET' && url.pathname === '/api/status') {
        const info = runStudio(studio, 'info', []);
        const list = runStudio(studio, 'list', []);
        return json(res, 200, {
          ok: true,
          vault: Boolean(info.ok && info.vaultPresent),
          fingerprint: info.fingerprint ?? null,
          machineId: info.machineId ?? null,
          count: list.ok ? list.count : 0,
        });
      }

      // --- GET /api/list — chaves emitidas ---
      if (req.method === 'GET' && url.pathname === '/api/list') {
        const list = runStudio(studio, 'list', []);
        return json(res, list.ok ? 200 : 400, list);
      }

      // --- POST /api/create ---
      if (req.method === 'POST' && url.pathname === '/api/create') {
        const body = await readBody(req);
        const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
        const days = Number(body.days);
        if (!subject) return json(res, 400, { ok: false, error: 'Cliente (email/ID) é obrigatório.' });
        if (!Number.isInteger(days) || days < 1 || days > 3650) {
          return json(res, 400, { ok: false, error: 'Dias deve ser um inteiro entre 1 e 3650.' });
        }
        const args = [`--sub=${subject}`, `--days=${days}`];
        if (typeof body.features === 'string' && body.features.trim()) args.push(`--features=${body.features.trim()}`);
        if (typeof body.machine === 'string' && body.machine.trim()) args.push(`--machine=${body.machine.trim()}`);
        else if (body.bind === true) args.push('--bind');
        const result = runStudio(studio, 'create', args);
        return json(res, result.ok ? 200 : 400, result);
      }

      // --- POST /api/revoke ---
      if (req.method === 'POST' && url.pathname === '/api/revoke') {
        const body = await readBody(req);
        const id = typeof body.id === 'string' ? body.id.trim() : '';
        if (!id) return json(res, 400, { ok: false, error: 'ID é obrigatório.' });
        const result = runStudio(studio, 'revoke', [`--id=${id}`]);
        return json(res, result.ok ? 200 : 400, result);
      }

      // --- POST /api/extend ---
      if (req.method === 'POST' && url.pathname === '/api/extend') {
        const body = await readBody(req);
        const id = typeof body.id === 'string' ? body.id.trim() : '';
        const days = Number(body.days);
        if (!id) return json(res, 400, { ok: false, error: 'ID é obrigatório.' });
        if (!Number.isInteger(days) || days < 1 || days > 3650) {
          return json(res, 400, { ok: false, error: 'Dias deve ser um inteiro entre 1 e 3650.' });
        }
        const result = runStudio(studio, 'extend', [`--id=${id}`, `--days=${days}`]);
        return json(res, result.ok ? 200 : 400, result);
      }

      // --- POST /api/verify — valida uma chave (assinatura/validade/máquina) ---
      if (req.method === 'POST' && url.pathname === '/api/verify') {
        const body = await readBody(req);
        const key = typeof body.key === 'string' ? body.key.trim() : '';
        if (!key) return json(res, 400, { ok: false, error: 'Chave é obrigatória.' });
        // verify devolve { ok:false, reason } sem erro — não é exceção.
        const result = runStudio(studio, 'verify', [key]);
        // 'maquina-diferente' aqui significa "vinculada à máquina do CLIENTE"
        // (o painel roda na máquina do dono). No fluxo diário (criar → conferir
        // antes de enviar) isso é sucesso: assinatura e validade estão OK.
        if (!result.ok && result.reason === 'maquina-diferente' && result.payload) {
          return json(res, 200, { ok: true, payload: result.payload, boundToClient: true });
        }
        return json(res, 200, result);
      }

      return json(res, 404, { ok: false, error: 'Rota não encontrada.' });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  });
}

// ---------------------------------------------------------------------------
// HTML (marca HUGGING, mesmo design system do console)
// ---------------------------------------------------------------------------

function renderHtml() {
  let raven = '';
  try {
    raven = fs.readFileSync(RAVEN_SVG, 'utf8').replace(/^<\?xml[\s\S]*?\?>/, '').trim();
  } catch {
    raven = '';
  }
  // Só injeta a classe: o viewBox original (crop do corvo) é preservado e o
  // CSS (.raven) define o tamanho de exibição por cima de width/height.
  const ravenBlock = raven
    ? raven.replace('<svg', '<svg class="raven"')
    : '<div class="raven-fallback">H</div>';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HUGGING · console do dono</title>
<style>
:root{
  --bg:#0e0d0b; --surface:#121110; --surface-2:#171613; --surface-3:#1f1d19;
  --border:#24221a; --border-soft:#181712; --border-strong:#343028;
  --text:#f5f1e8; --muted:#a89f8f; --faint:#6b655a; --label:#ddd7cb;
  --accent:#e5a938; --accent-2:#cf942f; --accent-ink:#171104;
  --success:#5af7b0; --danger:#ff6b7d;
  --mono:'Cascadia Code','JetBrains Mono','SF Mono',Consolas,monospace;
  --sans:'Segoe UI Variable','Segoe UI',system-ui,sans-serif;
  --ease:cubic-bezier(.22,1,.36,1);
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased}
body{background-image:radial-gradient(circle at 1px 1px,rgba(229,169,56,.05) 1px,transparent 0);background-size:26px 26px;min-height:100vh}
.glow{position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(circle at 22% -12%,rgba(229,169,56,.1),transparent 46%),radial-gradient(circle at 92% 112%,rgba(167,139,250,.05),transparent 42%)}
.wrap{position:relative;z-index:1;max-width:980px;margin:0 auto;padding:26px 22px 90px}
::selection{background:rgba(229,169,56,.25)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
/* janela */
.win{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border:1px solid var(--border);border-bottom:none;border-radius:12px 12px 0 0;background:rgba(18,17,16,.85);backdrop-filter:blur(8px)}
.win-title{display:flex;align-items:center;gap:8px;font-size:.78rem;color:var(--muted)}
.win-dot{width:8px;height:8px;border-radius:50%;background:var(--success);box-shadow:0 0 10px rgba(90,247,176,.6);animation:pulse 2.4s var(--ease) infinite}
.win-pill{font-size:.7rem;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:3px 10px;letter-spacing:.05em}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}
/* cabeçalho — logo com animação */
.head{display:flex;align-items:center;gap:18px;padding:30px 6px 26px}
.logo-frame{width:62px;height:62px;flex:none;border-radius:16px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(229,169,56,.22),rgba(229,169,56,.05));border:1px solid rgba(229,169,56,.3);box-shadow:0 0 0 1px rgba(229,169,56,.06),0 10px 30px rgba(0,0,0,.4)}
.raven{width:44px;height:44px;display:block;filter:drop-shadow(0 0 12px rgba(229,169,56,.35));animation:logoBreathe 4.6s var(--ease) infinite}
.raven-fallback{width:44px;height:44px;display:grid;place-items:center;font-family:var(--mono);color:var(--accent);font-size:1.3rem}
@keyframes logoBreathe{
  0%,100%{transform:translateY(0) scale(1)}
  50%{transform:translateY(-3px) scale(1.05)}
}
@media (prefers-reduced-motion:reduce){.raven{animation:none}}
.wordmark{font-family:var(--mono);font-weight:700;letter-spacing:.3em;font-size:1.5rem;color:var(--text);margin:0}
.sub{color:var(--accent);font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;margin:6px 0 0}
.head-meta{margin-left:auto;text-align:right;font-size:.76rem;color:var(--muted);display:flex;flex-direction:column;gap:3px}
.head-meta b{color:var(--accent);font-weight:600;font-family:var(--mono);font-size:.72rem}
/* layout */
.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media(max-width:760px){.grid{grid-template-columns:1fr}}
.card{background:linear-gradient(180deg,var(--surface),var(--surface-2));border:1px solid var(--border);border-radius:14px;padding:20px;box-shadow:0 18px 44px rgba(0,0,0,.45)}
.card h2{margin:0 0 4px;font-size:.78rem;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:600}
.card .desc{margin:0 0 14px;font-size:.8rem;color:var(--muted)}
/* labels com contraste alto */
label{display:block;font-size:.76rem;color:var(--label);font-weight:500;margin:14px 0 6px;letter-spacing:.03em}
input,select{width:100%;background:#0c0b09;border:1px solid var(--border-strong);color:var(--text);border-radius:9px;padding:10px 12px;font-size:.9rem;font-family:var(--sans);transition:border-color .18s var(--ease),box-shadow .18s var(--ease)}
input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(229,169,56,.12);outline:none}
input.mono{font-family:var(--mono);font-size:.8rem}
/* validade: chips + select unificados (estado único) */
.days-row{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:2px}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{background:var(--surface-3);border:1px solid var(--border-strong);color:var(--muted);border-radius:999px;padding:7px 14px;font-size:.8rem;font-weight:500;cursor:pointer;transition:all .16s var(--ease)}
.chip:hover{border-color:var(--accent);color:var(--text)}
.chip.on{background:linear-gradient(180deg,var(--accent),var(--accent-2));border-color:transparent;color:var(--accent-ink);font-weight:600}
.days-pick{position:relative;flex:none}
.days-pick select{appearance:none;-webkit-appearance:none;width:auto;background:var(--surface-3);border:1px solid var(--border-strong);color:var(--text);border-radius:999px;padding:7px 32px 7px 14px;font-size:.8rem;font-weight:500;cursor:pointer}
.days-pick .chev{position:absolute;right:13px;top:50%;transform:translateY(-50%);color:var(--accent);pointer-events:none;font-size:.66rem}
/* vínculo: toggle expande o campo */
.toggle-card{display:flex;align-items:center;gap:12px;border:1px solid var(--border-strong);border-radius:12px;background:var(--surface-2);padding:12px 14px;cursor:pointer;transition:border-color .2s var(--ease),background .2s var(--ease)}
.toggle-card:hover{border-color:#3d382e}
.toggle-card.on{border-color:rgba(229,169,56,.55);background:rgba(229,169,56,.05)}
.tc-title{font-size:.86rem;color:var(--text);font-weight:500}
.tc-sub{font-size:.72rem;color:var(--muted);margin-top:2px}
.switch{position:relative;margin-left:auto;flex:none;width:42px;height:24px;border-radius:999px;background:var(--surface-3);border:1px solid var(--border-strong);cursor:pointer;padding:0;transition:background .2s var(--ease),border-color .2s var(--ease)}
.switch::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#b6ae9f;transition:transform .22s var(--ease),background .22s var(--ease)}
.switch.on{background:rgba(229,169,56,.25);border-color:var(--accent)}
.switch.on::after{transform:translateX(18px);background:var(--accent)}
.machine-wrap{max-height:0;opacity:0;overflow:hidden;transition:max-height .3s var(--ease),opacity .25s var(--ease)}
.machine-wrap.open{max-height:140px;opacity:1}
/* botões */
.btn{margin-top:18px;width:100%;border:none;border-radius:10px;padding:12px 14px;font-size:.92rem;font-weight:600;cursor:pointer;background:linear-gradient(180deg,var(--accent),var(--accent-2));color:var(--accent-ink);transition:filter .15s var(--ease),transform .08s var(--ease);box-shadow:0 8px 24px rgba(229,169,56,.18)}
.btn:hover{filter:brightness(1.08)}
.btn:active{transform:translateY(1px)}
.btn:disabled{opacity:.5;cursor:wait}
.btn.ghost{background:transparent;border:1px solid var(--border-strong);color:var(--muted);font-weight:500;box-shadow:none}
.btn.ghost:hover{border-color:var(--accent);color:var(--text)}
.btn.small{width:auto;padding:6px 12px;font-size:.74rem;margin-top:0;border-radius:8px}
.btn.danger{background:transparent;border:1px solid rgba(255,107,125,.5);color:var(--danger);font-weight:500;box-shadow:none}
.btn.danger:hover{background:rgba(255,107,125,.14);border-color:var(--danger)}
.btn.danger:disabled{opacity:.5;cursor:not-allowed;background:transparent}
.gen-hint{text-align:center;font-size:.72rem;color:var(--muted);margin-top:10px}
/* delivery */
.delivery{display:none;border:1px solid rgba(229,169,56,.35);background:linear-gradient(180deg,rgba(229,169,56,.06),transparent 55%);box-shadow:0 0 0 1px rgba(229,169,56,.08),0 18px 44px rgba(0,0,0,.45)}
.delivery.show{display:block;animation:rise .4s var(--ease)}
.delivery .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px;font-size:.78rem;color:var(--muted);margin:12px 0}
.delivery .meta b{color:var(--text);font-weight:500;font-family:var(--mono);font-size:.72rem}
.keybox{position:relative;background:#0a0908;border:1px solid var(--border-strong);border-radius:10px;padding:12px;font-family:var(--mono);font-size:.72rem;line-height:1.6;color:var(--accent);word-break:break-all;user-select:all;max-height:130px;overflow:auto}
.keybox + .btn.small{margin-top:10px}
/* lista: toolbar, filtros, tabela, paginação */
.toolbar{display:flex;gap:10px;align-items:center;margin:2px 0 14px;flex-wrap:wrap}
.search-box{position:relative;flex:1;min-width:210px}
.search-box input{padding-left:34px}
.search-box .s-ico{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--faint);pointer-events:none;display:grid;place-items:center}
.filter-chips{display:flex;gap:6px}
.fchip{border-radius:999px;padding:6px 12px;font-size:.74rem;font-weight:500;cursor:pointer;background:var(--surface-3);border:1px solid var(--border-strong);color:var(--muted);transition:all .15s var(--ease)}
.fchip:hover{border-color:var(--accent);color:var(--text)}
.fchip.on{background:rgba(229,169,56,.16);border-color:var(--accent);color:var(--accent)}
.fchip .n{opacity:.7;margin-left:4px}
.table{width:100%;border-collapse:collapse;font-size:.78rem;margin-top:4px}
.table th{text-align:left;color:var(--faint);font-weight:500;text-transform:uppercase;font-size:.66rem;letter-spacing:.14em;padding:8px 10px;border-bottom:1px solid var(--border)}
.table td{padding:10px;border-bottom:1px solid var(--border-soft);vertical-align:middle}
.table tbody tr{transition:opacity .2s var(--ease),background .15s var(--ease)}
.table tbody tr:hover td{background:rgba(229,169,56,.03)}
.table tbody tr.revoked{opacity:.42}
.table tbody tr.revoked:hover td{background:transparent}
.cell-client{color:var(--text);font-weight:500}
.cell-mono{font-family:var(--mono);font-size:.72rem;color:var(--muted)}
.cell-exp{color:var(--muted);font-size:.74rem}
.id-cell{display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:.72rem;color:var(--muted)}
.btn-icon{flex:none;display:inline-grid;place-items:center;width:22px;height:22px;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--faint);cursor:pointer;transition:all .15s var(--ease);padding:0}
.btn-icon:hover{color:var(--accent);border-color:var(--border-strong);background:var(--surface-3)}
.btn-icon.copied{color:var(--success);border-color:rgba(90,247,176,.4)}
.machine{display:inline-flex;align-items:center;gap:6px}
.m-ico{font-size:.8rem;line-height:1}
.machine.free .m-ico{opacity:.75}
.tag{display:inline-block;border-radius:999px;padding:2px 9px;font-size:.64rem;letter-spacing:.06em;font-weight:500}
.tag.active{background:rgba(90,247,176,.12);color:var(--success);border:1px solid rgba(90,247,176,.3)}
.tag.revoked{background:rgba(255,107,125,.1);color:var(--danger);border:1px solid rgba(255,107,125,.3)}
.row-actions{display:flex;gap:6px;justify-content:flex-end}
.pager{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:16px;font-size:.78rem;color:var(--muted)}
.pager button{border:1px solid var(--border-strong);background:var(--surface-3);color:var(--text);border-radius:8px;padding:5px 12px;cursor:pointer;font-size:.78rem;transition:all .15s var(--ease)}
.pager button:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}
.pager button:disabled{opacity:.35;cursor:not-allowed}
.toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);opacity:0;pointer-events:none;background:var(--surface-3);border:1px solid var(--border-strong);color:var(--text);padding:10px 18px;border-radius:999px;font-size:.82rem;transition:all .25s var(--ease);z-index:50}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.toast.err{border-color:rgba(255,107,125,.5);color:var(--danger)}
.verify-result{margin-top:12px;font-size:.8rem;font-family:var(--mono);display:none}
.verify-result.show{display:block}
.empty{color:var(--faint);font-size:.8rem;text-align:center;padding:26px 0}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
</style>
</head>
<body>
<div class="glow"></div>
<div class="wrap">
  <div class="win">
    <div class="win-title"><span class="win-dot"></span> hugging.painel · controle de máquinas</div>
    <div class="win-pill">console do dono · painel de licenças</div>
  </div>

  <header class="head">
    <div class="logo-frame">${ravenBlock}</div>
    <div>
      <h1 class="wordmark">HUGGING</h1>
      <p class="sub">console do dono · painel de licenças</p>
    </div>
    <div class="head-meta" id="headMeta"></div>
  </header>

  <section class="grid">
    <div class="card">
      <h2>Gerar chave</h2>
      <p class="desc">Preencha os dados do cliente. A chave nasce assinada e pronta pra enviar.</p>

      <label for="f-subject">Cliente (email ou ID)</label>
      <input id="f-subject" placeholder="cliente@email.com" autocomplete="off" spellcheck="false">

      <label>Validade</label>
      <div class="days-row">
        <div class="chips">
          <button type="button" class="chip" data-days="7">7d</button>
          <button type="button" class="chip on" data-days="30">30d</button>
          <button type="button" class="chip" data-days="90">90d</button>
          <button type="button" class="chip" data-days="365">365d</button>
        </div>
        <div class="days-pick">
          <select id="f-days" aria-label="Validade em dias">
            <option value="7">7 dias</option>
            <option value="30" selected>30 dias</option>
            <option value="90">90 dias</option>
            <option value="365">365 dias</option>
          </select>
          <span class="chev">▾</span>
        </div>
      </div>

      <label>Vínculo de máquina</label>
      <div class="toggle-card" id="bind-card">
        <div>
          <div class="tc-title">Vincular a uma máquina</div>
          <div class="tc-sub">Desligado = chave livre, funciona em qualquer PC</div>
        </div>
        <button type="button" class="switch" id="bind-switch" role="switch" aria-checked="false" aria-label="Vincular a uma máquina"></button>
      </div>
      <div class="machine-wrap" id="machine-wrap">
        <label for="f-machine">Machine ID do cliente</label>
        <input id="f-machine" class="mono" placeholder="cole o Machine ID que ele te mandou" autocomplete="off" spellcheck="false">
      </div>

      <button class="btn" id="btn-create">Gerar chave DCX1</button>
      <p class="gen-hint">A chave gerada é copiada automaticamente pro clipboard</p>
    </div>

    <div class="card delivery" id="delivery">
      <h2>Chave gerada</h2>
      <p class="desc">Envie este bloco ao cliente por WhatsApp/e-mail — o painel dele só precisa da chave.</p>
      <div class="keybox" id="d-key"></div>
      <button class="btn small" id="d-copy">copiar chave</button>
      <div class="meta">
        <span>id: <b id="d-id"></b></span>
        <span>cliente: <b id="d-sub"></b></span>
        <span>expira: <b id="d-exp"></b></span>
        <span>máquina: <b id="d-mid"></b></span>
      </div>
    </div>
  </section>

  <section class="card" style="margin-top:18px">
    <h2>Chaves emitidas</h2>
    <p class="desc">Revogar mata a chave; estender soma dias a partir de hoje (ou do vencimento, se ainda ativa).</p>
    <div class="toolbar">
      <div class="search-box">
        <span class="s-ico"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg></span>
        <input id="search" placeholder="buscar por cliente, ID ou máquina…" autocomplete="off" spellcheck="false">
      </div>
      <div class="filter-chips" id="filter-chips"></div>
    </div>
    <div id="list">carregando…</div>
    <div class="pager" id="pager"></div>
  </section>

  <section class="card" style="margin-top:18px">
    <h2>Conferir uma chave</h2>
    <p class="desc">Valida assinatura, validade e vínculo de máquina — útil antes de reenviar.</p>
    <input id="v-key" class="mono" placeholder="DCX1.…" autocomplete="off" spellcheck="false">
    <button class="btn small" id="btn-verify" style="margin-top:10px">verificar</button>
    <div class="verify-result" id="v-result"></div>
  </section>
</div>

<div class="toast" id="toast"></div>

<script>
var TOKEN = new URLSearchParams(location.search).get('t') || '';
var STATE = { keys: [], query: '', filter: 'todas', page: 1, pageSize: 7 };
var COPY_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.6"/><path d="M10.5 5.5V3.6A1.6 1.6 0 0 0 8.9 2H3.6A1.6 1.6 0 0 0 2 3.6v5.3a1.6 1.6 0 0 0 1.6 1.6h1.9"/></svg>';
var CHECK_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8.5l3.2 3.2L13 4.5"/></svg>';

function toast(msg, isErr) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.className = 'toast'; }, 3200);
}

function api(path, opts) {
  opts = opts || {};
  return fetch(path, {
    method: opts.method || 'GET',
    headers: Object.assign({ 'X-Panel-Token': TOKEN, 'Content-Type': 'application/json' }, opts.headers || {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(function (r) { return r.json().then(function (b) { if (!r.ok && !b.ok) throw new Error(b.error || 'erro ' + r.status); return b; }); });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function fmt(dateStr) {
  var d = new Date(dateStr);
  if (isNaN(d)) return dateStr || '—';
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function clip(text) {
  return new Promise(function (resolve) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { resolve(true); }, function () { resolve(false); });
      return;
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      resolve(ok);
    } catch (e) { resolve(false); }
  });
}

// ---- status ----
function loadStatus() {
  api('/api/status').then(function (s) {
    document.getElementById('headMeta').innerHTML =
      '<div>colar chave: <b>' + (s.vault ? 'ativo' : 'ausente') + '</b> <span style="opacity:.65">(' + s.count + ' chaves)</span></div>' +
      '<div style="opacity:.75">máquina: <b>' + esc(s.machineId || '—') + '</b></div>';
  }).catch(function (e) { document.getElementById('headMeta').textContent = e.message; });
}

// ---- lista: filtro + busca + paginação ----
function filteredKeys() {
  var q = STATE.query.toLowerCase();
  return STATE.keys.filter(function (k) {
    if (STATE.filter === 'ativas' && k.status !== 'active') return false;
    if (STATE.filter === 'revogadas' && k.status !== 'revoked') return false;
    if (!q) return true;
    return (k.sub || '').toLowerCase().indexOf(q) !== -1 ||
      (k.id || '').toLowerCase().indexOf(q) !== -1 ||
      (k.machineId || '').toLowerCase().indexOf(q) !== -1;
  });
}

function counts() {
  var ativas = 0, revogadas = 0;
  STATE.keys.forEach(function (k) { if (k.status === 'active') ativas++; else if (k.status === 'revoked') revogadas++; });
  return { todas: STATE.keys.length, ativas: ativas, revogadas: revogadas };
}

function renderFilterChips() {
  var c = counts();
  var defs = [['todas', 'Todas', c.todas], ['ativas', 'Ativas', c.ativas], ['revogadas', 'Revogadas', c.revogadas]];
  document.getElementById('filter-chips').innerHTML = defs.map(function (d) {
    return '<button class="fchip' + (STATE.filter === d[0] ? ' on' : '') + '" data-f="' + d[0] + '">' + d[1] + ' <span class="n">' + d[2] + '</span></button>';
  }).join('');
  document.querySelectorAll('.fchip').forEach(function (b) {
    b.onclick = function () { STATE.filter = b.getAttribute('data-f'); STATE.page = 1; renderFilterChips(); renderTable(); };
  });
}

function renderPager(total) {
  var el = document.getElementById('pager');
  var pages = Math.max(1, Math.ceil(total / STATE.pageSize));
  if (STATE.page > pages) STATE.page = pages;
  if (total <= STATE.pageSize) { el.innerHTML = ''; return; }
  el.innerHTML =
    '<button id="pg-prev"' + (STATE.page <= 1 ? ' disabled' : '') + '>‹ anterior</button>' +
    '<span>página ' + STATE.page + ' de ' + pages + '</span>' +
    '<button id="pg-next"' + (STATE.page >= pages ? ' disabled' : '') + '>próxima ›</button>';
  var prev = document.getElementById('pg-prev'), next = document.getElementById('pg-next');
  if (prev) prev.onclick = function () { STATE.page--; renderPager(total); renderTable(); };
  if (next) next.onclick = function () { STATE.page++; renderPager(total); renderTable(); };
}

function renderTable() {
  var el = document.getElementById('list');
  var list = filteredKeys();
  var total = list.length;
  renderFilterChips();
  if (!total) {
    el.innerHTML = '<div class="empty">' + (STATE.keys.length ? 'nenhuma chave encontrada com esse filtro.' : 'nenhuma chave emitida ainda — gere a primeira acima.') + '</div>';
    renderPager(0);
    return;
  }
  var start = (STATE.page - 1) * STATE.pageSize;
  var rows = list.slice(start, start + STATE.pageSize).map(function (k) {
    var revoked = k.status !== 'active';
    var tag = revoked ? '<span class="tag revoked">revogada</span>' : '<span class="tag active">ativa</span>';
    var actions = revoked
      ? '<button class="btn small danger" disabled>revogada</button>'
      : '<button class="btn small ghost" data-extend="' + esc(k.id) + '">+30d</button><button class="btn small danger" data-revoke="' + esc(k.id) + '">revogar</button>';
    var machine = k.machineBound
      ? '<span class="cell-mono machine"><span class="m-ico">🔒</span>' + esc(k.machineId || 'vinculada') + '</span>'
      : '<span class="cell-mono machine free"><span class="m-ico">🌐</span>livre</span>';
    return '<tr' + (revoked ? ' class="revoked"' : '') + '>' +
      '<td><div class="id-cell">' + esc(k.id) + '<button type="button" class="btn-icon" data-copy-id="' + esc(k.id) + '" title="copiar ID">' + COPY_SVG + '</button></div></td>' +
      '<td class="cell-client">' + esc(k.sub) + '</td>' +
      '<td>' + tag + '</td>' +
      '<td class="cell-exp">' + fmt(k.expiresAt) + '</td>' +
      '<td>' + machine + '</td>' +
      '<td><div class="row-actions">' + actions + '</div></td></tr>';
  }).join('');
  el.innerHTML = '<table class="table"><thead><tr><th>id</th><th>cliente</th><th>status</th><th>expira</th><th>máquina</th><th style="text-align:right">ações</th></tr></thead><tbody>' + rows + '</tbody></table>';
  renderPager(total);
  el.querySelectorAll('[data-revoke]').forEach(function (b) { b.onclick = function () { revoke(b.getAttribute('data-revoke')); }; });
  el.querySelectorAll('[data-extend]').forEach(function (b) { b.onclick = function () { extend(b.getAttribute('data-extend')); }; });
  el.querySelectorAll('[data-copy-id]').forEach(function (b) { b.onclick = function () { copyId(b.getAttribute('data-copy-id'), b); }; });
}

function loadList() {
  api('/api/list').then(function (r) {
    STATE.keys = r.keys || [];
    STATE.page = 1;
    renderTable();
  }).catch(function (e) { document.getElementById('list').innerHTML = '<div class="empty">' + e.message + '</div>'; });
}

function copyId(id, btn) {
  clip(id).then(function (ok) {
    if (!ok) return toast('não foi possível copiar', true);
    btn.innerHTML = CHECK_SVG;
    btn.classList.add('copied');
    setTimeout(function () { btn.innerHTML = COPY_SVG; btn.classList.remove('copied'); }, 1000);
    toast('ID copiado ✓');
  });
}

function revoke(id) {
  if (!confirm('Revogar a chave ' + id + '? Ela para de validar imediatamente.')) return;
  api('/api/revoke', { method: 'POST', body: { id: id } }).then(function () { toast('chave revogada'); loadList(); }).catch(function (e) { toast(e.message, true); });
}

function extend(id) {
  api('/api/extend', { method: 'POST', body: { id: id, days: 30 } }).then(function () { toast('+30 dias aplicados'); loadList(); }).catch(function (e) { toast(e.message, true); });
}

// ---- validade: chips ↔ select (controle único) ----
function setDays(v) {
  document.getElementById('f-days').value = String(v);
  document.querySelectorAll('.chip').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-days') === String(v)); });
}
document.querySelectorAll('.chip').forEach(function (c) { c.onclick = function () { setDays(c.getAttribute('data-days')); }; });
document.getElementById('f-days').addEventListener('change', function () { setDays(this.value); });

// ---- vínculo: toggle expande o campo (transição suave) ----
function setBind(on) {
  var sw = document.getElementById('bind-switch');
  sw.classList.toggle('on', on);
  sw.setAttribute('aria-checked', on ? 'true' : 'false');
  document.getElementById('bind-card').classList.toggle('on', on);
  document.getElementById('machine-wrap').classList.toggle('open', on);
  if (on) document.getElementById('f-machine').focus();
}
document.getElementById('bind-switch').onclick = function (e) { e.stopPropagation(); setBind(!document.getElementById('bind-switch').classList.contains('on')); };
document.getElementById('bind-card').onclick = function () { setBind(!document.getElementById('bind-switch').classList.contains('on')); };

// ---- criar ----
function createKey() {
  var subject = document.getElementById('f-subject').value.trim();
  var days = Number(document.getElementById('f-days').value);
  var bindOn = document.getElementById('bind-switch').classList.contains('on');
  var machine = bindOn ? document.getElementById('f-machine').value.trim() : '';
  if (!subject) return toast('Informe o cliente (email/ID).', true);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return toast('Dias inválido (1–3650).', true);
  if (bindOn && !machine) return toast('Ligue o vínculo e cole o Machine ID do cliente.', true);
  var btn = document.getElementById('btn-create');
  btn.disabled = true; btn.textContent = 'gerando…';
  api('/api/create', { method: 'POST', body: { subject: subject, days: days, machine: machine, bind: false } })
    .then(function (r) {
      document.getElementById('d-key').textContent = r.key;
      document.getElementById('d-id').textContent = r.id;
      document.getElementById('d-sub').textContent = r.subject;
      document.getElementById('d-exp').textContent = fmt(r.expiresAt);
      document.getElementById('d-mid').textContent = r.machineId || 'livre (qualquer máquina)';
      document.getElementById('delivery').classList.add('show');
      document.getElementById('delivery').scrollIntoView({ behavior: 'smooth', block: 'center' });
      clip(r.key).then(function (ok) { toast(ok ? 'chave gerada e copiada ✓' : 'chave gerada ✓'); });
      loadList(); loadStatus();
    })
    .catch(function (e) { toast(e.message, true); })
    .finally(function () { btn.disabled = false; btn.textContent = 'Gerar chave DCX1'; });
}

// ---- copiar chave do card ----
function copyKey() {
  var key = document.getElementById('d-key').textContent;
  clip(key).then(function (ok) { toast(ok ? 'chave copiada ✓' : 'copie manualmente — selecione o bloco e Ctrl+C', !ok); });
}

// ---- verificar ----
function verifyKey() {
  var key = document.getElementById('v-key').value.trim();
  if (!key) return toast('Cole uma chave DCX1 para verificar.', true);
  var el = document.getElementById('v-result');
  api('/api/verify', { method: 'POST', body: { key: key } })
    .then(function (r) {
      if (r.ok) {
        el.style.color = 'var(--success)';
        var bindNote = r.boundToClient
          ? ' · vinculada à máquina do cliente (esperado)'
          : (r.payload.mid ? ' · vinculada à máquina ' + r.payload.mid : '');
        el.textContent = '✓ VÁLIDA — cliente: ' + r.payload.sub + ' · expira ' + fmt(new Date(r.payload.exp * 1000).toISOString()) + bindNote;
      } else {
        el.style.color = 'var(--danger)';
        el.textContent = '✗ ' + (r.reason || 'inválida');
      }
      el.classList.add('show');
    })
    .catch(function (e) { el.style.color = 'var(--danger)'; el.textContent = e.message; el.classList.add('show'); });
}

// ---- wiring ----
document.getElementById('btn-create').onclick = createKey;
document.getElementById('d-copy').onclick = copyKey;
document.getElementById('btn-verify').onclick = verifyKey;
document.getElementById('v-key').addEventListener('keydown', function (e) { if (e.key === 'Enter') verifyKey(); });
document.getElementById('search').addEventListener('input', function (e) { STATE.query = e.target.value; STATE.page = 1; renderTable(); });
loadStatus(); loadList();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main() {
  const f = parseFlags(process.argv.slice(2));
  const licensesDir = typeof f.licensesDir === 'string' && f.licensesDir ? f.licensesDir : __dirname;
  const studio = path.join(licensesDir, 'studio.js');

  console.log(banner('painel do dono · geração de chaves DCX1'));
  console.log('');

  if (!fs.existsSync(studio)) {
    console.error(red(`[panel] ERRO: ${path.relative(ROOT, studio)} não existe. Rode na raiz do projeto.`));
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(path.join(licensesDir, 'private.pem.enc'))) {
    console.error(red('[panel] ERRO: cofre da chave privada não encontrado. Rode `npm run license:init` primeiro.'));
    process.exitCode = 1;
    return;
  }

  let passphrase = loadPassphrase();
  if (!passphrase && !process.stdin.isTTY) {
    console.error(red('[panel] ERRO: LICENSE_MASTER_PASSPHRASE não definida (nem em dashboard/.env.local) e sem terminal interativo.'));
    process.exitCode = 1;
    return;
  }
  if (!passphrase) passphrase = await promptHidden('Senha-mestra do cofre: ');
  if (!passphrase) {
    console.error(red('[panel] ERRO: senha-mestra vazia não é permitida.'));
    process.exitCode = 1;
    return;
  }
  process.env.LICENSE_MASTER_PASSPHRASE = passphrase;

  // Valida a senha antes de abrir o servidor (evita painel vivo com cofre trancado).
  try {
    const probe = runStudio(studio, 'list', []);
    if (typeof probe.count !== 'number') throw new Error('Resposta inesperada do studio.');
  } catch (err) {
    console.error(red(`[panel] ERRO: ${err.message}`));
    process.exitCode = 1;
    return;
  }
  console.log(dim('  cofre desbloqueado ✓'));
  console.log(dim(`  studio: ${path.relative(ROOT, studio)}`));

  const token = crypto.randomBytes(16).toString('hex');
  const server = createServer({ studio, token });
  const port = Number.isInteger(f.port) && f.port > 0 ? f.port : 3355;
  const url = `http://127.0.0.1:${port}/?t=${token}`;

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error(red(`[panel] ERRO: porta ${port} já está em uso. Use --port=OUTRA.`));
    } else {
      console.error(red(`[panel] ERRO: ${err.message}`));
    }
    process.exit(1);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(gold('  painel no ar — somente nesta máquina'));
    console.log('');
    console.log(gold(`  ${url}`));
    console.log('');
    console.log(dim('  feche com Ctrl+C. O token da URL é a sua chave de acesso a este painel.'));
    if (f.open) {
      try {
        if (process.platform === 'win32') {
          spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
        } else if (process.platform === 'darwin') {
          spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
        } else {
          spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
        }
      } catch {
        /* navegador não abriu — o usuário copia a URL */
      }
    }
  });
}

if (require.main === module) {
  main().catch(err => {
    console.error(red(`[panel] ERRO: ${err.message}`));
    process.exitCode = 1;
  });
}

module.exports = { parseFlags, loadPassphrase, runStudio, createServer, renderHtml, tokenMatches };
