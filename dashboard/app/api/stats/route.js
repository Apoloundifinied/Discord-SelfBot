import { NextResponse } from 'next/server';
import { getTursoClient, getTursoTable } from '@/lib/tursoServer';
import { getRuntimeConfig } from '@/lib/runtimeConfig';

// Rota de agregações para os gráficos de atividade. Sempre dinâmica, mas com
// cache em memória de curta duração: as 5 queries agregadas rodam no Turso no
// máximo uma vez por janela de TTL por processo, em vez de a cada requisição
// (o front faz polling a cada 15s — com TTL de 30s, metade das chamadas é
// servida direto do cache).
export const dynamic = 'force-dynamic';

const STATS_TTL_MS = 30_000;

// Cache em memória do processo (módulo). A chave inclui o nome da tabela para
// invalidar automaticamente se o usuário trocar de banco/tabela pelo painel.
let statsCache = { key: null, at: 0, payload: null };

/**
 * GET /api/stats
 * Devolve agregações da tabela de mensagens:
 *   totals        -> total de mensagens, autores únicos, servidores únicos
 *   hourly        -> mensagens por hora do dia (0-23), array fixo de 24
 *   daily         -> mensagens por dia (últimos 14 dias, ordem cronológica)
 *   topChannels   -> canais com mais mensagens
 *   topAuthors    -> autores com mais mensagens
 */
export async function GET() {
  try {
    const client = getTursoClient();
    const table = getTursoTable();

    // Serve do cache se ainda estiver dentro da janela de TTL para esta tabela.
    // A chave usa URL+token+table: se o usuário trocar de banco/tabela pelo
    // painel, o cache é invalidado automaticamente.
    const { tursoUrl, tursoAuthToken } = getRuntimeConfig();
    const cacheKey = `${table}::${tursoUrl}::${tursoAuthToken ?? ''}`;
    const now = Date.now();
    if (statsCache.key === cacheKey && now - statsCache.at < STATS_TTL_MS) {
      return NextResponse.json(statsCache.payload);
    }

    const [hourlyRes, dailyRes, topChannelsRes, topAuthorsRes, totalsRes] = await Promise.all([
      client.execute({
        sql: `SELECT CAST(substr(captured_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS n
              FROM ${table} WHERE captured_at IS NOT NULL GROUP BY hour`,
      }),
      client.execute({
        sql: `SELECT substr(captured_at, 1, 10) AS day, COUNT(*) AS n
              FROM ${table} WHERE captured_at IS NOT NULL
              GROUP BY day ORDER BY day DESC LIMIT 14`,
      }),
      client.execute({
        sql: `SELECT json_extract(source_info, '$.channel_name') AS channel,
                     json_extract(source_info, '$.guild_name') AS guild,
                     COUNT(*) AS n
              FROM ${table}
              WHERE json_extract(source_info, '$.channel_name') IS NOT NULL
              GROUP BY channel, guild ORDER BY n DESC LIMIT 8`,
      }),
      client.execute({
        sql: `SELECT author_name AS author, COUNT(*) AS n
              FROM ${table} WHERE author_name IS NOT NULL GROUP BY author_name ORDER BY n DESC LIMIT 8`,
      }),
      client.execute({
        sql: `SELECT COUNT(*) AS messages,
                     COUNT(DISTINCT author_name) AS authors,
                     COUNT(DISTINCT json_extract(source_info, '$.guild_id')) AS guilds
              FROM ${table}`,
      }),
    ]);

    const totalsRow = totalsRes.rows[0] ?? {};
    const totals = {
      messages: Number(totalsRow.messages ?? 0),
      authors: Number(totalsRow.authors ?? 0),
      guilds: Number(totalsRow.guilds ?? 0),
    };

    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, n: 0 }));
    for (const row of hourlyRes.rows) {
      const hour = Number(row.hour);
      if (hour >= 0 && hour <= 23) hourly[hour].n = Number(row.n ?? 0);
    }

    const daily = dailyRes.rows
      .map(row => ({ day: String(row.day), n: Number(row.n ?? 0) }))
      .reverse(); // ordem cronológica (a query veio DESC)

    const topChannels = topChannelsRes.rows.map(row => ({
      channel: String(row.channel),
      guild: row.guild ? String(row.guild) : null,
      n: Number(row.n ?? 0),
    }));

    const topAuthors = topAuthorsRes.rows.map(row => ({
      author: String(row.author),
      n: Number(row.n ?? 0),
    }));

    const payload = { totals, hourly, daily, topChannels, topAuthors };

    statsCache = { key: cacheKey, at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
