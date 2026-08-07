'use strict';

/**
 * Utilitário para obter o token da conta via login por QR Code
 * (o mesmo método usado pelo app oficial do Discord em "Login por QR Code").
 *
 * Uso:
 *   node scraper/get-token.js
 *
 * Um QR Code será impresso no terminal. Escaneie com o app do Discord
 * (Configurações > Escanear QR Code) na conta que você quer usar.
 * O script valida o token contra a API do Discord ANTES de te entregar,
 * então você só copia um token que realmente funciona.
 *
 * Fluxo por trás (remote-auth):
 *   1. Conecta no gateway de auth remoto e gera um par de chaves RSA.
 *   2. O QR contém o fingerprint + chave pública.
 *   3. O celular escaneia, faz o handshake e envia os dados de login.
 *   4. O script troca o ticket por um token real (POST remote-auth/login).
 *   5. O token é validado via GET /users/@me (REST, sem abrir gateway).
 *   6. Se válido, o token é impresso para colar em fleet/accounts.json.
 *
 * Erro "An invalid token was provided." no passo 4 significa que o Discord
 * recusou emitir o token (conta exige verificação, está sinalizada, ou
 * houve rate-limit de logins) — não que você digitou algo errado.
 */

const DiscordAuthWebsocket = require('discord.js-selfbot-v13/src/util/RemoteAuth');
const { fetchMe } = require('../shared/discordRest');

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}$/;

let finished = false;
let lastScanUserId = null;

/**
 * O primeiro segmento de um token Discord é o user id em base64.
 * Decodifica e devolve o id como string, ou null se não parecer um id.
 */
function decodeTokenUserId(token) {
  try {
    const decoded = Buffer.from(token.split('.')[0], 'base64').toString('utf8');
    return /^\d{17,21}$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function cleanup(code) {
  if (finished) return;
  finished = true;
  try {
    ws.destroy();
  } catch (_) {
    // ignora — o ws pode já estar fechado
  }
  // Espera o websocket terminar de fechar antes de sair. O exit imediato
  // dispara o crash "UV_HANDLE_CLOSING" no Windows (libuv).
  setTimeout(() => process.exit(code), 100);
}

// A validação usa o layer HTTP da lib (client.api), que passa pelo Cloudflare.
// O fetch puro do Node recebe 401 falso mesmo com token válido.
async function validateToken(token) {
  const user = await fetchMe(token);
  return { status: 200, user };
}

async function handleFinish(token) {
  if (!token || typeof token !== 'string' || !TOKEN_FORMAT.test(token)) {
    console.error('\n[get-token] ERRO: o Discord não emitiu um token válido na troca.');
    console.error('Causas prováveis:');
    console.error('  1. A conta exige verificação (telefone/e-mail) ou está sinalizada/bloqueada.');
    console.error('  2. Rate-limit de logins — aguarde alguns minutos e tente de novo.');
    console.error('  3. A sessão do celular foi considerada suspeita.');
    console.error('Resolva o bloqueio no app/web oficial ANTES de tentar de novo.\n');
    return cleanup(1);
  }

  const tokenUserId = decodeTokenUserId(token);
  if (tokenUserId && lastScanUserId) {
    if (tokenUserId === lastScanUserId) {
      console.log(`[get-token] Token pertence à conta que escaneou (${tokenUserId}).`);
      console.log('[get-token] Se a validação abaixo falhar com 401, é decisão do servidor: o Discord\n' +
        '[get-token] exige verificação para sessões novas (telefone/e-mail) — a conta em si está OK.');
    } else {
      console.error(
        `[get-token] ATENÇÃO: o token embutido (${tokenUserId}) NÃO é da conta que escaneou o QR (${lastScanUserId}).\n` +
          '[get-token] Isso indica falha de descriptografia na lib — o token seria lixo, não um 401 real.',
      );
    }
  }

  console.log('[get-token] Token obtido. Validando contra a API do Discord...');
  try {
    const { status, user } = await validateToken(token);
    if (status === 200) {
      const tag = user.discriminator && user.discriminator !== '0'
        ? `${user.username}#${user.discriminator}`
        : user.username;
      console.log(`[get-token] VALIDADO com sucesso: ${tag} (id ${user.id})\n`);
      console.log(`  TOKEN: ${token}\n`);
      console.log('[get-token] Copie o token acima para fleet/accounts.json.');
      console.log('[get-token] (evite colar o token em chats/mensagens — token exposto = token queimado)');
      return cleanup(0);
    }
    console.error(`[get-token] ERRO: a API rejeitou o token (HTTP ${status}): ${user.message || ''}`);
    console.error('Isso indica que a conta está sinalizada/bloqueada pelo Discord —');
    console.error('o token é revogado no momento em que é emitido. Resolva a conta primeiro.');
    return cleanup(1);
  } catch (err) {
    const status = err?.status ?? err?.httpStatus ?? err?.code;
    if (status === 401) {
      console.error(`[get-token] ERRO: a API rejeitou o token (HTTP 401): ${err.message}`);
      console.error('Isso indica que a conta está sinalizada/bloqueada pelo Discord —');
      console.error('o token é revogado no momento em que é emitido. Resolva a conta primeiro.');
    } else if (status === 429) {
      console.error('[get-token] Rate-limit do Discord (429). Aguarde alguns minutos e tente de novo.');
    } else {
      console.error(`[get-token] ERRO de rede na validação: ${err.message}`);
      console.error('O token pode ser válido, mas a rede bloqueou a consulta. Tente de novo.');
      console.error(`\n  TOKEN: ${token}\n`);
    }
    return cleanup(1);
  }
}

const ws = new DiscordAuthWebsocket();

ws.once('ready', () => {
  console.log('[get-token] QR Code gerado — escaneie com o app do Discord:');
  console.log('[get-token] Configurações > Escanear QR Code (no celular)\n');
  ws.generateQR();
});

ws.on('pending', user => {
  lastScanUserId = user?.id ?? null;
  const tag = user.discriminator && user.discriminator !== '0'
    ? `${user.username}#${user.discriminator}`
    : user.username;
  console.log(`\n[get-token] QR escaneado por: ${tag} (id ${user.id})`);
  console.log('[get-token] Se essa NÃO for a conta desejada, cancele no celular e refaça.\n');
});

ws.once('finish', handleFinish);

ws.on('cancel', () => {
  console.error('[get-token] QR expirado ou cancelado. Execute o script de novo.');
  cleanup(1);
});

ws.on('error', err => {
  console.error(`[get-token] Erro no websocket de auth: ${err.message}`);
  cleanup(1);
});

ws.on('closed', () => {
  if (!finished) {
    console.error('[get-token] Conexão com o gateway de auth fechada sem token.');
    cleanup(1);
  }
});

ws.connect().catch(err => {
  console.error(`[get-token] Falha ao iniciar: ${err.message}`);
  cleanup(1);
});
