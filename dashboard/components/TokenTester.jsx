'use client';

import { useState } from 'react';

const STATUS_META = {
  200: { label: 'Válido', className: 'badge-ok' },
  401: { label: 'Revogado / sinalizada', className: 'badge-warn' },
  403: { label: 'Acesso negado', className: 'badge-warn' },
  429: { label: 'Rate limit', className: 'badge-warn' },
};

export default function TokenTester() {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleTest(event) {
    event.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/token/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setResult(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const meta = result ? STATUS_META[result.status] : null;

  return (
    <section className="panel">
      <h3>Testador de token</h3>
      <p className="panel-hint">
        Cole um token para saber se ele funciona antes de usar na fleet. O teste chama <code>/users/@me</code> via
        REST (atravessa o Cloudflare usando o layer HTTP da lib) e informa o estado: válido, revogado/sinalizada,
        rate limit ou erro de rede. O token não é salvo — só enviado para o teste.
      </p>
      <form onSubmit={handleTest} className="form-inline">
        <input
          type="password"
          placeholder="token da conta (ex.: MTM1...)"
          value={token}
          onChange={e => setToken(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" disabled={busy || !token.trim()}>
          {busy ? 'Testando...' : 'Testar token'}
        </button>
      </form>
      {error && <p className="feedback feedback-error">{error}</p>}
      {result && (
        <div className="control-row">
          {meta && <span className={`badge ${meta.className}`}>{meta.label}</span>}
          {result.ok && result.user && (
            <span className="status-line">
              {result.user.tag || result.user.username} · id {result.user.id}
              {result.user.verified ? ' · verificado' : ''}
              {result.user.locale ? ` · ${result.user.locale}` : ''}
            </span>
          )}
          {!result.ok && result.error && <span className="status-line">{result.error}</span>}
        </div>
      )}
    </section>
  );
}
