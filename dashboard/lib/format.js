/** Monta a URL do avatar de um usuário a partir do hash CDN. Retorna null se faltar hash. */
export function discordAvatarUrl(userId, avatarHash, size = 128) {
  if (!userId || !avatarHash) return null;
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=${size}`;
}

/** Monta a URL do banner de um usuário a partir do hash CDN. Retorna null se faltar hash. */
export function discordBannerUrl(userId, bannerHash, size = 600) {
  if (!userId || !bannerHash) return null;
  return `https://cdn.discordapp.com/banners/${userId}/${bannerHash}.png?size=${size}`;
}

/** Converte um snowflake do Discord em data ISO (epoch do Discord = 2015-01-01). */
export function discordSnowflakeToDate(id) {
  if (!id || !/^\d{17,21}$/.test(String(id))) return null;
  const n = BigInt(id);
  return new Date(Number(n >> 22n) + 1420070400000).toISOString();
}

const PUBLIC_BADGES = [
  { bit: 1 << 0, label: 'Staff do Discord' },
  { bit: 1 << 1, label: 'Dono de servidor parceiro' },
  { bit: 1 << 2, label: 'HypeSquad Events' },
  { bit: 1 << 3, label: 'Bug Hunter (Nível 1)' },
  { bit: 1 << 6, label: 'HypeSquad Bravery' },
  { bit: 1 << 7, label: 'HypeSquad Brilliance' },
  { bit: 1 << 8, label: 'HypeSquad Balance' },
  { bit: 1 << 9, label: 'Early Supporter' },
  { bit: 1 << 14, label: 'Bug Hunter (Nível 2)' },
  { bit: 1 << 16, label: 'Bot verificado' },
  { bit: 1 << 17, label: 'Desenvolvedor de bot verificado' },
  { bit: 1 << 18, label: 'Moderador certificado' },
  { bit: 1 << 22, label: 'Active Developer' },
];

/** Decodifica o bitfield de badges públicos em uma lista de rótulos legíveis. */
export function publicFlagsToBadges(publicFlags) {
  const flags = Number(publicFlags) || 0;
  if (!flags) return [];
  return PUBLIC_BADGES.filter(({ bit }) => (flags & bit) === bit).map(({ label }) => label);
}

/** Rótulo do nível de Nitro (premium_type). */
export function premiumTypeLabel(premiumType) {
  const labels = {
    1: 'Nitro Classic',
    2: 'Nitro',
    3: 'Nitro Basic',
  };
  return labels[Number(premiumType)] ?? null;
}

/** Converte cor numérica do Discord (0xRRGGBB) em #rrggbb. */
export function intToHex(colorInt) {
  const n = Number(colorInt) || 0;
  if (!n) return null;
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** Formata uma data como "há Xs/min/h/d", sem depender de bibliotecas externas. */
export function formatRelativeTime(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';

  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 5) return 'agora';
  if (diffSec < 60) return `${diffSec}s atrás`;

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}min atrás`;

  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h atrás`;

  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}d atrás`;
}
