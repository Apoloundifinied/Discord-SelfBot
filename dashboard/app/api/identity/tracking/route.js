import { NextResponse } from 'next/server';
import { listTrackedUsers, getProfileHistory, getPresenceHistory } from '@/lib/identityDb';
import { fleetSupervisor } from '@/lib/fleetSupervisor';

export const dynamic = 'force-dynamic';

const USER_ID_RE = /^\d{17,21}$/;

function isValidUserId(userId) {
  return typeof userId === 'string' && USER_ID_RE.test(userId);
}

/** Estado do loop de rastreio (vem do processo do manager da fleet via IPC). */
function trackingState() {
  return fleetSupervisor.getState().lastStatus?.tracking ?? null;
}

/**
 * GET /api/identity/tracking                -> lista usuários rastreados + estado do loop
 * GET /api/identity/tracking?userId=123     -> rastreados + histórico do usuário
 * POST /api/identity/tracking { userId }    -> adiciona ao rastreio
 * POST /api/identity/tracking { action }    -> "start" | "stop" controla o loop na fleet
 * DELETE /api/identity/tracking { userId }  -> remove do rastreio
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    const tracked = await listTrackedUsers();
    if (userId) {
      if (!isValidUserId(userId)) {
        return NextResponse.json({ error: 'userId inválido.' }, { status: 400 });
      }
      return NextResponse.json({
        tracked,
        history: await getProfileHistory(userId),
        presenceHistory: await getPresenceHistory(userId),
        tracking: trackingState(),
      });
    }
    return NextResponse.json({ tracked, tracking: trackingState() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    // Controle do loop de rastreio: o loop roda no processo do manager da fleet.
    if (body.action === 'start' || body.action === 'stop') {
      if (!fleetSupervisor.getState().running) {
        return NextResponse.json(
          { error: 'Fleet não está rodando. Inicie a fleet na aba "Fleet" primeiro.' },
          { status: 409 },
        );
      }
      const sent = fleetSupervisor.send({ type: body.action === 'start' ? 'tracking-start' : 'tracking-stop' });
      if (!sent) {
        return NextResponse.json({ error: 'Não foi possível enviar o comando à fleet.' }, { status: 409 });
      }
      return NextResponse.json({
        ok: true,
        running: body.action === 'start',
        message:
          body.action === 'start'
            ? 'Loop de rastreio iniciado na fleet. Cada passada checa os usuários cujo intervalo venceu.'
            : 'Loop de rastreio pausado.',
      });
    }

    const { userId } = body;
    if (!isValidUserId(userId)) {
      return NextResponse.json({ error: 'userId inválido (ID numérico de usuário do Discord).' }, { status: 400 });
    }

    // O rastreio é persistido no Turso e executado pelo loop da fleet
    // (iniciado acima) ou pelo CLI (node fleet/track.js run).
    const { createClient } = await import('@libsql/client');
    const { getRuntimeConfig } = await import('@/lib/runtimeConfig');
    const { tursoUrl, tursoAuthToken } = getRuntimeConfig();
    if (!tursoUrl) return NextResponse.json({ error: 'Banco de dados não configurado.' }, { status: 500 });

    const db = createClient({ url: tursoUrl, authToken: tursoAuthToken });
    await db.execute({
      sql: `INSERT INTO tracked_users (user_id, interval_minutes) VALUES (?, 60)
            ON CONFLICT (user_id) DO UPDATE SET interval_minutes = excluded.interval_minutes`,
      args: [userId],
    });

    return NextResponse.json({
      ok: true,
      message: 'Usuário adicionado ao rastreio (intervalo 60min). Inicie o loop com "Iniciar rastreio" ou use: node fleet/track.js run',
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userId } = body;
    if (!isValidUserId(userId)) {
      return NextResponse.json({ error: 'userId inválido.' }, { status: 400 });
    }

    const { createClient } = await import('@libsql/client');
    const { getRuntimeConfig } = await import('@/lib/runtimeConfig');
    const { tursoUrl, tursoAuthToken } = getRuntimeConfig();
    if (!tursoUrl) return NextResponse.json({ error: 'Banco de dados não configurado.' }, { status: 500 });

    const db = createClient({ url: tursoUrl, authToken: tursoAuthToken });
    await db.execute({ sql: `DELETE FROM tracked_users WHERE user_id = ?`, args: [userId] });

    return NextResponse.json({ ok: true, message: 'Usuário removido do rastreio.' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
