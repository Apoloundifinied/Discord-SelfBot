import { NextResponse } from 'next/server';
import { mkdirSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { PATHS } from '@/lib/paths';
import { updateEnvFile } from '@/lib/shared';
import { getRuntimeConfig, updateRuntimeConfig } from '@/lib/runtimeConfig';
import { bootstrapSchema } from '@/lib/bootstrapSchema';

export const dynamic = 'force-dynamic';

const REMOTE_URL_RE = /^(https?:\/\/|libsql:\/\/)/;
const TABLE_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function maskKey(key) {
  if (!key || key.length < 8) return '';
  return `${key.slice(0, 10)}...${key.slice(-4)}`;
}

export async function GET() {
  const { tursoUrl, tursoAuthToken, tursoTable } = getRuntimeConfig();
  const isLocal = Boolean(tursoUrl && tursoUrl.startsWith('file:'));
  return NextResponse.json({
    url: tursoUrl,
    table: tursoTable,
    keyPreview: maskKey(tursoAuthToken),
    // Configurado = URL presente E (modo local OU token presente). URL remota
    // sem token não conta — senão o wizard pularia o banco com tudo quebrado.
    configured: Boolean(tursoUrl && (tursoAuthToken || isLocal)),
    local: isLocal,
    localDbPath: PATHS.localDbPath,
  });
}

/**
 * Body: { mode: 'local' }  OU  { url, key, table }.
 * - mode 'local' cria um SQLite em arquivo (PATHS.localDbPath) com o schema
 *   completo, sem exigir token — zero-config para o cliente.
 * - modo remoto (padrão) exige url (libsql:// ou https://) + token.
 * Em ambos os casos persiste em scraper/.env, fleet/.env e dashboard/.env.local
 * e atualiza a config em memória (sem reiniciar o servidor).
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { url, key, table, mode } = body;
  const finalTable = table || 'discord_messages';
  if (!TABLE_RE.test(finalTable)) {
    return NextResponse.json({ error: 'Nome de tabela inválido.' }, { status: 400 });
  }

  let finalUrl;
  let finalKey;

  if (mode === 'local') {
    // libsql exige barras normais em caminhos absolutos (Windows incluso).
    finalUrl = `file:${PATHS.localDbPath.replace(/\\/g, '/')}`;
    finalKey = '';
  } else {
    if (!url || !key) {
      return NextResponse.json({ error: 'url e key são obrigatórias (ou use o modo local).' }, { status: 400 });
    }
    if (!REMOTE_URL_RE.test(url)) {
      return NextResponse.json({ error: 'URL inválida. Use libsql:// ou https:// (ou o modo local).' }, { status: 400 });
    }
    finalUrl = url;
    finalKey = key;
  }

  try {
    // Cria/atualiza o schema nos DOIS modos. No local garante a pasta e cria
    // o SQLite; no remoto (Turso) garante as tabelas + colunas novas no banco
    // do cliente — que só precisa conectar URL + token, sem rodar template.
    // Idempotente (CREATE TABLE IF NOT EXISTS + ALTER TABLE só p/ colunas
    // faltantes), seguro para rodar sobre um banco já populado.
    mkdirSync(PATHS.dataDir, { recursive: true });
    const db = createClient({ url: finalUrl, authToken: finalKey || undefined });
    await bootstrapSchema(db);
    db.close();

    const updates = {
      TURSO_DATABASE_URL: finalUrl,
      TURSO_AUTH_TOKEN: finalKey,
      TURSO_TABLE: finalTable,
    };
    [PATHS.scraperEnv, PATHS.fleetEnv, PATHS.dashboardEnvLocal].forEach(file => updateEnvFile(file, updates));
    updateRuntimeConfig({ tursoUrl: finalUrl, tursoAuthToken: finalKey, tursoTable: finalTable });

    return NextResponse.json({
      ok: true,
      configured: true,
      url: finalUrl,
      local: mode === 'local',
      localDbPath: PATHS.localDbPath,
    });
  } catch (err) {
    const raw = String(err?.message ?? err);
    let message = raw;
    // Erros do Turso viram mensagens acionáveis — o cliente comum gera token
    // só-leitura sem querer, e a URL pode apontar pra um banco inexistente.
    if (/401|unauthor|authentication/i.test(raw)) {
      message = 'Token de acesso inválido ou sem permissão de escrita. Gere um token read-write no painel do Turso.';
    } else if (/403|forbidden/i.test(raw)) {
      message = 'Acesso negado pelo Turso. Verifique o token e a URL do banco.';
    } else if (/404|not found/i.test(raw)) {
      message = 'Banco não encontrado. Verifique se a URL do banco está correta.';
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
