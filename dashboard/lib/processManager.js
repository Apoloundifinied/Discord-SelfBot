import { fork } from 'node:child_process';

const MAX_LOG_LINES = 300;
const FORCE_KILL_DELAY_MS = 6000;

/**
 * Cria um supervisor para um único processo filho de longa duração, iniciado
 * via `fork()` (para termos um canal IPC opcional além de stdout/stderr).
 *
 * Reaproveita o script tal como ele já roda pela CLI (`fleet/manager.js` ou
 * `scraper/index.js`) — o dashboard não reimplementa nenhuma lógica de negócio,
 * só orquestra o processo e expõe status/logs para a UI.
 */
export function createProcessSupervisor({ name, scriptPath }) {
  let child = null;
  let logs = [];
  let lastStatus = null;
  let exitInfo = null;

  function pushLog(line) {
    logs.push({ ts: Date.now(), line });
    if (logs.length > MAX_LOG_LINES) logs.shift();
  }

  function attachOutput(stream) {
    let buffer = '';
    stream.on('data', chunk => {
      buffer += chunk.toString();
      const parts = buffer.split('\n');
      buffer = parts.pop();
      parts.forEach(part => part && pushLog(part));
    });
  }

  function start(env = {}) {
    if (child) return { alreadyRunning: true, pid: child.pid };

    child = fork(scriptPath, [], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, ...env },
    });
    exitInfo = null;
    lastStatus = null;
    pushLog(`▶ processo iniciado (pid ${child.pid})`);

    attachOutput(child.stdout);
    attachOutput(child.stderr);

    child.on('message', msg => {
      if (msg?.type) lastStatus = msg;
    });

    child.on('exit', code => {
      pushLog(`■ processo encerrado (código ${code})`);
      exitInfo = { code, at: Date.now() };
      child = null;
    });

    child.on('error', err => {
      pushLog(`✖ erro ao rodar processo: ${err.message}`);
    });

    return { started: true, pid: child.pid };
  }

  function stop() {
    if (!child) return { alreadyStopped: true };

    const pid = child.pid;
    pushLog('◼ pedido de encerramento enviado (SIGTERM)...');
    child.kill('SIGTERM');

    setTimeout(() => {
      if (child && child.pid === pid) {
        pushLog(`⚠ ${name} não encerrou a tempo, forçando kill (SIGKILL).`);
        child.kill('SIGKILL');
      }
    }, FORCE_KILL_DELAY_MS);

    return { stopping: true };
  }

  /** Envia um comando IPC ao processo filho (ex.: add-account). Retorna false se não estiver rodando. */
  function send(message) {
    if (!child || !child.connected) return false;
    child.send(message);
    return true;
  }

  function getState() {
    return {
      name,
      running: Boolean(child),
      pid: child?.pid ?? null,
      lastStatus,
      exitInfo,
      logs,
    };
  }

  return { start, stop, send, getState };
}
