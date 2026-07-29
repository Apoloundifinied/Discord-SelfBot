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
