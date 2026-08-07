import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { PATHS, REPO_ROOT } from '@/lib/paths';
import { parseEnvFile, updateEnvFile } from '@/lib/shared';

export const dynamic = 'force-dynamic';

function maskToken(token) {
  if (!token || token.length < 8) return '';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

/** Lista os servidores da conta via child process (fleet/list-guilds.js). */
function listGuilds(token) {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [path.join(REPO_ROOT, 'fleet', 'list-guilds.js'), token],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          // Timeout/erro de spawn: segue sem guilds — o usuário ainda pode
          // configurar manualmente na aba Scraper.
          resolve({ ok: false });
          return;
        }
        try {
          const line = stdout.trim().split('\n').pop();
          resolve(JSON.parse(line));
        } catch {
          resolve({ ok: false });
        }
      },
    );
  });
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

/**
 * Body: { guildIds, channelIds, token }. `token` é opcional — se vazio, mantém o atual.
 * GUILD_IDS/CHANNEL_IDS são sincronizados também no fleet/.env: a fleet lê a
 * config de lá, então uma única fonte (a aba Scraper) alimenta os dois.
 * Quando um token é enviado e ainda não há GUILD_IDS, os servidores da conta
 * são detectados automaticamente (o cliente não precisa caçar IDs).
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { guildIds, channelIds, token } = body;

  const updates = {};
  if (guildIds !== undefined) updates.GUILD_IDS = guildIds;
  if (channelIds !== undefined) updates.CHANNEL_IDS = channelIds;
  if (token) updates.DISCORD_TOKEN = token;

  try {
    updateEnvFile(PATHS.scraperEnv, updates);

    // Fleet lê GUILD_IDS/CHANNEL_IDS do fleet/.env — mantém os dois em sincronia.
    const fleetUpdates = {};
    if (updates.GUILD_IDS !== undefined) fleetUpdates.GUILD_IDS = updates.GUILD_IDS;
    if (updates.CHANNEL_IDS !== undefined) fleetUpdates.CHANNEL_IDS = updates.CHANNEL_IDS;
    if (Object.keys(fleetUpdates).length) updateEnvFile(PATHS.fleetEnv, fleetUpdates);

    // Auto-detecção: token novo (ou trocado) sem GUILD_IDS configurado.
    let detectedGuilds = null;
    if (updates.DISCORD_TOKEN) {
      const scraperEnv = parseEnvFile(PATHS.scraperEnv);
      if (!scraperEnv.GUILD_IDS?.trim()) {
        const result = await listGuilds(updates.DISCORD_TOKEN);
        if (result.ok && Array.isArray(result.guilds) && result.guilds.length) {
          const ids = result.guilds.map(g => g.id).join(',');
          detectedGuilds = result.guilds;
          updateEnvFile(PATHS.scraperEnv, { GUILD_IDS: ids });
          updateEnvFile(PATHS.fleetEnv, { GUILD_IDS: ids });
        }
      }
    }

    return NextResponse.json({ ok: true, detectedGuilds });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
