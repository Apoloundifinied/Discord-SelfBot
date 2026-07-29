import { NextResponse } from 'next/server';
import { fleetSupervisor } from '@/lib/fleetSupervisor';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(fleetSupervisor.getState());
}

/** Body: { action: "start" | "stop" } */
export async function POST(request) {
  const { action } = await request.json().catch(() => ({}));

  if (action === 'start') return NextResponse.json(fleetSupervisor.start());
  if (action === 'stop') return NextResponse.json(fleetSupervisor.stop());

  return NextResponse.json({ error: 'Ação inválida. Use "start" ou "stop".' }, { status: 400 });
}
