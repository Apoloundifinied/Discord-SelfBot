'use strict';

/**
 * Motor de rastreio agendado de usuários.
 *
 * Para cada usuário em `tracked_users`, resolve a identidade (via REST),
 * compara com o snapshot anterior gravado em `identity_profiles` e:
 *   - grava mudanças em `identity_history` (nick, username, avatar, banner, bio, badges...)
 *   - grava um snapshot de presença em `identity_presence_history`
 *   - atualiza `last_checked_at`
 *
 * Uso via CLI: `node fleet/track.js` (ver track.js para subcomandos).
 */

const config = require('./config');
const { createLogger } = require('../shared/logger');
const { createTursoClient, assertValidTableName } = require('../shared/turso');
const {
  upsertTrackedUser,
  untrackUser,
  listTrackedUsers,
  markTrackedChecked,
  recordProfileChanges,
  getProfileSnapshot,
  insertPresenceSnapshot,
} = require('../shared/identityStore');
const { resolveUserIdentityRest } = require('./restIdentityResolver');

assertValidTableName(config.tursoTable);

const log = createLogger('tracker');

let dbClient;
function getDb() {
  if (!dbClient) dbClient = createTursoClient({ url: config.tursoUrl, authToken: config.tursoAuthToken });
  return dbClient;
}

/**
 * Resolve e registra o estado atual de um usuário rastreado.
 * @param {string} token Token REST válido
 * @param {string} userId ID do usuário
 * @returns {Promise<{ok: boolean, changes: Array, presence: boolean, error?: string}>}
 */
async function checkUser(token, userId) {
  const db = getDb();
  const before = await getProfileSnapshot(db, userId);

  let result;
  try {
    result = await resolveUserIdentityRest(token, userId, { source: `tracker:${userId}` });
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const after = result.profile ?? {};
  const changes = await recordProfileChanges(db, userId, before, after);
  await insertPresenceSnapshot(db, userId, result.presence);
  await markTrackedChecked(db, userId);

  return { ok: true, changes, presence: Boolean(result.presence) };
}

/**
 * Rastreia todos os usuários cujo intervalo já venceu.
 * @param {string} token Token REST válido
 * @param {{ force?: boolean }} [opts] Se force=true, ignora intervalos e checa todos.
 */
async function runTrackingPass(token, opts = {}) {
  const db = getDb();
  const tracked = await listTrackedUsers(db);
  if (!tracked.length) return [];

  const now = Date.now();
  const results = [];

  for (const user of tracked) {
    const lastMs = user.last_checked_at ? Date.parse(user.last_checked_at) : 0;
    const intervalMs = (user.interval_minutes || 60) * 60 * 1000;
    if (!opts.force && Number.isFinite(lastMs) && now - lastMs < intervalMs) continue;

    const outcome = await checkUser(token, user.user_id);
    if (outcome.ok) {
      log.success(
        `${user.user_id}: ${outcome.changes.length} mudança(s), presença ${outcome.presence ? 'capturada' : 'ausente (REST)'}.`,
      );
    } else {
      log.error(`${user.user_id}: ${outcome.error}`);
    }
    results.push({ user_id: user.user_id, ...outcome });
  }

  return results;
}

module.exports = { checkUser, runTrackingPass, upsertTrackedUser, untrackUser, listTrackedUsers };
