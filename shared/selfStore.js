'use strict';

const { assertValidTableName } = require('./turso');

// Tabelas do "self": snapshot completo da conta dona do token. Mantidas em um
// único lugar para a camada de dados nunca espalhar nomes mágicos.
const TABLES = {
  account: 'self_account',
  relationships: 'self_relationships',
  notes: 'self_notes',
  channels: 'self_channels',
  guilds: 'self_guilds',
  affinities: 'self_affinities',
  suggestions: 'self_friend_suggestions',
  entitlements: 'self_entitlements',
  library: 'self_library',
  payments: 'self_payment_sources',
};

for (const name of Object.values(TABLES)) assertValidTableName(name);

function nowIso() {
  return new Date().toISOString();
}

/** Upsert do retrato da conta (perfil oficial + settings + país de cobrança). */
async function upsertSelfAccount(client, userId, account) {
  await client.execute({
    sql: `INSERT INTO ${TABLES.account}
            (user_id, username, discriminator, global_name, avatar, banner,
             public_flags, premium_type, mfa_enabled, locale, verified, phone,
             email, created_at, settings, billing_country, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (user_id) DO UPDATE SET
            username = excluded.username,
            discriminator = excluded.discriminator,
            global_name = excluded.global_name,
            avatar = excluded.avatar,
            banner = excluded.banner,
            public_flags = excluded.public_flags,
            premium_type = excluded.premium_type,
            mfa_enabled = excluded.mfa_enabled,
            locale = excluded.locale,
            verified = excluded.verified,
            phone = excluded.phone,
            email = excluded.email,
            created_at = excluded.created_at,
            settings = excluded.settings,
            billing_country = excluded.billing_country,
            fetched_at = excluded.fetched_at`,
    args: [
      userId,
      account.username ?? null,
      account.discriminator ?? null,
      account.global_name ?? null,
      account.avatar ?? null,
      account.banner ?? null,
      account.public_flags ?? null,
      account.premium_type ?? null,
      account.mfa_enabled ? 1 : 0,
      account.locale ?? null,
      account.verified ? 1 : 0,
      account.phone ? 1 : 0,
      account.email ? 1 : 0,
      account.created_at ?? null,
      JSON.stringify(account.settings ?? {}),
      account.billing_country ?? null,
      nowIso(),
    ],
  });
}

/**
 * Substitui a lista completa de um tipo de relação da conta.
 * Estratégia "delete + insert" em batch (transacional): a lista é uma
 * fotografia do momento da coleta, substituir é mais correto que acumular.
 */
async function replaceRelationships(client, userId, list) {
  const statements = [{ sql: `DELETE FROM ${TABLES.relationships} WHERE user_id = ?`, args: [userId] }];
  for (const r of list) {      const user = r.user ?? {};
    statements.push({
      sql: `INSERT INTO ${TABLES.relationships}
              (user_id, target_user_id, username, discriminator, global_name,
               avatar, type, nickname, since)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        userId,
        String(r.id),
        user.username ?? null,
        user.discriminator ?? null,
        user.global_name ?? null,
        user.avatar ?? null,
        String(r.type ?? 'unknown'),
        r.nickname ?? null,
        r.since ?? null,
      ],
    });
  }
  await client.batch(statements);
}

/** Notas privadas: vêm como objeto { [userId]: "nota" }. Substitui o lote. */
async function replaceNotes(client, userId, notesObj) {
  const entries = Object.entries(notesObj ?? {});
  const statements = [{ sql: `DELETE FROM ${TABLES.notes} WHERE user_id = ?`, args: [userId] }];
  for (const [targetUserId, note] of entries) {
    statements.push({
      sql: `INSERT INTO ${TABLES.notes} (user_id, target_user_id, note) VALUES (?, ?, ?)`,
      args: [userId, String(targetUserId), String(note ?? '')],
    });
  }
  await client.batch(statements);
}

/** Lista de DMs ativos (nomes dos contatos, sem conteúdo). */
async function replaceChannels(client, userId, list) {
  const statements = [{ sql: `DELETE FROM ${TABLES.channels} WHERE user_id = ?`, args: [userId] }];
  for (const ch of list) {
    statements.push({
      sql: `INSERT INTO ${TABLES.channels}
              (user_id, channel_id, name, type, recipients, last_message_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        userId,
        String(ch.id),
        ch.name ?? null,
        ch.type ?? 1,
        JSON.stringify(
          (ch.recipients ?? []).map(u => ({
            id: u.id,
            username: u.username ?? null,
            global_name: u.global_name ?? null,
            avatar: u.avatar ?? null,
          })),
        ),
        ch.last_message_id ?? null,
      ],
    });
  }
  await client.batch(statements);
}

