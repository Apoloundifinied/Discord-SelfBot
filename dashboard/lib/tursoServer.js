import { createClient } from '@libsql/client';
import { getRuntimeConfig } from '@/lib/runtimeConfig';

// Cliente Turso (libsql) usado APENAS no servidor (rotas de API do Next.js).
// O token é secreto e nunca deve ser exposto ao navegador — por isso não tem o
// prefixo NEXT_PUBLIC_ e só é lido aqui, nunca por um componente client-side.
let cachedClient;
let cachedKey;

export function getTursoClient() {
  const { tursoUrl, tursoAuthToken } = getRuntimeConfig();
  // SQLite local (file:) não exige token — modo zero-config para o cliente.
  const isLocal = Boolean(tursoUrl && tursoUrl.startsWith('file:'));
  if (!tursoUrl || (!isLocal && !tursoAuthToken)) {
    throw new Error('Banco de dados não configurado. Use o assistente de configuração ou a aba "Banco de Dados".');
  }

  const cacheKey = `${tursoUrl}::${tursoAuthToken}`;
  if (!cachedClient || cachedKey !== cacheKey) {
    cachedClient = createClient({
      url: tursoUrl,
      authToken: tursoAuthToken,
    });
    cachedKey = cacheKey;
  }

  return cachedClient;
}

export function getTursoTable() {
  const table = getRuntimeConfig().tursoTable;
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) throw new Error('Nome de tabela inválido.');
  return table;
}
