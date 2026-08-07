'use strict';

/**
 * Coleta do "self": snapshot completo da conta dona do token via REST.
 *
 * Percorre os endpoints não documentados da conta logada com delays entre
 * chamadas (token de usuário = rate limit restrito + risco Cloudflare) e
 * persiste tudo no Turso nas tabelas self_*. Nada aqui depende do gateway:
 * a fleet pode estar parada.
 *
 * Billing: os payment-sources são gravados como o Discord os entrega (a API
 * não expõe número completo nem CVV — só últimos 4, validade, marca, país e
 * endereço embutido quando presente). É o dado do próprio dono da conta,
 * exibido apenas no painel local.
 */

const config = require('./config');
const { createTursoClient, assertValidTableName } = require('../shared/turso');
const {
  fetchMe,
  fetchMySettings,
  fetchMyRelationships,
  fetchMyNotes,
  fetchMyChannels,
  fetchMyGuilds,
  fetchFriendSuggestions,
  fetchUserAffinities,
  fetchGuildAffinities,
  fetchMyEntitlements,
  fetchMyLibrary,
  fetchPaymentSources,
  fetchBillingCountryCode,
  DiscordApiError,
} = require('../shared/discordRest');
const {
  upsertSelfAccount,
  replaceRelationships,
  replaceNotes,
  replaceChannels,
  replaceGuilds,
  replaceAffinities,
  replaceFriendSuggestions,
  replaceEntitlements,
  replaceLibrary,
  replacePaymentSources,
} = require('../shared/selfStore');

assertValidTableName(config.tursoTable);

let dbClient;
function getDb() {
  if (!dbClient) dbClient = createTursoClient({ url: config.tursoUrl, authToken: config.tursoAuthToken });
  return dbClient;
}

const DELAY_BETWEEN_CALLS_MS = 1500; // rate limit de token de usuário é apertado
const AFFINITY_TYPES = {
  users: { kind: 'users' },
  inverseUsers: { kind: 'inverse-users' },
  guilds: { kind: 'guilds' },
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Coleta e persiste o snapshot completo da conta.
 * Cada seção é independente: uma falha (403/429/rede) anota e segue, sem
 * abortar o restante da coleta.
 * @param {string} token Token de usuário válido (REST)
 * @returns {Promise<{user_id: string, sections: object, failures: Array<{section: string, error: string}>}>}
 */
async function collectSelfRest(token) {
  const summary = {
    user_id: null,
    sections: {},
    failures: [],
  };

  const run = async (section, fn) => {
    try {
      const value = await fn();
      // Contagem honesta por formato: array = itens, objeto = chaves, scalar = 1.
      let count;
      if (Array.isArray(value)) count = value.length;
      else if (value === null || value === undefined) count = 0;
      else if (typeof value === 'object') count = Object.keys(value).length;
      else count = 1;
      summary.sections[section] = count;
      return value;
    } catch (err) {
      summary.failures.push({
        section,
        error: err instanceof DiscordApiError ? `HTTP ${err.status}` : err.message,
      });
      return null;
    }
  };

  // Ordem pensada para o retrato vir primeiro (identifica a conta) e o que é
  // mais sensível (billing) por último.
  const me = await run('account', () => fetchMe(token));
  summary.user_id = me?.id ?? null;
  await sleep(DELAY_BETWEEN_CALLS_MS);

  const settings = await run('settings', () => fetchMySettings(token));
  await sleep(DELAY_BETWEEN_CALLS_MS);

  const relationships = await run('relationships', () => fetchMyRelationships(token));
  await sleep(DELAY_BETWEEN_CALLS_MS);

  const notes = await run('notes', () => fetchMyNotes(token));
  await sleep(DELAY_BETWEEN_CALLS_MS);

  const channels = await run('channels', () => fetchMyChannels(token));
  await sleep(DELAY_BETWEEN_CALLS_MS);

  const guilds = await run('guilds', () => fetchMyGuilds(token));
  await sleep(DELAY_BETWEEN_CALLS_MS);

  const suggestions = await run('friend-suggestions', () => fetchFriendSuggestions(token));
  await sleep(DELAY_BETWEEN_CALLS_MS);

  const userAffinities = await run('affinities/users', () => fetchUserAffinities(token));
  await sleep(DELAY_BETWEEN_CALLS_MS);

  const guildAffinities = await run('affinities/guilds', () => fetchGuildAffinities(token));
  await sleep(DELAY_BETWEEN_CALLS_MS);

  const entitlements = await run('entitlements', () => fetchMyEntitlements(token));
  await sleep(DELAY_BETWEEN_CALLS_MS);

  const library = await run('library', () => fetchMyLibrary(token));
  await sleep(DELAY_BETWEEN_CALLS_MS);

  const payments = await run('billing (payment-sources)', () => fetchPaymentSources(token));
  await sleep(DELAY_BETWEEN_CALLS_MS);

  const countryCode = await run('billing/country-code', () => fetchBillingCountryCode(token));

  // Persistência — todas em batch transacional por seção.
  if (me) {
    await upsertSelfAccount(getDb(), me.id, {
      ...me,
      settings,
      billing_country: countryCode?.country_code ?? null,
    });
  }
  if (relationships) await replaceRelationships(getDb(), summary.user_id, relationships);
  if (notes) await replaceNotes(getDb(), summary.user_id, notes);
  if (channels) await replaceChannels(getDb(), summary.user_id, channels);
  if (guilds) await replaceGuilds(getDb(), summary.user_id, guilds);
  if (suggestions) await replaceFriendSuggestions(getDb(), summary.user_id, suggestions);
  if (entitlements) await replaceEntitlements(getDb(), summary.user_id, entitlements);
  if (library) await replaceLibrary(getDb(), summary.user_id, library);
  if (payments) await replacePaymentSources(getDb(), summary.user_id, payments);

  // Affinities: users vem em { user_affinities, inverse_user_affinities }.
  if (userAffinities) {
    const { user_affinities = [], inverse_user_affinities = [] } = userAffinities;
    await replaceAffinities(getDb(), summary.user_id, AFFINITY_TYPES.users.kind, user_affinities);
    await replaceAffinities(getDb(), summary.user_id, AFFINITY_TYPES.inverseUsers.kind, inverse_user_affinities);
  }
  if (guildAffinities) {
    const { guild_affinities = [] } = guildAffinities;
    await replaceAffinities(getDb(), summary.user_id, AFFINITY_TYPES.guilds.kind, guild_affinities);
  }

  return summary;
}

module.exports = { collectSelfRest };