/** Servidores da conta (nome, ícone, dono, permissões). */
async function replaceGuilds(client, userId, list) {
  const statements = [{ sql: `DELETE FROM ${TABLES.guilds} WHERE user_id = ?`, args: [userId] }];
  for (const g of list) {
    statements.push({
      sql: `INSERT INTO ${TABLES.guilds}
              (user_id, guild_id, name, icon, owner, permissions)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [userId, String(g.id), g.name ?? null, g.icon ?? null, g.owner ? 1 : 0, g.permissions ?? null],
    });
  }
  await client.batch(statements);
}

/** Affinities (usuários e servidores) com ranking. */
async function replaceAffinities(client, userId, kind, list) {
  const statements = [{ sql: `DELETE FROM ${TABLES.affinities} WHERE user_id = ? AND kind = ?`, args: [userId, kind] }];
  list.forEach((item, index) => {
    const targetId = item.user_id ?? item.guild_id;
    if (!targetId) return;
    statements.push({
      sql: `INSERT INTO ${TABLES.affinities}
              (user_id, kind, target_id, score, rank, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [userId, kind, String(targetId), String(item.affinity ?? ''), index + 1, JSON.stringify(item)],
    });
  });
  await client.batch(statements);
}

/** Sugestões de amigos do algoritmo. */
async function replaceFriendSuggestions(client, userId, list) {
  const statements = [{ sql: `DELETE FROM ${TABLES.suggestions} WHERE user_id = ?`, args: [userId] }];
  for (const s of list) {
    statements.push({
      sql: `INSERT INTO ${TABLES.suggestions}
              (user_id, suggested_user_id, username, global_name, avatar,
               mutual_friends_count, data)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        userId,
        String(s.id),
        s.username ?? null,
        s.global_name ?? null,
        s.avatar ?? null,
        s.mutual_friends_count ?? null,
        JSON.stringify(s),
      ],
    });
  }
  await client.batch(statements);
}

/** Entitlements (compras/assinaturas). */
async function replaceEntitlements(client, userId, list) {
  const statements = [{ sql: `DELETE FROM ${TABLES.entitlements} WHERE user_id = ?`, args: [userId] }];
  for (const e of list) {
    statements.push({
      sql: `INSERT INTO ${TABLES.entitlements}
              (user_id, entitlement_id, sku_id, name, type, consumed)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [userId, String(e.id), e.sku_id ?? null, e.name ?? null, e.type ?? null, e.consumed ? 1 : 0],
    });
  }
  await client.batch(statements);
}

/** Biblioteca (jogos/aplicativos). */
async function replaceLibrary(client, userId, list) {
  const statements = [{ sql: `DELETE FROM ${TABLES.library} WHERE user_id = ?`, args: [userId] }];
  for (const a of list) {
    statements.push({
      sql: `INSERT INTO ${TABLES.library} (user_id, app_id, name, type) VALUES (?, ?, ?, ?)`,
      args: [userId, String(a.id), a.name ?? null, a.type ?? null],
    });
  }
  await client.batch(statements);
}

/** Métodos de pagamento — guarda o objeto completo como o Discord entrega. */
async function replacePaymentSources(client, userId, list) {
  const statements = [{ sql: `DELETE FROM ${TABLES.payments} WHERE user_id = ?`, args: [userId] }];
  for (const p of list) {
    // O Discord sempre fornece id do método de pagamento; sem id, pula a linha
    // em vez de inventar uma chave falsa.
    if (!p.id) continue;
    const address = p.billing_address ?? {};
    statements.push({
      sql: `INSERT INTO ${TABLES.payments}
              (user_id, source_id, type, brand, last4, expires_month, expires_year,
               is_default, invalid, country, nickname, data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        userId,
        String(p.id),
        p.type ?? null,
        p.brand ?? null,
        p.last_4 ?? p.last4 ?? null,
        p.expires_month ?? null,
        p.expires_year ?? null,
        p.default ? 1 : 0,
        p.invalid ? 1 : 0,
        p.country ?? address.country ?? null,
        p.nickname ?? p.name ?? null,
        JSON.stringify({
          ...p,
          billing_address: address,
        }),
      ],
    });
  }
  await client.batch(statements);
}

module.exports = {
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
  TABLES,
};
