'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function list(name) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

const config = {
  // Conta usada para ler o histórico (token de USUÁRIO, não de bot)
  discordToken: process.env.DISCORD_TOKEN,

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  supabaseTable: process.env.SUPABASE_TABLE || 'discord_messages',

  // Onde raspar: lista explícita de canais e/ou servidores inteiros
  // (quando um guildId é informado, todos os canais de texto legíveis são raspados)
  channelIds: list('CHANNEL_IDS'),
  guildIds: list('GUILD_IDS'),

  // Paginação por request (máximo permitido pelo Discord é 100)
  messagesPerRequest: Math.min(int('MESSAGES_PER_REQUEST', 100), 100),

  // Limite de mensagens raspadas por canal, POR EXECUÇÃO (proteção anti-ban).
  // 0 = sem limite (não recomendado em canais muito grandes na primeira execução)
  maxMessagesPerChannelPerRun: int('MAX_MESSAGES_PER_CHANNEL_PER_RUN', 2000),

  // Atraso (ms) entre cada requisição de página de mensagens dentro do mesmo canal.
  // Um valor aleatório entre min/max é usado a cada requisição para parecer mais humano
  // e reduzir a chance de rate limit / detecção de abuso.
  minDelayMs: int('MIN_DELAY_MS', 2500),
  maxDelayMs: int('MAX_DELAY_MS', 5500),

  // Atraso (ms) extra entre a troca de um canal para outro
  minChannelDelayMs: int('MIN_CHANNEL_DELAY_MS', 8000),
  maxChannelDelayMs: int('MAX_CHANNEL_DELAY_MS', 15000),

  // Quantas linhas inserir por chamada ao Supabase
  insertBatchSize: int('INSERT_BATCH_SIZE', 200),

  // Tentativas em caso de erro/rate limit antes de desistir do canal na execução atual
  maxRetries: int('MAX_RETRIES', 5),
};

module.exports = config;
