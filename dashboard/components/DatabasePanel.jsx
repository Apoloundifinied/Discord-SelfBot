'use client';

import { useEffect, useState } from 'react';
import { usePolledResource } from '@/hooks/usePolledResource';

export default function DatabasePanel() {
  const { data, refresh } = usePolledResource('/api/settings/database', { intervalMs: 10000 });
  const [form, setForm] = useState({ url: '', key: '', table: 'discord_messages' });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!data) return;
    setForm(prev => ({ ...prev, url: data.url || prev.url, table: data.table || prev.table }));
  }, [data]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao salvar.');

      setFeedback({ type: 'success', message: 'Banco de dados atualizado. Já em uso, sem precisar reiniciar.' });
      setForm(prev => ({ ...prev, key: '' }));
      refresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <h2>Banco de dados (Supabase)</h2>
      <p className="panel-hint">
        Usado pelo dashboard, pela fleet e pelo scraper. Ao salvar, os três são atualizados juntos e o
        dashboard passa a usar o novo banco imediatamente.
      </p>

      <div className="status-line">
        Status atual:{' '}
        {data?.configured ? (
          <span className="badge badge-ok">configurado ({data.keyPreview})</span>
        ) : (
          <span className="badge badge-warn">não configurado</span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="form-grid">
        <label>
          URL do Supabase
          <input
            type="text"
            placeholder="https://xxxx.supabase.co"
            value={form.url}
            onChange={e => setForm({ ...form, url: e.target.value })}
            required
          />
        </label>
        <label>
          Chave (secreta / service role)
          <input
            type="password"
            placeholder={data?.keyPreview ? `atual: ${data.keyPreview}` : 'sb_secret_...'}
            value={form.key}
            onChange={e => setForm({ ...form, key: e.target.value })}
            required
          />
        </label>
        <label>
          Tabela
          <input type="text" value={form.table} onChange={e => setForm({ ...form, table: e.target.value })} />
        </label>
        <button type="submit" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </form>

      {feedback && <p className={`feedback feedback-${feedback.type}`}>{feedback.message}</p>}
    </section>
  );
}
