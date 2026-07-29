// Estado de configuração do Supabase em memória. Inicializado a partir de
// dashboard/.env.local no boot, mas pode ser atualizado em tempo real pela rota
// /api/settings/database — assim não é preciso reiniciar o servidor Next.js
// para trocar de banco de dados.
let state = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_KEY || '',
  supabaseTable: process.env.SUPABASE_TABLE || 'discord_messages',
};

export function getRuntimeConfig() {
  return { ...state };
}

export function updateRuntimeConfig(partial) {
  state = { ...state, ...partial };
  return getRuntimeConfig();
}
