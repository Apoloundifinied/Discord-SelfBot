'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

if (!config.supabaseUrl || !config.supabaseKey) {
  throw new Error(
    'SUPABASE_URL e/ou SUPABASE_KEY não configurados. Preencha o arquivo scraper/.env (veja scraper/.env.example).',
  );
}

const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false },
});

/**
 * Insere um lote de mensagens na tabela `discord_messages`.
 * @param {Array<{author_name: string, message_content: string|null, source_info: object}>} rows
 */
async function insertMessages(rows) {
  if (!rows.length) return;

  const { error } = await supabase.from(config.supabaseTable).insert(rows);

  if (error) {
    throw new Error(`Falha ao inserir mensagens no Supabase: ${error.message}`);
  }
}

module.exports = { supabase, insertMessages };
