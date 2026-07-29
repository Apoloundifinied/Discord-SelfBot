'use client';

import { useState } from 'react';
import { usePolledResource } from '@/hooks/usePolledResource';
import LogViewer from '@/components/LogViewer';

export default function FleetPanel() {
  const { data: control, refresh: refreshControl } = usePolledResource('/api/fleet/control', { intervalMs: 2000 });
  const { data: accountsData, refresh: refreshAccounts } = usePolledResource('/api/fleet/accounts', {
    intervalMs: 4000,
  });
  const [form, setForm] = useState({ label: '', token: '' });
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleAdd(event) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/fleet/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao adicionar conta.');

      setFeedback({ type: 'success', message: `Conta "${form.label}" adicionada.` });
      setForm({ label: '', token: '' });
      refreshAccounts();
      refreshControl();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(label) {
    await fetch(`/api/fleet/accounts?label=${encodeURIComponent(label)}`, { method: 'DELETE' });
    refreshAccounts();
    refreshControl();
  }

  async function handleControl(action) {
    setBusy(true);
    try {
      await fetch('/api/fleet/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      refreshControl();
    } finally {
      setBusy(false);
    }
  }

  const statusByLabel = new Map((control?.lastStatus?.accounts ?? []).map(a => [a.label, a.status]));

  return (
    <section className="panel">
      <h2>Fleet (instâncias/contas)</h2>
      <p className="panel-hint">
        Cada conta é uma instância que entra/escuta um servidor em tempo real. Adicionar uma conta aqui
        grava em <code>fleet/accounts.json</code> e, se a fleet já estiver rodando, sobe essa instância na
        hora, sem afetar as demais.
      </p>

      <div className="control-row">
        <span className={`badge ${control?.running ? 'badge-ok' : 'badge-off'}`}>
          {control?.running ? `rodando (pid ${control.pid})` : 'parada'}
        </span>
        <button type="button" onClick={() => handleControl('start')} disabled={busy || control?.running}>
          Iniciar fleet
        </button>
        <button type="button" onClick={() => handleControl('stop')} disabled={busy || !control?.running}>
          Parar fleet
        </button>
      </div>

      <form onSubmit={handleAdd} className="form-inline">
        <input
          type="text"
          placeholder="label (ex.: conta-03)"
          value={form.label}
          onChange={e => setForm({ ...form, label: e.target.value })}
          required
        />
        <input
          type="password"
          placeholder="token da conta"
          value={form.token}
          onChange={e => setForm({ ...form, token: e.target.value })}
          required
        />
        <button type="submit" disabled={busy}>
          Adicionar conta
        </button>
      </form>
      {feedback && <p className={`feedback feedback-${feedback.type}`}>{feedback.message}</p>}

      <ul className="entity-list">
        {(accountsData?.accounts ?? []).map(acc => (
          <li key={acc.label}>
            <span className="entity-label">{acc.label}</span>
            <span className="entity-detail">{acc.tokenPreview}</span>
            <span className="entity-status">{statusByLabel.get(acc.label) ?? '—'}</span>
            <button type="button" onClick={() => handleRemove(acc.label)}>
              Remover
            </button>
          </li>
        ))}
        {!accountsData?.accounts?.length && <li className="empty">Nenhuma conta cadastrada ainda.</li>}
      </ul>

      <h3>Logs</h3>
      <LogViewer logs={control?.logs} />
    </section>
  );
}
