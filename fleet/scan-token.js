'use strict';

/**
 * SCAN-TOKEN — login por QR Code em modo servidor (usado pelo assistente de
 * onboarding do dashboard). Irmão do CLI scraper/get-token.js.
 *
 * Diferença do CLI: não imprime nada humano no terminal — escreve eventos
 * JSON (uma linha por evento) no arquivo passado em `--out` (ou no stdout se
 * omitido). O dashboard faz polling desse arquivo.
 *
 * Eventos (campo `type`):
 *   qr       { qr: "<dataURL>" }              QR pronto para escanear
 *   pending  { user: { id, tag } }            QR escaneado, aguardando troca
 *   finish   { token, user: {...} }           token obtido e VALIDADO via /users/@me
 *   cancel   { error }                        QR expirado ou cancelado no celular
 *   closed   { error }                        conexão do gateway fechada sem token
 *   error    { error }                        falha (rede, validação, geração do QR)
 *   timeout  { error }                        tempo esgotado (o QR expira em ~2 min)
 *
 * Exit code: 0 = sucesso/esperado; 1 = falha. Timeout rígido de 150s — o
 * processo nunca fica órfão por muito tempo.
 */

// Qualquer falha — inclusive DURANTE o carregamento dos módulos abaixo — vira
// um evento de erro VISÍVEL (com o motivo) em vez de o processo morrer em
// silêncio e o painel mostrar só "encerrou inesperadamente" sem pista nenhuma.
// Por isso os handlers vêm ANTES dos requires: se faltar uma dependência no
// pacote (ex.: Cannot find module 'debug'), o require lança e este handler
// captura com a mensagem real.
let finished = false;
let ws = null;

function emit(evt) {
  const line = JSON.stringify({ ...evt, at: new Date().toISOString() });
  if (OUT) {
    try {
      fs.appendFileSync(OUT, line + '\n');
    } catch {
      /* diretório removido — segue sem gravar */
    }
  } else {
    console.log(line);
  }
}

// O exit imediato dispara o crash "UV_HANDLE_CLOSING" no Windows (libuv)
// enquanto o websocket ainda está fechando. Um pequeno atraso resolve.
function exit(code) {
  if (finished) return;
  finished = true;
  try {
    ws?.destroy();
  } catch {
    /* já fechado */
  }
  setTimeout(() => process.exit(code), 100);
}

process.on('uncaughtException', err => {
  emit({ type: 'error', error: `Falha inesperada: ${err?.message ?? err}` });
  exit(1);
});
process.on('unhandledRejection', err => {
  emit({ type: 'error', error: `Falha inesperada: ${err?.message ?? err}` });
  exit(1);
});

const fs = require('node:fs');
const QRCode = require('qrcode');
const DiscordAuthWebsocket = require('discord.js-selfbot-v13/src/util/RemoteAuth');
const { fetchMe } = require('../shared/discordRest');

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}$/;
const HARD_TIMEOUT_MS = 150000;

// Destino dos eventos: arquivo via --out, senão stdout (JSON puro).
const OUT = (() => {
  const idx = process.argv.indexOf('--out');
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
})();

function userTag(user) {
  return user.discriminator && user.discriminator !== '0'
    ? `${user.username}#${user.discriminator}`
    : user.username;
}

/** Valida o token contra /users/@me ANTES de entregar (igual ao CLI). */
async function handleFinish(token) {
  if (!token || typeof token !== 'string' || !TOKEN_FORMAT.test(token)) {
    emit({
      type: 'error',
      error:
        'O Discord não emitiu um token válido na troca. A conta pode exigir verificação (telefone/e-mail) ou estar sinalizada/bloqueada.',
    });
    return exit(1);
  }

  try {
    const user = await fetchMe(token);
    emit({
      type: 'finish',
      token,
      user: {
        id: user.id,
        tag: userTag(user),
        username: user.username ?? null,
        global_name: user.global_name ?? null,
        avatar: user.avatar ?? null,
        verified: Boolean(user.verified),
        mfa_enabled: Boolean(user.mfa_enabled),
      },
    });
    return exit(0);
  } catch (err) {
    const status = err?.status ?? err?.httpStatus ?? err?.code ?? null;
    emit({
      type: 'error',
      error:
        status === 429
          ? 'Rate limit do Discord (429). Aguarde alguns minutos e tente de novo.'
          : 'A API rejeitou o token emitido — a conta está sinalizada/bloqueada pelo Discord. Resolva a conta no app oficial antes de tentar de novo.',
    });
    return exit(1);
  }
}

ws = new DiscordAuthWebsocket();

ws.once('ready', async () => {
  try {
    // Fundo branco embutido: o QR precisa de contraste claro para escanear
    // (o painel é escuro).
    const qr = await QRCode.toDataURL(ws.AuthURL, {
      errorCorrectionLevel: 'L',
      margin: 2,
      width: 320,
      color: { dark: '#000000', light: '#ffffff' },
    });
    emit({ type: 'qr', qr });
  } catch (err) {
    emit({ type: 'error', error: `Falha ao gerar o QR Code: ${err.message}` });
    exit(1);
  }
});

ws.on('pending', user => {
  emit({ type: 'pending', user: { id: user?.id ?? null, tag: user ? userTag(user) : null } });
});

ws.once('finish', handleFinish);

ws.on('cancel', () => {
  emit({ type: 'cancel', error: 'QR expirado ou cancelado no celular. Gere um novo.' });
  exit(1);
});

ws.on('error', err => {
  emit({ type: 'error', error: `Erro na conexão de autenticação: ${err.message}` });
  exit(1);
});

ws.on('closed', () => {
  if (!finished) {
    emit({ type: 'closed', error: 'Conexão com o gateway de autenticação fechada sem token. Tente de novo.' });
    exit(1);
  }
});

// Timeout rígido: o QR do Discord expira em ~2 minutos.
const timeout = setTimeout(() => {
  if (!finished) {
    emit({ type: 'timeout', error: 'Tempo esgotado. Gere um novo QR Code.' });
    exit(1);
  }
}, HARD_TIMEOUT_MS);
timeout.unref?.();

ws.connect().catch(err => {
  emit({ type: 'error', error: `Falha ao iniciar a leitura: ${err.message}` });
  exit(1);
});
