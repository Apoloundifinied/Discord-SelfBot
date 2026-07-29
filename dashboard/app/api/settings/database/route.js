import { NextResponse } from 'next/server';
import { PATHS } from '@/lib/paths';
import { updateEnvFile } from '@/lib/shared';
import { getRuntimeConfig, updateRuntimeConfig } from '@/lib/runtimeConfig';

export const dynamic = 'force-dynamic';

function maskKey(key) {
  if (!key || key.length < 8) return '';
  return `${key.slice(0, 10)}...${key.slice(-4)}`;
}

export async function GET() {
  const { supabaseUrl, supabaseKey, supabaseTable } = getRuntimeConfig();
  return NextResponse.json({
    url: supabaseUrl,
    table: supabaseTable,
    keyPreview: maskKey(supabaseKey),
    configured: Boolean(supabaseUrl && supabaseKey),
  });
}

/** Body: { url, key, table }. Atualiza scraper/.env, fleet/.env e dashboard/.env.local de uma vez. */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { url, key, table } = body;

  if (!url || !key) {
    return NextResponse.json({ error: 'url e key são obrigatórios.' }, { status: 400 });
  }

  const finalTable = table || 'discord_messages';
  const updates = { SUPABASE_URL: url, SUPABASE_KEY: key, SUPABASE_TABLE: finalTable };

  try {
    [PATHS.scraperEnv, PATHS.fleetEnv, PATHS.dashboardEnvLocal].forEach(file => updateEnvFile(file, updates));
    updateRuntimeConfig({ supabaseUrl: url, supabaseKey: key, supabaseTable: finalTable });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
