'use client';

import { useState } from 'react';
import { usePolledResource } from '@/hooks/usePolledResource';
import LogViewer from '@/components/LogViewer';

export default function ScraperPanel() {
  const { data: settings, refresh: refreshSettings } = usePolledResource('/api/settings/scraper', {
    intervalMs: 8000,
  });
  const { data: control, refresh: refreshControl } = usePolledResource('/api/scraper/control', {
    intervalMs: 2000,
  });
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const values = form ?? { guildIds: settings?.guildIds || '', channelIds: settings?.channelIds || '', token: '' };

  async function handleSave(event) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao salvar.');

      setFeedback({ type: 'success', message: 'Configuração salva.' });
      setForm(prev => ({ ...(prev ?? values), token: '' }));
      refreshSettings();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleControl(action) {
    setBusy(true);
    try {
      await fetch('/api/scraper/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      refreshControl();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Scraper (histórico)</h2>
      <p className="panel-hint">
        Define quais servidores/canais raspar e a conta usada para isso. Rodar aqui equivale a{' '}
        <code>npm run scrape</code>, controlado pelo painel.
      </p>

      <div className="control-row">
        <span className={`badge ${control?.running ? 'badge-ok' : 'badge-off'}`}>
          {control?.running ? `rodando (pid ${control.pid})` : 'parado'}
        </span>
        <button type="button" onClick={() => handleControl('start')} disabled={busy || control?.running}>
          Rodar agora
        </button>
        <button type="button" onClick={() => handleControl('stop')} disabled={busy || !control?.running}>
          Parar
        </button>
      </div>

      <form onSubmit={handleSave} className="form-grid">
        <label>
          IDs de servidor (separados por vírgula)
          <input
            type="text"
            value={values.guildIds}
            onChange={e => setForm({ ...values, guildIds: e.target.value })}
            placeholder="589505947702001666"
          />
        </label>
        <label>
          IDs de canal (opcional — vazio raspa o servidor inteiro)
          <input type="text" value={values.channelIds} onChange={e => setForm({ ...values, channelIds: e.target.value })} />
        </label>
        <label>
          Token da conta {settings?.hasToken ? `(atual: ${settings.tokenPreview}, deixe em branco para manter)` : ''}
          <input
            type="password"
            value={values.token}
            onChange={e => setForm({ ...values, token: e.target.value })}
            placeholder="token da conta"
          />
        </label>
        <button type="submit" disabled={busy}>
          Salvar configuração
        </button>
      </form>
      {feedback && <p className={`feedback feedback-${feedback.type}`}>{feedback.message}</p>}

      <h3>Logs</h3>
      <LogViewer logs={control?.logs} />
    </section>
  );
}
