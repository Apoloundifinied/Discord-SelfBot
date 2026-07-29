'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

function list(name) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

module.exports = {
  // Supabase (mesma tabela discord_messages usada pelo scraper de histórico)
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  supabaseTable: process.env.SUPABASE_TABLE || 'discord_messages',

  // Modo recomendado: lista de IDs de servidores que as contas JÁ participam.
  // Cada instância só escuta os servidores desta lista dos quais ela já é membro
  // (nenhuma tentativa de entrar via convite, então não há risco de captcha).
  guildIds: list('GUILD_IDS'),

  // Modo legado/opcional: convite de um servidor para a conta tentar entrar
  // automaticamente caso ainda não seja membro (pode exigir captcha, que a lib
  // não resolve sozinha — use o modo GUILD_IDS acima para evitar isso).
  guildInvite: process.env.GUILD_INVITE,

  // Opcional: restringe quais canais são ouvidos (vazio = todos os visíveis no servidor)
  channelIds: list('CHANNEL_IDS'),

  // Anti-ban: espera aleatória antes de cada instância entrar no servidor,
  // evitando que várias contas entrem "ao mesmo tempo" (padrão suspeito).
  minJoinDelayMs: int('MIN_JOIN_DELAY_MS', 5000),
  maxJoinDelayMs: int('MAX_JOIN_DELAY_MS', 20000),

  // Ignorar mensagens de outros bots
  ignoreBots: bool('IGNORE_BOTS', true),

  // Gerenciamento de processos (manager.js)
  restartDelayMs: int('RESTART_DELAY_MS', 15000),
  maxRestartsPerAccount: int('MAX_RESTARTS_PER_ACCOUNT', 3),

  // Arquivo com a lista de contas (label + token)
  accountsFile: process.env.ACCOUNTS_FILE || require('path').join(__dirname, 'accounts.json'),
};
