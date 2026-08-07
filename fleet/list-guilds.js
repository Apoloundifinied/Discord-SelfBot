'use strict';

/**
 * CLI — lista os servidores da conta dona do token via REST.
 *
 * Usado pelo onboarding para auto-configurar o GUILD_IDS (o cliente conecta o
 * banco e cola o token; os servidores são detectados sozinhos, sem o cliente
 * ter que caçar IDs). Mesmo padrão do test-token.js: imprime UMA linha JSON no
 * stdout, logs humanos no stderr.
 *
 * Uso:
 *   node fleet/list-guilds.js <token>
 *   node fleet/list-guilds.js --token=MTM...
 *
 * Saída: { ok, guilds: [{id, name}], error? }
 *   - ok=true  -> lista de servidores que a conta participa
 *   - ok=false -> token inválido / rede / 429 (error com motivo)
 */

const { fetchMe, fetchMyGuilds } = require('../shared/discordRest');

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}$/;

// O exit imediato dispara o crash "UV_HANDLE_CLOSING" no Windows (libuv)
// enquanto o fetch ainda está fechando. Um pequeno atraso resolve.
function finish(code) {
  setTimeout(() => process.exit(code), 100);
}

function parseArgs(argv) {
  for (const arg of argv) {
    if (arg.startsWith('--token=')) return arg.slice('--token='.length);
    if (!arg.startsWith('-')) return arg;
  }
  return process.env.TOKEN_TO_TEST?.trim() || null;
}

async function main() {
  const token = parseArgs(process.argv.slice(2));
  if (!token) {
    process.stderr.write('[list-guilds] Uso: node fleet/list-guilds.js <token>\n');
    console.log(JSON.stringify({ ok: false, error: 'Token não fornecido.' }));
    finish(1);
    return;
  }
  if (!TOKEN_FORMAT.test(token)) {
    process.stderr.write('[list-guilds] Token com formato inválido.\n');
    console.log(JSON.stringify({ ok: false, error: 'Formato de token inválido.' }));
    finish(1);
    return;
  }

  try {
    // Valida o token primeiro (mesmo contrato do test-token) e só então busca
    // os servidores — evita gastar chamadas com token inválido.
    const me = await fetchMe(token);
    const guilds = await fetchMyGuilds(token);
    const list = (Array.isArray(guilds) ? guilds : [])
      .map(g => ({ id: String(g.id ?? ''), name: g.name ?? null }))
      .filter(g => g.id);
    console.log(
      JSON.stringify({
        ok: true,
        userId: me?.id ?? null,
        guilds: list,
      }),
    );
    finish(0);
  } catch (err) {
    const status = err?.status ?? err?.httpStatus ?? err?.code ?? null;
    let error = err?.message ?? String(err);
    if (status === 401) {
      error = 'Token inválido: revogado ou conta sinalizada/bloqueada pelo Discord.';
    } else if (status === 429) {
      error = 'Rate limit do Discord (429). Aguarde alguns minutos e tente de novo.';
    } else if (status === 403) {
      error = 'Acesso negado (403).';
    }
    console.log(JSON.stringify({ ok: false, status, error }));
    finish(1);
  }
}

main();
