'use client';

export default function FilterBar({ guilds, guildFilter, onGuildChange, search, onSearchChange }) {
  return (
    <section className="filter-bar">
      <select value={guildFilter} onChange={e => onGuildChange(e.target.value)}>
        <option value="all">Todos os servidores</option>
        {guilds.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Buscar por autor ou conteúdo..."
        value={search}
        onChange={e => onSearchChange(e.target.value)}
      />
    </section>
  );
}
