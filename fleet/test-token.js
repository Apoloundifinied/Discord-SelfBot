'use strict';

/**
 * CLI de teste de token — valida um token de usuário contra GET /users/@me
 * usando o layer HTTP da lib discord.js-selfbot-v13 (o fetch puro do Node
 * recebe 401 falso do Cloudflare na frente do Discord).
 *
 * Uso:
 *   node fleet/test-token.js <token>
 *   node fleet/test-token.js --token=MTM...
 *   TOKEN_TO_TEST=MTM... node fleet/test-token.js
 *
 * Imprime UMA linha JSON no stdout (ok/status/user|error) — nada de logs
 * humanos, para o dashboard poder parsear direto. Logs vão para o stderr.
 *
 * Códigos interpretados:
 *   200 -> token válido (user no payload)
 *   401 -> revogado ou conta sinalizada
 *   429 -> rate limit — espere e tente de novo
 *   rede -> erro de rede na consulta (token pode ser válido)
 */

const { fetchMe } = require('../shared/discordRest');

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
    process.stderr.write('[test-token] Uso: node fleet/test-token.js <token>\n');
    console.log(JSON.stringify({ ok: false, status: null, error: 'Token não fornecido.' }));
    finish(1);
    return;
  }
  if (!TOKEN_FORMAT.test(token)) {
    process.stderr.write('[test-token] Token com formato inválido.\n');
    console.log(JSON.stringify({ ok: false, status: null, error: 'Formato de token inválido.' }));
    finish(1);
    return;
  }

  try {
    const user = await fetchMe(token);
    const tag = user.discriminator && user.discriminator !== '0'
      ? `${user.username}#${user.discriminator}`
      : user.username;
    console.log(
      JSON.stringify({
        ok: true,
        status: 200,
        user: {
          id: user.id,
          tag,
          username: user.username ?? null,
          global_name: user.global_name ?? null,
          avatar: user.avatar ?? null,
          premium_type: user.premium_type ?? null,
          mfa_enabled: Boolean(user.mfa_enabled),
          verified: Boolean(user.verified),
          locale: user.locale ?? null,
        },
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
