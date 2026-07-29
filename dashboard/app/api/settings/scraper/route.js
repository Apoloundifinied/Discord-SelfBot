import { NextResponse } from 'next/server';
import { PATHS } from '@/lib/paths';
import { parseEnvFile, updateEnvFile } from '@/lib/shared';

export const dynamic = 'force-dynamic';

function maskToken(token) {
  if (!token || token.length < 8) return '';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

export async function GET() {
  const env = parseEnvFile(PATHS.scraperEnv);
  return NextResponse.json({
    guildIds: env.GUILD_IDS || '',
    channelIds: env.CHANNEL_IDS || '',
    tokenPreview: maskToken(env.DISCORD_TOKEN),
    hasToken: Boolean(env.DISCORD_TOKEN),
  });
}

/** Body: { guildIds, channelIds, token }. `token` é opcional — se vazio, mantém o atual. */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { guildIds, channelIds, token } = body;

  const updates = {};
  if (guildIds !== undefined) updates.GUILD_IDS = guildIds;
  if (channelIds !== undefined) updates.CHANNEL_IDS = channelIds;
  if (token) updates.DISCORD_TOKEN = token;

  try {
    updateEnvFile(PATHS.scraperEnv, updates);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
