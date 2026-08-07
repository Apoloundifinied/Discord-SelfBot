import { NextResponse } from 'next/server';
import { getIdentity, listRecentProfiles } from '@/lib/identityDb';
import { resolveIdentity } from '@/lib/fleetSupervisor';

export const dynamic = 'force-dynamic';

const USER_ID_RE = /^\d{17,21}$/;

function isValidUserId(userId) {
  return typeof userId === 'string' && USER_ID_RE.test(userId);
}

/**
 * GET /api/identity?userId=123     -> snapshot de identidade de um usuário
 * GET /api/identity                -> últimos perfis resolvidos
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (userId) {
      if (!isValidUserId(userId)) {
        return NextResponse.json({ error: 'userId inválido.' }, { status: 400 });
      }
      const identity = await getIdentity(userId);
      if (!identity.profile) {
        return NextResponse.json({ error: 'Identidade não encontrada para este usuário.' }, { status: 404 });
      }
      return NextResponse.json(identity);
    }

    return NextResponse.json({ recent: await listRecentProfiles() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST /api/identity  Body: { userId } — pede à fleet que resolva e persista a identidade. */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { userId } = body;

  if (!isValidUserId(userId)) {
    return NextResponse.json({ error: 'userId inválido (ID numérico de usuário do Discord).' }, { status: 400 });
  }

  const result = await resolveIdentity(userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ ok: true, data: result.data });
}
