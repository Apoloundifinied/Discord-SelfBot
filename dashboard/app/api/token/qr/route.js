import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '@/lib/paths';

export const dynamic = 'force-dynamic';

/**
 * Sessões de login por QR Code (onboarding "Token por QR").
 *
 * POST   /api/token/qr            inicia uma sessão: spawna fleet/scan-token.js
 * GET    /api/token/qr?session=x  último evento da sessão (polling)
 * DELETE /api/token/qr?session=x  encerra a sessão e limpa os arquivos
 *
 * O script filho escreve eventos JSON em data/qr/<session>.jsonl (gitignored):
 *   {type:'qr', qr} → {type:'pending', user} → {type:'finish', token, user}
 *   ou {type:'cancel'|'closed'|'error'|'timeout'}. O arquivo .pid permite ao
 *   DELETE matar o processo. O filho tem timeout rígido de 150s — nunca fica
 *   órfão (o QR do Discord expira em ~2 min).
 */

const SCAN_SCRIPT = path.join(REPO_ROOT, 'fleet', 'scan-token.js');
const QR_DIR = path.join(REPO_ROOT, 'data', 'qr');
const SESSION_RE = /^[a-f0-9]{16}$/;
const STALE_MS = 10 * 60 * 1000;
const TERMINAL_TYPES = new Set(['finish', 'cancel', 'closed', 'error', 'timeout']);

function pathsFor(session) {
  return {
    events: path.join(QR_DIR, `${session}.jsonl`),
    pid: path.join(QR_DIR, `${session}.pid`),
    cancel: path.join(QR_DIR, `${session}.cancel`),
  };
}

function lastEvent(session) {
  const { events } = pathsFor(session);
  if (!fs.existsSync(events)) return null;
  const lines = fs.readFileSync(events, 'utf8').split('\n').filter(Boolean);
  if (!lines.length) return null;
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

/** Anexa um evento ao arquivo da sessão (cria a pasta se preciso). */
function appendEvent(events, evt) {
  try {
    fs.mkdirSync(path.dirname(events), { recursive: true });
    fs.appendFileSync(events, JSON.stringify({ ...evt, at: new Date().toISOString() }) + '\n');
  } catch {
    /* pasta inacessível — o polling encerra pelo timeout do filho */
  }
}

/** Remove sessões órfãs antigas (recomeço do servidor não deixa lixo acumular). */
function sweepStale() {
  try {
    if (!fs.existsSync(QR_DIR)) return;
    const now = Date.now();
    for (const file of fs.readdirSync(QR_DIR)) {
      const full = path.join(QR_DIR, file);
      try {
        if (now - fs.statSync(full).mtimeMs > STALE_MS) fs.rmSync(full, { force: true });
      } catch {
        /* já removido */
      }
    }
  } catch {
    /* pasta inacessível — segue */
  }
}

/** POST /api/token/qr — inicia uma nova sessão de escaneamento. */
export async function POST() {
  try {
    fs.mkdirSync(QR_DIR, { recursive: true });
    sweepStale();
    const session = crypto.randomBytes(8).toString('hex');
    const { events, pid } = pathsFor(session);
    // Captura o stderr do filho: se ele cair sem evento terminal, o motivo
    // real (crash de módulo, erro de rede, etc.) vai junto na mensagem — em
    // vez de um erro genérico que não ajuda ninguém.
    let stderrBuf = '';
    const child = spawn(process.execPath, [SCAN_SCRIPT, '--out', events], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', chunk => {
      stderrBuf = (stderrBuf + chunk.toString('utf8')).slice(-2000);
    });
    fs.writeFileSync(pid, String(child.pid));

    // Se o script falhar ao iniciar (ex.: arquivo ausente no pacote) ou cair
    // antes de escrever um evento terminal, registra um erro no arquivo de
    // eventos — senão o polling ficaria preso em "starting" para sempre.
    child.on('error', err => {
      appendEvent(events, {
        type: 'error',
        error: `Falha ao iniciar o leitor de QR: ${err.message}`,
      });
    });
    child.on('exit', () => {
      // Sessão encerrada pelo próprio DELETE: não inventa erro fantasma.
      if (fs.existsSync(pathsFor(session).cancel)) {
        fs.rmSync(pathsFor(session).cancel, { force: true });
        return;
      }
      const evt = lastEvent(session);
      if (!evt || !TERMINAL_TYPES.has(evt.type)) {
        // Começo do stderr: é onde ficam a linha do erro (ex.: "Error: Cannot
        // find module 'debug'") e o começo do stack. O fim só tem o banner
        // "Node.js vXX" — inútil para diagnosticar.
        const detail = stderrBuf
          .trim()
          .split('\n')
          .slice(0, 3)
          .join(' | ');
        appendEvent(events, {
          type: 'error',
          error: detail
            ? `O leitor de QR encerrou inesperadamente (${detail}). Gere um novo QR Code.`
            : 'O leitor de QR encerrou inesperadamente. Gere um novo QR Code.',
        });
      }
    });

    return NextResponse.json({ session });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** GET /api/token/qr?session=<id> — último evento da sessão (polling do wizard). */
export async function GET(request) {
  const session = request.nextUrl.searchParams.get('session') || '';
  if (!SESSION_RE.test(session)) {
    return NextResponse.json({ error: 'Sessão inválida.' }, { status: 400 });
  }
  const evt = lastEvent(session);
  return NextResponse.json(evt ?? { type: 'starting' });
}

/** DELETE /api/token/qr?session=<id> — encerra o processo filho e limpa os arquivos. */
export async function DELETE(request) {
  const session = request.nextUrl.searchParams.get('session') || '';
  if (!SESSION_RE.test(session)) {
    return NextResponse.json({ error: 'Sessão inválida.' }, { status: 400 });
  }
  const { events, pid, cancel } = pathsFor(session);
  // Marca antes de matar: o handler de 'exit' do POST não deve escrever um
  // erro de fallback para uma sessão que nós mesmos encerramos.
  try {
    fs.writeFileSync(cancel, '1');
  } catch {
    /* segue */
  }
  try {
    if (fs.existsSync(pid)) {
      const childPid = Number(fs.readFileSync(pid, 'utf8'));
      if (Number.isInteger(childPid) && childPid > 0) {
        try {
          process.kill(childPid);
        } catch {
          /* já encerrado */
        }
      }
    }
  } catch {
    /* segue */
  }
  // O marcador de cancelamento NÃO é removido aqui: o handler de 'exit' do
  // POST o encontra (mesmo depois do kill) e o apaga — sem escrever erro
  // fantasma. Arquivos órfãos de cancel sobram no máximo até o sweepStale.
  for (const file of [events, pid]) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      /* segue */
    }
  }
  return NextResponse.json({ ok: true });
}
