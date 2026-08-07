import { NextResponse } from 'next/server';
import { existsSync, statSync } from 'node:fs';
import crypto from 'node:crypto';
import { readEnvConfig, runDiagnostics } from '@/lib/shared';
import { REPO_ROOT, PATHS } from '@/lib/paths';
import { getRuntimeConfig } from '@/lib/runtimeConfig';

export const dynamic = 'force-dynamic';

// Cache com TTL: o painel pode poliar /api/health sem disparar o teste de
// token (child process + chamada à API do Discord) a cada requisição.
// - A chave é um fingerprint da config (em memória + mtime dos arquivos):
//   salvar banco/token/licença invalida o cache na hora, sem esperar o TTL.
// - O valor armazenado é a PROMISE: requisições concorrentes no mesmo período
//   compartilham um único diagnóstico (single-flight).
const CACHE_TTL_MS = 10_000;
let cached = null; // { key, at, promise }

/** mtime do arquivo (0 se não existir) — parte do fingerprint da config. */
function fileStamp(file) {
  try {
    return existsSync(file) ? statSync(file).mtimeMs : 0;
  } catch {
    return 0;
  }
}

/** Fingerprint dos insumos do diagnóstico. Tokens entram só como hash, em memória. */
function fingerprint() {
  const runtime = getRuntimeConfig();
  const h = crypto.createHash('sha256');
  h.update(runtime.tursoUrl).update('\0');
  h.update(runtime.tursoAuthToken).update('\0');
  h.update(runtime.tursoTable).update('\0');
  // Arquivos que readEnvConfig lê: qualquer save (settings/licença) muda o mtime.
  for (const file of [PATHS.scraperEnv, PATHS.fleetEnv, PATHS.fleetAccounts, PATHS.dashboardEnvLocal, PATHS.licenseActivation]) {
    h.update(String(fileStamp(file))).update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

/**
 * GET /api/health[?fresh=1]
 * Diagnóstico consolidado da instalação (mesmo núcleo do CLI `npm run doctor`),
 * cacheado por ~10s. `?fresh=1` força um novo diagnóstico (útil para suporte).
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const forceFresh = searchParams.get('fresh') === '1';
  const key = fingerprint();
  const now = Date.now();

  if (!forceFresh && cached && cached.key === key && now - cached.at < CACHE_TTL_MS) {
    const result = await cached.promise;
    return NextResponse.json({ ...result, cached: true });
  }

  const runtime = getRuntimeConfig();
  const disk = readEnvConfig(REPO_ROOT);

  const promise = runDiagnostics({
    config: {
      tursoUrl: runtime.tursoUrl,
      tursoAuthToken: runtime.tursoAuthToken,
      tursoTable: runtime.tursoTable,
      scraperToken: disk.scraperToken,
      fleetAccounts: disk.fleetAccounts,
    },
    rootDir: REPO_ROOT,
  }).catch(err => {
    // Nunca deixar uma promise rejeitada presa no cache (o próximo request repete).
    if (cached?.promise === promise) cached = null;
    throw err;
  });
  cached = { key, at: now, promise };

  const result = await promise;
  return NextResponse.json({ ...result, cached: false });
}
