'use client';

const STATUS_META = {
  connecting: { label: 'Conectando...', color: '#facc15' },
  live: { label: 'Ao vivo', color: '#22c55e' },
  error: { label: 'Erro de conexão', color: '#ef4444' },
};

export default function Header({ status }) {
  const meta = STATUS_META[status] ?? { label: status, color: '#94a3b8' };

  return (
    <header className="header">
      <div className="header-title">
        <h1>Void Pannel</h1>
        <p>Mensagens coletadas pela fleet / scraper, direto do Supabase</p>
      </div>
      <div className="header-status">
        <span className="status-dot" style={{ backgroundColor: meta.color }} />
        {meta.label}
      </div>
    </header>
  );
}
