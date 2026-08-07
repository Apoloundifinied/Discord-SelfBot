import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { REPO_ROOT } from '@/lib/paths';

export const dynamic = 'force-dynamic';

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}$/;
const TEST_TIMEOUT_MS = 20000;

function runTokenTest(token) {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [path.join(REPO_ROOT, 'fleet', 'test-token.js'), token],
      { timeout: TEST_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          // Erro de spawn ou timeout. Timeout não emite stdout útil.
          resolve({ ok: false, status: null, error: 'Tempo esgotado ao testar o token.' });
          return;
        }
        try {
          const line = stdout.trim().split('\n').pop();
          resolve(JSON.parse(line));
        } catch {
          resolve({ ok: false, status: null, error: 'Falha ao interpretar a resposta do testador.' });
        }
      },
    );
  });
}

/**
 * POST /api/token/test  Body: { token }
 * Valida um token de usuário contra /users/@me via REST (atravessa o
 * Cloudflare usando o layer HTTP da lib). Resposta: { ok, status, user|error }.
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { token } = body;

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token é obrigatório.' }, { status: 400 });
  }
  if (!TOKEN_FORMAT.test(token.trim())) {
    return NextResponse.json({ error: 'Formato de token inválido.' }, { status: 400 });
  }

  const result = await runTokenTest(token.trim());
  return NextResponse.json(result);
}
