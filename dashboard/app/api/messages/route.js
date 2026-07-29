import { NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseTable } from '@/lib/supabaseServer';

// Nunca tentar gerar essa rota estaticamente no build — ela sempre consulta o
// Supabase em tempo real, a cada requisição.
export const dynamic = 'force-dynamic';

/**
 * GET /api/messages            -> últimas `limit` mensagens (mais novas primeiro)
 * GET /api/messages?after=123  -> mensagens com id > 123 (mais antigas primeiro),
 *                                  usado pelo front-end para fazer polling incremental
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const after = searchParams.get('after');
  const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);

  try {
    const supabase = getSupabaseServerClient();
    let query = supabase.from(getSupabaseTable()).select('*');

    if (after) {
      query = query.gt('id', Number(after)).order('id', { ascending: true }).limit(limit);
    } else {
      query = query.order('id', { ascending: false }).limit(limit);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ messages: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
