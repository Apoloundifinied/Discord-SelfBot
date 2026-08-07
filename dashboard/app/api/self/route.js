import { NextResponse } from 'next/server';
import { getSelf } from '@/lib/selfDb';
import { collectSelf } from '@/lib/fleetSupervisor';

export const dynamic = 'force-dynamic';

/**
 * GET /api/self — snapshot completo da conta dona do token (lido do Turso).
 * 404 se a coleta ainda não foi feita (ou a conta mudou).
 */
export async function GET() {
  try {
    const self = await getSelf();
    if (!self) {
      return NextResponse.json(
        { error: 'Coleta do self ainda não foi feita. Clique em "Coletar conta" ou rode: node fleet/self.js' },
        { status: 404 },
      );
    }
    return NextResponse.json(self);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST /api/self — pede à fleet que colete e persista o snapshot completo. */
export async function POST() {
  try {
    const result = await collectSelf();
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json({ ok: true, data: result.data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
