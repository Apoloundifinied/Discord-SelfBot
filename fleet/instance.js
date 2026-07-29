'use strict';

/**
 * Processo filho que representa UMA instância/conta do Discord.
 *
 * Papel desta instância (conforme o diagrama):
 * - Ouvir um ou mais servidores dos quais a conta JÁ é membro (GUILD_IDS),
 *   ou, opcionalmente, tentar entrar via convite (GUILD_INVITE, modo legado)
 * - Ficar "recolhendo" as mensagens que chegam nesses servidores em tempo real
 * - Mandar cada mensagem (conteúdo + autor) para o banco de dados (Supabase)
 * - Se o Discord acusar a conta como banida/bloqueada (401/403), o processo
 *   se mata sozinho, para o manager parar de usar essa conta.
 *
 * Este arquivo NUNCA deve ser executado diretamente: ele espera receber o
 * token via mensagem IPC do processo pai (fleet/manager.js), em vez de lê-lo
 * de variáveis de ambiente/argv, para não deixá-lo visível em `ps`/`env`.
 */

const { Client } = require('../src/index');
const config = require('./config');
const { insertMessage } = require('./supabaseClient');
const { randomDelay } = require('../shared/utils');

let client = null;
let label = 'instância';
const targetGuildIds = new Set();
let shuttingDown = false;

function send(type, payload = {}) {
  if (process.send) process.send({ type, label, ...payload });
}

/** Classifica um erro para decidir se a conta deve ser considerada "banida/bloqueada". */
function isBannedError(err) {
  const status = err?.httpStatus ?? err?.status ?? err?.code;
  // 401: token inválido/revogado (conta desconectada ou banida)
  // 403: acesso proibido — tratado aqui como sinal de bloqueio/restrição da conta
  return status === 401 || status === 403;
}

/**
 * O Discord pode exigir resolver um hCaptcha para aceitar um convite (comportamento
 * anti-automação). A lib não tem um solver configurado por padrão, então não há como
 * entrar automaticamente nesse caso: ficar reiniciando o processo não resolve nada.
 */
function needsCaptcha(err) {
  return String(err?.message ?? '').includes('CAPTCHA_SOLVER_NOT_IMPLEMENTED');
}

const EXIT_CODES = { banned: 2, 'needs-manual-join': 3, crashed: 1 };

async function fail(err, { banned = false } = {}) {
  if (shuttingDown) return;
  shuttingDown = true;

  let reason = banned || isBannedError(err) ? 'banned' : 'crashed';
  if (!banned && needsCaptcha(err)) reason = 'needs-manual-join';
  send(reason, { message: err?.message ?? String(err) });

  try {
    await client?.destroy();
  } finally {
    process.exit(EXIT_CODES[reason]);
  }
}

async function main({ token }) {
  client = new Client();

  client.on('error', err => fail(err));

  client.on('guildCreate', guild => {
    // Detecta em tempo real quando a conta entra em um novo servidor (ex.: você
    // entrou manualmente enquanto a fleet já estava rodando). Se esse servidor
    // estiver na lista GUILD_IDS, passa a escutá-lo sem precisar reiniciar.
    if (config.guildIds.includes(guild.id) && !targetGuildIds.has(guild.id)) {
      targetGuildIds.add(guild.id);
      send('joined', { guild: guild.name, guildIds: [...targetGuildIds] });
    }
  });

  client.on('messageCreate', async message => {
    try {
      if (!targetGuildIds.has(message.guildId)) return;
      if (config.channelIds.length && !config.channelIds.includes(message.channelId)) return;
      if (config.ignoreBots && message.author?.bot) return;

      await insertMessage({
        author_name: message.author?.tag ?? message.author?.username ?? 'unknown',
        message_content: message.content ?? '',
        source_info: {
          message_id: message.id,
          channel_id: message.channelId,
          channel_name: message.channel?.name ?? null,
          guild_id: message.guildId,
          guild_name: message.guild?.name ?? null,
          sent_at: message.createdAt?.toISOString?.() ?? null,
        },
      });
    } catch (err) {
      // Erros ao gravar uma mensagem não devem derrubar a instância inteira.
      send('warning', { message: `Falha ao salvar mensagem: ${err.message}` });
    }
  });

  client.on('ready', async () => {
    label = `${label} (${client.user.tag})`;
    send('ready', { user: client.user.tag });

    try {
      if (config.guildIds.length) {
        // Modo recomendado: só escuta servidores que a conta JÁ participa,
        // sem tentar entrar via convite (evita captcha completamente).
        const missing = [];
        for (const guildId of config.guildIds) {
          if (client.guilds.cache.has(guildId)) {
            targetGuildIds.add(guildId);
          } else {
            missing.push(guildId);
          }
        }

        if (missing.length) {
          send('warning', {
            message: `Ainda não é membro de: ${missing.join(', ')} (vai começar a escutar automaticamente se você entrar depois)`,
          });
        }

        send('listening', { guildIds: [...targetGuildIds] });
      } else if (config.guildInvite) {
        // Modo legado: tenta entrar automaticamente via convite (pode exigir captcha).
        const invite = await client.fetchInvite(config.guildInvite);

        if (client.guilds.cache.has(invite.guild.id)) {
          send('already-member', { guild: invite.guild.name });
        } else {
          // Anti-ban: espera um tempo aleatório antes de entrar, para que várias
          // contas não entrem no servidor "ao mesmo tempo".
          await randomDelay(config.minJoinDelayMs, config.maxJoinDelayMs);
          await client.acceptInvite(config.guildInvite);
          send('joined', { guild: invite.guild.name });
        }

        targetGuildIds.add(invite.guild.id);
        send('listening', { guildIds: [...targetGuildIds] });
      } else {
        throw new Error('Configure GUILD_IDS (recomendado) ou GUILD_INVITE em fleet/.env.');
      }
    } catch (err) {
      await fail(err);
    }
  });

  try {
    await client.login(token);
  } catch (err) {
    await fail(err);
  }
}

process.on('message', msg => {
  if (msg?.type === 'init') {
    label = msg.label ?? label;
    main(msg).catch(err => fail(err));
  } else if (msg?.type === 'shutdown') {
    shuttingDown = true;
    client
      ?.destroy()
      .catch(() => {})
      .finally(() => process.exit(0));
  }
});

process.on('unhandledRejection', err => fail(err));
