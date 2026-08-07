// Estado de configuração do Turso em memória. Inicializado a partir de
// dashboard/.env.local no boot, mas pode ser atualizado em tempo real pela rota
// /api/settings/database — assim não é preciso reiniciar o servidor Next.js
// para trocar de banco de dados.
let state = {
  tursoUrl: process.env.TURSO_DATABASE_URL || '',
  tursoAuthToken: process.env.TURSO_AUTH_TOKEN || '',
  tursoTable: process.env.TURSO_TABLE || 'discord_messages',
};

export function getRuntimeConfig() {
  return { ...state };
}

export function updateRuntimeConfig(partial) {
  state = { ...state, ...partial };
  return getRuntimeConfig();
}
