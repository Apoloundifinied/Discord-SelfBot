import { createClient } from '@supabase/supabase-js';
import { getRuntimeConfig } from '@/lib/runtimeConfig';

// Cliente Supabase usado APENAS no servidor (rotas de API do Next.js).
// A chave é secreta e nunca deve ser exposta ao navegador — por isso não tem o
// prefixo NEXT_PUBLIC_ e só é lida aqui, nunca por um componente client-side.
let cachedClient = null;
let cachedKey = null;

export function getSupabaseServerClient() {
  const { supabaseUrl, supabaseKey } = getRuntimeConfig();
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Banco de dados não configurado. Vá em "Banco de Dados" no painel e salve a URL/chave do Supabase.');
  }

  const cacheKey = `${supabaseUrl}::${supabaseKey}`;
  if (!cachedClient || cachedKey !== cacheKey) {
    cachedClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    cachedKey = cacheKey;
  }

  return cachedClient;
}

export function getSupabaseTable() {
  return getRuntimeConfig().supabaseTable;
}
