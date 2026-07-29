import { NextResponse } from 'next/server';
import { scraperSupervisor } from '@/lib/scraperSupervisor';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(scraperSupervisor.getState());
}

/** Body: { action: "start" | "stop" } */
export async function POST(request) {
  const { action } = await request.json().catch(() => ({}));

  if (action === 'start') return NextResponse.json(scraperSupervisor.start());
  if (action === 'stop') return NextResponse.json(scraperSupervisor.stop());

  return NextResponse.json({ error: 'Ação inválida. Use "start" ou "stop".' }, { status: 400 });
}
