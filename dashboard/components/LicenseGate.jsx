'use client';

import { useEffect, useRef, useState } from 'react';
import BrandMark from '@/components/BrandMark';

const REASON_LABELS = {
  'chave-publica-ausente': 'Este build não inclui a chave pública de licença.',
  'sem-ativacao': 'Esta instalação ainda não tem uma licença ativa.',
  'formato-invalido': 'Formato de chave inválido.',
  'versao-desconhecida': 'Versão de chave não suportada.',
  'assinatura-invalida': 'Assinatura inválida — chave adulterada ou forjada.',
  'expirada': 'A licença desta instalação expirou.',
  'maquina-diferente': 'Esta chave está vinculada a outra máquina.',
};

/**
 * Lock screen de licença — no espírito do desbloqueio de um macOS:
 * avatar central com anel de luz, campo de chave com affordance "desbloquear"
 * e o clássico shake quando a chave é rejeitada.
 */
export default function LicenseGate({ status, onActivated }) {
  const [key, setKey] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | checking | success
  const [error, setError] = useState(null);
  const [shaking, setShaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  const shakeTimerRef = useRef(null);
  const copyTimerRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      clearTimeout(shakeTimerRef.current);
      clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Chave vinculada à máquina? O cliente precisa enviar o ID desta máquina ao
  // fornecedor para ele emitir a chave com `npm run sell -- --machine <id>`.
  // Só quando `ready` (public.pem presente): em build quebrado (sem chave
  // pública) nenhuma chave validaria — o box seria enganoso.
  const machineId = status?.thisMachineId ?? null;
  const needsMachineId = status?.ready === true && status?.activated === false && machineId;

  async function copyMachineId() {
    if (!machineId) return;
    try {
      await navigator.clipboard.writeText(machineId);
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard bloqueado (ex.: contexto não seguro) — fallback: seleção manual.
      window.prompt('Copie o ID da máquina:', machineId);
    }
  }

  const reasonLabel =
    REASON_LABELS[status.reason] ??
    (status.reason ? `Licença indisponível: ${status.reason}.` : null);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!key.trim() || phase === 'checking') return;

    setPhase('checking');
    setError(null);
    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error || 'Chave rejeitada.');
        setPhase('idle');
        setShaking(true);
        clearTimeout(shakeTimerRef.current);
        shakeTimerRef.current = setTimeout(() => setShaking(false), 550);
        inputRef.current?.select();
        return;
      }
      setPhase('success');
      setTimeout(() => onActivated?.(), 950);
    } catch {
      setError('Falha de comunicação com o servidor local.');
      setPhase('idle');
      setShaking(true);
      clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = setTimeout(() => setShaking(false), 550);
    }
  }

  return (
    <main className="page">
      <div className="lock-screen" role="dialog" aria-modal="true" aria-labelledby="lock-title">
        <div className="lock-avatar" aria-hidden="true">
          <span className="lock-ring" />
          <span className="lock-monogram">
            <BrandMark size={52} />
          </span>
        </div>

        <h1 className="lock-title" id="lock-title">
          HUGGING
        </h1>
        <p className="lock-subtitle">console de inteligência · discord</p>

        <p className="lock-hint" aria-live="polite">
          {reasonLabel ?? 'Insira sua chave de licença para desbloquear.'}
        </p>

        <form className={`lock-form ${shaking ? 'lock-shake' : ''}`} onSubmit={handleSubmit}>
          <div className="lock-input-wrap">
            <span className="lock-key-glyph" aria-hidden="true">
              ⚿
            </span>
            <input
              ref={inputRef}
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="DCX1.…"
              aria-label="Chave de licença"
              autoComplete="off"
              spellCheck={false}
              disabled={phase === 'checking' || phase === 'success'}
            />
            <button
              type="submit"
              className="lock-submit"
              disabled={phase === 'checking' || !key.trim()}
              aria-label="Desbloquear"
            >
              {phase === 'checking' ? <span className="lock-spinner" /> : <span className="lock-arrow">→</span>}
            </button>
          </div>
        </form>

        {needsMachineId && (
          <div className="lock-machine">
            <p className="lock-machine-hint">
              Envie este ID ao fornecedor para receber uma chave vinculada a esta máquina:
            </p>
            <div className="lock-machine-row">
              <code className="lock-machine-id">{machineId}</code>
              <button type="button" className="lock-machine-copy" onClick={copyMachineId}>
                {copied ? 'copiado ✓' : 'copiar'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="lock-error" role="alert">
            {error}
          </p>
        )}
        {phase === 'checking' && <p className="lock-status">verificando assinatura…</p>}
        {phase === 'success' && <p className="lock-status lock-status-ok">desbloqueado ✓</p>}

        <p className="lock-foot">ativação local · nenhum dado sai da sua máquina</p>
      </div>
    </main>
  );
}
