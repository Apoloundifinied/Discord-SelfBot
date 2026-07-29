'use client';

import { useMemo } from 'react';

function countLastMinute(messages) {
  const cutoff = Date.now() - 60_000;
  return messages.filter(m => new Date(m.captured_at).getTime() >= cutoff).length;
}

export default function StatsBar({ messages }) {
  const stats = useMemo(
    () => ({
      total: messages.length,
      authors: new Set(messages.map(m => m.author_name)).size,
      guilds: new Set(messages.map(m => m.source_info?.guild_id).filter(Boolean)).size,
      perMinute: countLastMinute(messages),
    }),
    [messages],
  );

  return (
    <section className="stats-bar">
      <Stat label="Mensagens carregadas" value={stats.total} />
      <Stat label="Autores únicos" value={stats.authors} />
      <Stat label="Servidores" value={stats.guilds} />
      <Stat label="Msgs/min (agora)" value={stats.perMinute} />
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
