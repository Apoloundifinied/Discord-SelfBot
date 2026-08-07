'use client';

import { useCallback, useEffect, useState } from 'react';

const REASON_LABELS = {
  'chave-publica-ausente': 'Este build não inclui a chave pública de licença.',
  'sem-ativacao': 'Nenhuma chave ativada nesta instalação.',
  'formato-invalido': 'Formato de chave inválido.',
  'versao-desconhecida': 'Versão de chave não suportada.',
  'assinatura-invalida': 'Assinatura inválida — chave adulterada ou forjada.',
  'expirada': 'Esta chave expirou.',
  'maquina-diferente': 'Esta chave está vinculada a outra máquina.',
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function LicensePanel({ license, onRefresh }) {
  const [key, setKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // --- Administração do dono (isolada: só ativa onde o cofre existe) ---
  const [admin, setAdmin] = useState({ loading: true, enabled: false, keys: [] });
  const [createForm, setCreateForm] = useState({ sub: '', days: '30', features: '', bind: false });
  const [created, setCreated] = useState(null);
  const [adminBusy, setAdminBusy] = useState(false);

  const loadAdmin = useCallback(async () => {
    try {
      const res = await fetch('/api/license/admin', { cache: 'no-store' });
      const body = await res.json();
      setAdmin({ loading: false, enabled: Boolean(body.enabled), keys: body.keys ?? [], reason: body.reason });
    } catch {
      setAdmin({ loading: false, enabled: false, keys: [], reason: 'Falha ao consultar o estúdio.' });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (!cancelled) await loadAdmin();
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [loadAdmin]);

  async function handleActivate(event) {
    event.preventDefault();
    if (!key.trim()) return;
    setActivating(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      });
      const body = await res.json();
      if (!body.ok) {
        setFeedback({ type: 'error', message: body.error || 'Chave rejeitada.' });
        return;
      }
      setKey('');
      setFeedback({ type: 'success', message: 'Licença ativada com sucesso.' });
      onRefresh?.();
    } catch {
      setFeedback({ type: 'error', message: 'Falha de comunicação com o servidor local.' });
    } finally {
      setActivating(false);
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    setAdminBusy(true);
    setCreated(null);
    try {
      const res = await fetch('/api/license/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          sub: createForm.sub.trim(),
          days: Number(createForm.days),
          features: createForm.features.trim(),
          bind: createForm.bind,
        }),
      });
      const body = await res.json();
      if (!body.ok) {
        setFeedback({ type: 'error', message: body.error || 'Falha ao emitir.' });
      } else {
        setCreated(body);
        setFeedback({ type: 'success', message: 'Chave emitida.' });
        setCreateForm(prev => ({ ...prev, sub: '', features: '' }));
        loadAdmin();
      }
    } catch {
      setFeedback({ type: 'error', message: 'Falha de comunicação.' });
    } finally {
      setAdminBusy(false);
    }
  }

  async function adminAction(action, id) {
    setAdminBusy(true);
    setFeedback(null);
    try {
      const body = { action, id, ...(action === 'extend' ? { days: 30 } : {}) };
      const res = await fetch('/api/license/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      setFeedback(
        result.ok
          ? { type: 'success', message: action === 'revoke' ? 'Chave revogada.' : 'Chave estendida (+30 dias).' }
          : { type: 'error', message: result.error || 'Falha na operação.' },
      );
      loadAdmin();
    } catch {
      setFeedback({ type: 'error', message: 'Falha de comunicação.' });
    } finally {
      setAdminBusy(false);
    }
  }

  const reasonLabel = REASON_LABELS[license.reason] ?? license.reason;

  return (
    <div className="identity-area">
      {/* ---------- Estado da licença ---------- */}
      <section className="panel">
        <div className="control-row">
          <h2>Licença da instalação</h2>
          {license.valid ? (
            <span className="badge badge-ok">ATIVA</span>
          ) : license.activated ? (
            <span className="badge badge-warn">INVÁLIDA</span>
          ) : (
            <span className="badge badge-off">SEM LICENÇA</span>
          )}
          {!license.enforce && <span className="badge badge-off">enforcement desligado</span>}
        </div>

        {license.valid && (
          <ul className="detail-list">
            <li className="detail-item">
              <span className="detail-label">Cliente</span>
              <span className="detail-value">{license.subject ?? '—'}</span>
            </li>
            <li className="detail-item">
              <span className="detail-label">Expira em</span>
              <span className="detail-value">{formatDate(license.expiresAt)}</span>
            </li>
            <li className="detail-item">
              <span className="detail-label">Features</span>
              <span className="detail-value">{license.features?.length ? license.features.join(', ') : '—'}</span>
            </li>
            <li className="detail-item">
              <span className="detail-label">Vínculo de máquina</span>
              <span className="detail-value">{license.machineBound ? `sim · ${license.machineId ?? ''}` : 'livre'}</span>
            </li>
            <li className="detail-item">
              <span className="detail-label">Ativada em</span>
              <span className="detail-value">{formatDate(license.activatedAt)}</span>
            </li>
          </ul>
        )}

        {!license.valid && (
          <>
            <p className="panel-hint">{reasonLabel ?? 'Ative uma chave para liberar esta instalação.'}</p>
            <form className="form-inline" onSubmit={handleActivate}>
              <input
                type="text"
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="DCX1.…"
                spellCheck={false}
                autoComplete="off"
              />
              <button type="submit" disabled={activating || !key.trim()}>
                {activating ? 'Validando…' : 'Ativar licença'}
              </button>
            </form>
          </>
        )}

        {license.enforce && !license.valid && (
          <p className="feedback feedback-error">O painel está bloqueado até uma licença válida ser ativada.</p>
        )}

        {feedback && <p className={`feedback ${feedback.type === 'success' ? 'feedback-success' : 'feedback-error'}`}>{feedback.message}</p>}
      </section>

      {/* ---------- Administração do dono (isolada) ---------- */}
      <section className="panel">
        <h2>Administração de licenças</h2>

        {admin.loading ? (
          <p className="panel-hint">Consultando o estúdio de licenças…</p>
        ) : !admin.enabled ? (
          <p className="panel-hint">
            <strong>Campo do dono.</strong> {admin.reason ?? 'Indisponível nesta instalação.'} A emissão de chaves exige o
            cofre da chave privada (<code>licenses/private.pem.enc</code>) e a senha-mestra em{' '}
            <code>LICENSE_MASTER_PASSPHRASE</code> — nenhum dos dois existe na máquina de um cliente, então este campo
            é isolado por construção. Para o dono: <code>npm run license:init</code> cria o cofre nesta máquina.
          </p>
        ) : (
          <>
            <p className="panel-hint">
              Cofre do dono presente nesta máquina · fingerprint <code>{admin.fingerprint}</code> ·{' '}
              {admin.keys.length} chave(s) emitida(s).
            </p>

            <form className="form-grid" onSubmit={handleCreate}>
              <label>
                Cliente (email/nome)
                <input
                  type="text"
                  value={createForm.sub}
                  onChange={e => setCreateForm({ ...createForm, sub: e.target.value })}
                  placeholder="cliente@email.com"
                  required
                />
              </label>
              <label>
                Validade (dias)
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={createForm.days}
                  onChange={e => setCreateForm({ ...createForm, days: e.target.value })}
                  required
                />
              </label>
              <label>
                Features (vírgula)
                <input
                  type="text"
                  value={createForm.features}
                  onChange={e => setCreateForm({ ...createForm, features: e.target.value })}
                  placeholder="full, beta"
                />
              </label>
              <label className="form-check">
                <span>
                  <input
                    type="checkbox"
                    checked={createForm.bind}
                    onChange={e => setCreateForm({ ...createForm, bind: e.target.checked })}
                  />
                  Vincular a esta máquina
                </span>
              </label>
              <button type="submit" disabled={adminBusy}>
                {adminBusy ? 'Emitindo…' : 'Emitir chave'}
              </button>
            </form>

            {created && (
              <div className="license-created">
                <p className="feedback feedback-success">Chave emitida — copie agora (mostrada uma única vez):</p>
                <code className="license-key-text">{created.key}</code>
              </div>
            )}

            {admin.keys.length > 0 && (
              <ul className="entity-list">
                {admin.keys.map(k => (
                  <li key={k.id} className="license-key-row">
                    <span className="entity-label">{k.sub || '—'}</span>
                    <span className={`badge ${k.status === 'active' ? 'badge-ok' : 'badge-off'}`}>{k.status}</span>
                    <span className="entity-detail">exp {formatDate(k.expiresAt)}</span>
                    <span className="entity-detail">{k.features?.length ? k.features.join(',') : '—'}</span>
                    {k.machineBound && <span className="badge badge-warn">🔒 máquina</span>}
                    {k.status === 'active' && (
                      <span className="control-row">
                        <button type="button" onClick={() => adminAction('extend', k.id)} disabled={adminBusy}>
                          +30d
                        </button>
                        <button type="button" className="button-arm" onClick={() => adminAction('revoke', k.id)} disabled={adminBusy}>
                          revogar
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
