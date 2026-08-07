import { NextResponse } from 'next/server';
import { getTursoClient, getTursoTable } from '@/lib/tursoServer';

// Nunca tentar gerar essa rota estaticamente no build — ela sempre consulta o
// Turso em tempo real, a cada requisição.
export const dynamic = 'force-dynamic';

/**
 * GET /api/messages            -> últimas `limit` mensagens (mais novas primeiro)
 * GET /api/messages?after=123  -> mensagens com id > 123 (mais antigas primeiro),
 *                                  usado pelo front-end para fazer polling incremental
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const after = searchParams.get('after');
  const requestedLimit = Number(searchParams.get('limit')) || 100;
  const limit = Math.max(1, Math.min(requestedLimit, 500));

  try {
    const client = getTursoClient();
    const table = getTursoTable();

    let rows;
    if (after) {
      const afterId = Number(after);
      if (!Number.isSafeInteger(afterId) || afterId < 0) {
        return NextResponse.json({ error: 'Parâmetro after inválido.' }, { status: 400 });
      }
      const result = await client.execute({
        sql: `SELECT * FROM ${table} WHERE id > ? ORDER BY id ASC LIMIT ?`,
        args: [afterId, limit],
      });
      rows = result.rows;
    } else {
      const result = await client.execute({
        sql: `SELECT * FROM ${table} ORDER BY id DESC LIMIT ?`,
        args: [limit],
      });
      rows = result.rows;
    }

    // O libsql devolve source_info como texto JSON; o front espera um objeto.
    const messages = rows.map(row => ({
      ...row,
      id: Number(row.id),
      source_info: parseSourceInfo(row.source_info),
    }));

    return NextResponse.json({ messages });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function parseSourceInfo(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
