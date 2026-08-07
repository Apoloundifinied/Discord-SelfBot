import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '@/lib/paths';

// Fontes de verdade do schema na raiz do projeto: schema.sql (mensagens,
// identidade, rastreio) + self-schema.sql (aba "Minha Conta").
// Usados para criar o banco local (file:) e para completar o banco remoto
// (Turso) do cliente — que só precisa conectar URL + token, sem rodar template.
// Os caminhos são resolvidos sob demanda (nunca no escopo do módulo) para o
// bundler do Next não avaliar caminhos durante a coleta de página.
const SCHEMA_FILES = ['schema.sql', 'self-schema.sql'];

/**
 * Lê os arquivos de schema e devolve as instruções separadas (sem comentários).
 * Os schemas usam apenas `--` em linhas próprias e não têm `;` dentro de
 * strings — a separação por `;` é determinística.
 */
export function getSchemaStatements() {
  const raw = SCHEMA_FILES.map(file => readFileSync(path.join(REPO_ROOT, 'database', file), 'utf8')).join('\n');
  const withoutComments = raw
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(';')
    .map(stmt => stmt.trim())
    .filter(Boolean);
}

// Migrações de colunas adicionadas depois da 1ª versão do schema.
// Bancos criados com schema antigo recebem ALTER TABLE automaticamente —
// o cliente conecta o banco e o painel completa as colunas sozinho.
// Chave = tabela; valor = colunas que precisam existir (e seus tipos).
const COLUMN_MIGRATIONS = {
  self_account: {
    billing_country: 'text',
  },
};

/**
 * Aplica ALTER TABLE para colunas que o código espera mas que bancos criados
 * com uma versão antiga do schema não têm (ex.: billing_country em
 * self_account). Idempotente: só adiciona a coluna se ela não existir.
 */
export async function migrateMissingColumns(client) {
  for (const [table, columns] of Object.entries(COLUMN_MIGRATIONS)) {
    let existing;
    try {
      const res = await client.execute(`PRAGMA table_info(${table})`);
      existing = new Set(res.rows.map(row => row.name));
    } catch {
      // Tabela ainda não existe — o bootstrapSchema a cria logo em seguida.
      continue;
    }
    for (const [column, type] of Object.entries(columns)) {
      if (!existing.has(column)) {
        await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      }
    }
  }
}

/** Cria o schema completo (idempotente — CREATE TABLE IF NOT EXISTS). */
export async function bootstrapSchema(client) {
  for (const stmt of getSchemaStatements()) {
    await client.execute(stmt);
  }
  await migrateMissingColumns(client);
}
