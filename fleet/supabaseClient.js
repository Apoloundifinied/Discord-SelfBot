'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

if (!config.supabaseUrl || !config.supabaseKey) {
  throw new Error('SUPABASE_URL e/ou SUPABASE_KEY não configurados. Preencha o arquivo fleet/.env.');
}

const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false },
});

/** Insere uma única mensagem capturada em tempo real na tabela discord_messages. */
async function insertMessage(row) {
  const { error } = await supabase.from(config.supabaseTable).insert(row);
  if (error) throw new Error(`Falha ao inserir mensagem no Supabase: ${error.message}`);
}

module.exports = { supabase, insertMessage };
