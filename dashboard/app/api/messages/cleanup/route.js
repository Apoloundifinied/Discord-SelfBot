import { NextResponse } from 'next/server';
import { getTursoClient, getTursoTable } from '@/lib/tursoServer';
import { getRuntimeConfig } from '@/lib/runtimeConfig';

export const dynamic = 'force-dynamic';

// Cache em memória do processo (módulo): o painel faz polling de 10s, mas o
// resumo só muda quando o scraper/fleet grava. TTL curto evita GROUP BY em
// tabela inteira a cada requisição. A chave inclui tabela+URL+token para
// invalidar sozinho quando o banco muda pelo painel.
const SUMMARY_TTL_MS = 30_000;
let summaryCache = { key: null, at: 0, payload: null };

/**
 * GET /api/messages/cleanup
 *   Devolve resumo da tabela de mensagens para a UI de controle:
 *   { total, guilds: [{guild_id, guild_name, count}], channels: [{channel_id, channel_name, guild_name, count}] }
 */
export async function GET() {
  try {
    const client = getTursoClient();
    const table = getTursoTable();

    const { tursoUrl, tursoAuthToken } = getRuntimeConfig();
    const cacheKey = `${table}::${tursoUrl}::${tursoAuthToken ?? ''}`;
    const now = Date.now();
    if (summaryCache.key === cacheKey && now - summaryCache.at < SUMMARY_TTL_MS) {
      return NextResponse.json(summaryCache.payload);
    }

    const [totalRes, guildsRes, channelsRes] = await Promise.all([
      client.execute({ sql: `SELECT COUNT(*) AS n FROM ${table}` }),
      client.execute({
        sql: `SELECT json_extract(source_info, '$.guild_id') AS guild_id,
                     json_extract(source_info, '$.guild_name') AS guild_name,
                     COUNT(*) AS n
              FROM ${table}
              WHERE json_extract(source_info, '$.guild_id') IS NOT NULL
              GROUP BY guild_id, guild_name
              ORDER BY n DESC
              LIMIT 200`,
      }),
      client.execute({
        sql: `SELECT json_extract(source_info, '$.channel_id') AS channel_id,
                     json_extract(source_info, '$.channel_name') AS channel_name,
                     json_extract(source_info, '$.guild_name') AS guild_name,
                     COUNT(*) AS n
              FROM ${table}
              WHERE json_extract(source_info, '$.channel_id') IS NOT NULL
              GROUP BY channel_id, channel_name, guild_name
              ORDER BY n DESC
              LIMIT 500`,
      }),
    ]);

    const guilds = guildsRes.rows
      .filter(row => row.guild_id != null)
      .map(row => ({
        guild_id: String(row.guild_id),
        guild_name: row.guild_name ? String(row.guild_name) : null,
        count: Number(row.n ?? 0),
      }));

    const channels = channelsRes.rows
      .filter(row => row.channel_id != null)
      .map(row => ({
        channel_id: String(row.channel_id),
        channel_name: row.channel_name ? String(row.channel_name) : null,
        guild_name: row.guild_name ? String(row.guild_name) : null,
        count: Number(row.n ?? 0),
      }));

    const payload = {
      total: Number(totalRes.rows[0]?.n ?? 0),
      guilds,
      channels,
    };
    summaryCache = { key: cacheKey, at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Invalida o cache de resumo após um DELETE (usado internamente pelo POST). */
function invalidateSummary() {
  summaryCache = { key: null, at: 0, payload: null };
}

/**
 * POST /api/messages/cleanup  Body: { scope, guildId?, channelId? }
 *   scope: "all"            -> apaga TODAS as mensagens da tabela
 *   scope: "guild"          -> apaga mensagens de um servidor (json guild_id)
 *   scope: "channel"        -> apaga mensagens de um canal (json channel_id)
 *
 * Requer { confirm: true } para executar — evita apagar por engano via GET/curl.
 * Devolve { deleted } com o número de linhas removidas.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { scope, guildId, channelId, confirm } = body;

    if (confirm !== true) {
      return NextResponse.json({ error: 'Confirmação necessária: envie { confirm: true }.' }, { status: 400 });
    }
    if (!['all', 'guild', 'channel'].includes(scope)) {
      return NextResponse.json({ error: 'scope inválido. Use "all", "guild" ou "channel".' }, { status: 400 });
    }
    if (scope === 'guild' && !/^\d{17,21}$/.test(String(guildId ?? ''))) {
      return NextResponse.json({ error: 'guildId inválido (ID numérico de servidor).' }, { status: 400 });
    }
    if (scope === 'channel' && !/^\d{17,21}$/.test(String(channelId ?? ''))) {
      return NextResponse.json({ error: 'channelId inválido (ID numérico de canal).' }, { status: 400 });
    }

    const client = getTursoClient();
    const table = getTursoTable();

    let result;
    if (scope === 'all') {
      result = await client.execute({ sql: `DELETE FROM ${table}` });
    } else if (scope === 'guild') {
      result = await client.execute({
        sql: `DELETE FROM ${table} WHERE json_extract(source_info, '$.guild_id') = ?`,
        args: [String(guildId)],
      });
    } else {
      result = await client.execute({
        sql: `DELETE FROM ${table} WHERE json_extract(source_info, '$.channel_id') = ?`,
        args: [String(channelId)],
      });
    }

    invalidateSummary(); // o resumo mudou — o próximo GET recalcula
    return NextResponse.json({ ok: true, deleted: Number(result.rowsAffected ?? 0), scope });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
