import { getTursoClient } from '@/lib/tursoServer';

// Espelham shared/selfStore.js — snapshot completo da conta dona do token.
const ACCOUNT = 'self_account';
const RELATIONSHIPS = 'self_relationships';
const NOTES = 'self_notes';
const CHANNELS = 'self_channels';
const GUILDS = 'self_guilds';
const AFFINITIES = 'self_affinities';
const SUGGESTIONS = 'self_friend_suggestions';
const ENTITLEMENTS = 'self_entitlements';
const LIBRARY = 'self_library';
const PAYMENTS = 'self_payment_sources';

function parseJson(raw, fallback = null) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

const RELATIONSHIP_LABELS = {
  1: 'Amigo',
  2: 'Bloqueado',
  3: 'Pendente (in)',
  4: 'Pendente (out)',
};

/** Monta o snapshot completo do "self" (conta dona do token) para o painel. */
export async function getSelf() {
  const db = getTursoClient();

  const [accountRes, relRes, notesRes, chRes, guildsRes, affRes, sugRes, entRes, libRes, payRes] = await Promise.all([
    db.execute({ sql: `SELECT * FROM ${ACCOUNT} LIMIT 1` }),
    db.execute({
      sql: `SELECT target_user_id, username, discriminator, global_name, avatar, type, nickname, since
            FROM ${RELATIONSHIPS} ORDER BY since DESC LIMIT 500`,
    }),
    db.execute({ sql: `SELECT target_user_id, note FROM ${NOTES} ORDER BY note DESC LIMIT 200` }),
    db.execute({ sql: `SELECT channel_id, name, type, recipients, last_message_id FROM ${CHANNELS} LIMIT 200` }),
    db.execute({ sql: `SELECT guild_id, name, icon, owner, permissions FROM ${GUILDS} ORDER BY name COLLATE NOCASE ASC` }),
    db.execute({ sql: `SELECT kind, target_id, score, rank, data FROM ${AFFINITIES} ORDER BY kind ASC, rank ASC` }),
    db.execute({
      sql: `SELECT suggested_user_id, username, global_name, avatar, mutual_friends_count FROM ${SUGGESTIONS} LIMIT 200`,
    }),
    db.execute({ sql: `SELECT entitlement_id, sku_id, name, type, consumed FROM ${ENTITLEMENTS} LIMIT 200` }),
    db.execute({ sql: `SELECT app_id, name, type FROM ${LIBRARY} LIMIT 200` }),
    db.execute({
      sql: `SELECT source_id, type, brand, last4, expires_month, expires_year, is_default, invalid, country, nickname, data FROM ${PAYMENTS} LIMIT 50`,
    }),
  ]);

  const accountRow = accountRes.rows[0] ?? null;
  if (!accountRow) return null;

  const settings = parseJson(accountRow.settings, {});

  return {
    user_id: accountRow.user_id,
    account: {
      user_id: accountRow.user_id,
      username: accountRow.username ?? null,
      discriminator: accountRow.discriminator ?? null,
      global_name: accountRow.global_name ?? null,
      avatar: accountRow.avatar ?? null,
      banner: accountRow.banner ?? null,
      public_flags: accountRow.public_flags ?? null,
      premium_type: accountRow.premium_type ?? null,
      mfa_enabled: Boolean(accountRow.mfa_enabled),
      locale: accountRow.locale ?? null,
      verified: Boolean(accountRow.verified),
      phone: Boolean(accountRow.phone),
      email: Boolean(accountRow.email),
      created_at: accountRow.created_at ?? null,
      fetched_at: accountRow.fetched_at ?? null,
      billing_country: accountRow.billing_country ?? null,
      theme: settings.theme ?? null,
      developer_mode: Boolean(settings.developer_mode),
      status: settings.status ?? null,
      timezone_name: settings.timezone_name ?? null,
      explicit_content_filter: settings.explicit_content_filter ?? null,
      guild_folders: settings.guild_folders ?? null,
      contact_sync_enabled: Boolean(settings.contact_sync_enabled),
      custom_status: settings.custom_status ?? null,
    },
    relationships: relRes.rows.map(row => ({
      target_user_id: row.target_user_id,
      username: row.username ?? null,
      discriminator: row.discriminator ?? null,
      global_name: row.global_name ?? null,
      avatar: row.avatar ?? null,
      type: String(row.type ?? 'unknown'),
      type_label: RELATIONSHIP_LABELS[String(row.type)] ?? String(row.type ?? 'Desconhecido'),
      nickname: row.nickname ?? null,
      since: row.since ?? null,
    })),
    notes: notesRes.rows.map(row => ({
      target_user_id: row.target_user_id,
      note: row.note ?? '',
    })),
    channels: chRes.rows.map(row => ({
      channel_id: row.channel_id,
      name: row.name ?? null,
      type: row.type ?? 1,
      recipients: parseJson(row.recipients, []),
      last_message_id: row.last_message_id ?? null,
    })),
    guilds: guildsRes.rows.map(row => ({
      guild_id: row.guild_id,
      name: row.name ?? null,
      icon: row.icon ?? null,
      owner: Boolean(row.owner),
      permissions: row.permissions ?? null,
    })),
    affinities: {
      users: affRes.rows
        .filter(r => r.kind === 'users')
        .map(row => ({ target_id: row.target_id, score: Number(row.score ?? 0), rank: row.rank })),
      inverseUsers: affRes.rows
        .filter(r => r.kind === 'inverse-users')
        .map(row => ({ target_id: row.target_id, score: Number(row.score ?? 0), rank: row.rank })),
      guilds: affRes.rows
        .filter(r => r.kind === 'guilds')
        .map(row => ({ target_id: row.target_id, score: Number(row.score ?? 0), rank: row.rank })),
    },
    friend_suggestions: sugRes.rows.map(row => ({
      suggested_user_id: row.suggested_user_id,
      username: row.username ?? null,
      global_name: row.global_name ?? null,
      avatar: row.avatar ?? null,
      mutual_friends_count: row.mutual_friends_count ?? null,
    })),
    entitlements: entRes.rows.map(row => ({
      entitlement_id: row.entitlement_id,
      sku_id: row.sku_id ?? null,
      name: row.name ?? null,
      type: row.type ?? null,
      consumed: Boolean(row.consumed),
    })),
    library: libRes.rows.map(row => ({
      app_id: row.app_id,
      name: row.name ?? null,
      type: row.type ?? null,
    })),
    payment_sources: payRes.rows.map(row => {
      const data = parseJson(row.data, {});
      const billingAddress = data.billing_address ?? {};
      return {
        source_id: row.source_id,
        type: row.type ?? null,
        brand: row.brand ?? null,
        last4: row.last4 ?? null,
        expires_month: row.expires_month ?? null,
        expires_year: row.expires_year ?? null,
        is_default: Boolean(row.is_default),
        invalid: Boolean(row.invalid),
        country: row.country ?? null,
        nickname: row.nickname ?? null,
        billing_address: {
          name: billingAddress.name ?? null,
          line_1: billingAddress.line_1 ?? billingAddress.line1 ?? null,
          line_2: billingAddress.line_2 ?? billingAddress.line2 ?? null,
          city: billingAddress.city ?? null,
          state: billingAddress.state ?? null,
          postal_code: billingAddress.postal_code ?? billingAddress.postalCode ?? null,
          country: billingAddress.country ?? null,
        },
      };
    }),
  };
}
