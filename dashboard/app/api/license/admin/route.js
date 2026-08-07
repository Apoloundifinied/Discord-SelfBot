import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { PATHS } from '@/lib/paths';
import { isAdminAvailable } from '@/lib/licenseServer';

export const dynamic = 'force-dynamic';

const ADMIN_TIMEOUT_MS = 25000;

function runStudio(action, args = []) {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [PATHS.licenseStudio, 'admin', `--action=${action}`, ...args],
      { timeout: ADMIN_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, env: { ...process.env } },
      (error, stdout) => {
        if (error) {
          resolve({ ok: false, error: 'Falha ao executar o estúdio de licenças.' });
          return;
        }
        try {
          const line = stdout.trim().split('\n').pop();
          resolve(JSON.parse(line));
        } catch {
          resolve({ ok: false, error: 'Falha ao interpretar a resposta do estúdio.' });
        }
      },
    );
  });
}

/**
 * GET /api/license/admin
 * Estado do painel do dono. Só retorna dados quando o cofre da chave privada
 * existe nesta máquina e LICENSE_MASTER_PASSPHRASE está definida.
 */
export async function GET() {
  if (!isAdminAvailable()) {
    return NextResponse.json({
      enabled: false,
      reason: 'Painel do dono indisponível nesta instalação (cofre da chave privada ausente).',
    });
  }

  // 'info' é a ação do studio que reporta fingerprint/machineId do cofre.
  const [info, list] = await Promise.all([runStudio('info'), runStudio('list')]);
  if (!info.ok) {
    return NextResponse.json({ enabled: false, reason: info.error ?? 'Cofre inacessível.' });
  }

  return NextResponse.json({
    enabled: true,
    fingerprint: info.fingerprint ?? null,
    machineId: info.machineId ?? null,
    keys: list.ok ? list.keys : [],
  });
}

/**
 * POST /api/license/admin  Body: { action, ... }
 * Ações: create (sub, days, features?, bind?), revoke (id), extend (id, days).
 */
export async function POST(request) {
  if (!isAdminAvailable()) {
    return NextResponse.json(
      { ok: false, error: 'Painel do dono indisponível nesta instalação.' },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const { action } = body;

  if (action === 'create') {
    const sub = typeof body.sub === 'string' ? body.sub.trim() : '';
    const days = Number(body.days);
    if (!sub) return NextResponse.json({ ok: false, error: 'Cliente (sub) é obrigatório.' }, { status: 400 });
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return NextResponse.json({ ok: false, error: 'Dias deve ser um inteiro entre 1 e 3650.' }, { status: 400 });
    }
    const args = [`--sub=${sub}`, `--days=${days}`];
    if (typeof body.features === 'string' && body.features.trim()) args.push(`--features=${body.features.trim()}`);
    if (body.bind === true) args.push('--bind');
    const result = await runStudio('create', args);
    return NextResponse.json(result, result.ok ? { status: 200 } : { status: 400 });
  }

  if (action === 'revoke') {
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) return NextResponse.json({ ok: false, error: 'ID é obrigatório.' }, { status: 400 });
    const result = await runStudio('revoke', [`--id=${id}`]);
    return NextResponse.json(result, result.ok ? { status: 200 } : { status: 400 });
  }

  if (action === 'extend') {
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const days = Number(body.days);
    if (!id) return NextResponse.json({ ok: false, error: 'ID é obrigatório.' }, { status: 400 });
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return NextResponse.json({ ok: false, error: 'Dias deve ser um inteiro entre 1 e 3650.' }, { status: 400 });
    }
    const result = await runStudio('extend', [`--id=${id}`, `--days=${days}`]);
    return NextResponse.json(result, result.ok ? { status: 200 } : { status: 400 });
  }

  return NextResponse.json({ ok: false, error: `Ação desconhecida: "${action}".` }, { status: 400 });
}
