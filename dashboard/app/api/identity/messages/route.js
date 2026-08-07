import { NextResponse } from 'next/server';
import { getUserSearchMessages } from '@/lib/identityDb';
import { searchUserMessages } from '@/lib/fleetSupervisor';

export const dynamic = 'force-dynamic';

const USER_ID_RE = /^\d{17,21}$/;

function isValidUserId(userId) {
  return typeof userId === 'string' && USER_ID_RE.test(userId);
}

/**
 * GET /api/identity/messages?userId=123 -> mensagens do autor persistidas no Turso
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);

    if (!isValidUserId(userId)) {
      return NextResponse.json({ error: 'userId inválido.' }, { status: 400 });
    }

    const messages = await getUserSearchMessages(userId, limit);
    return NextResponse.json({ user_id: userId, total: messages.length, messages });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST /api/identity/messages  Body: { userId, pages?, guilds? } — pede à fleet a busca por autor. */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { userId } = body;

  if (!isValidUserId(userId)) {
    return NextResponse.json({ error: 'userId inválido (ID numérico de usuário do Discord).' }, { status: 400 });
  }

  const result = await searchUserMessages(userId, {
    maxPagesPerGuild: Number(body.pages) > 0 ? Number(body.pages) : undefined,
    maxGuilds: Number(body.guilds) > 0 ? Number(body.guilds) : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ ok: true, data: result.data });
}
