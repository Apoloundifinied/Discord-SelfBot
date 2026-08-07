'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Captura o token da conta via QR Code (login do app do Discord) — mesma
 * infraestrutura do onboarding: fleet/scan-token.js spawnado por /api/token/qr.
 * Ao escanear, o token é coletado, validado e APLICADO automaticamente no
 * scraper — que sincroniza a fleet e detecta os servidores da conta.
 */
export default function QrTokenPanel() {
  const [session, setSession] = useState(null);
  const [qr, setQr] = useState(null); // último evento: { type, qr?, user?, token?, error? }
  const [busy, setBusy] = useState(false); // iniciando a sessão
  const [saving, setSaving] = useState(false); // aplicando o token
  const [expiresAt, setExpiresAt] = useState(null);
  const [now, setNow] = useState(0);
  const [applied, setApplied] = useState(null); // { tag, guildCount } após sucesso
  const sessionRef = useRef(null);

  /** Encerra a sessão atual (mata o processo filho e limpa os arquivos). */
  function discardSession() {
    const active = sessionRef.current;
    if (!active) return;
    sessionRef.current = null;
    fetch(`/api/token/qr?session=${active}`, { method: 'DELETE' }).catch(() => {});
  }

  async function startScan() {
    setBusy(true);
    setQr(null);
    setExpiresAt(null);
    setApplied(null);
    try {
      const res = await fetch('/api/token/qr', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao iniciar a leitura do QR Code.');
      setSession(body.session);
    } catch (err) {
      setQr({ type: 'error', error: err.message });
    } finally {
      setBusy(false);
    }
  }

  /** Aplica o token capturado no scraper (sincroniza fleet + detecta guilds). */
  const applyToken = useCallback(async (token, user) => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao salvar o token.');
      setApplied({
        tag: user?.tag ?? user?.username ?? 'conta',
        guildCount: Array.isArray(body.detectedGuilds) ? body.detectedGuilds.length : 0,
      });
    } catch (err) {
      // O token não é exibido (segurança) e o arquivo da sessão já foi limpo —
      // o caminho é escanear de novo.
      setQr({ type: 'error', error: `Token coletado, mas não foi aplicado: ${err.message} — escaneie novamente.` });
    } finally {
      setSaving(false);
    }
  }, []);

  // Polling da sessão ativa; encerra a anterior ao trocar de sessão (ou ao desmontar).
  useEffect(() => {
    if (!session) return;
    sessionRef.current = session;
    let cancelled = false;
    let timer;

    async function poll() {
      try {
        const res = await fetch(`/api/token/qr?session=${session}`);
        const body = await res.json();
        if (cancelled || !body?.type) return;
        setQr(body);

        if (body.type === 'qr' && body.qr) {
          // O QR do Discord expira em ~2 min; contagem parte daqui.
          setExpiresAt(Date.now() + 115000);
        }

        if (body.type === 'finish' && body.token) {
          clearInterval(timer);
          setSession(null);
          applyToken(body.token, body.user);
        }
      } catch {
        /* rede instável — continua tentando */
      }
    }

    poll();
    timer = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
      discardSession();
    };
  }, [session, applyToken]);

  // Relógio da contagem regressiva do QR.
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const qrLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null;
  const qrActive = qr?.type === 'qr' || qr?.type === 'pending';
  const qrFailed = ['cancel', 'closed', 'error', 'timeout'].includes(qr?.type);

  return (
    <section className="panel">
      <h2>Token da conta por QR Code</h2>
      <p className="panel-hint">
        Escaneie com o app do Discord no celular: <strong>Configurações → Escanear QR Code</strong>.
        O token é coletado, validado e aplicado automaticamente — nada para copiar e colar.
      </p>

      {applied ? (
        <p className="feedback feedback-success qr-applied">
          Token obtido e aplicado — <strong>{applied.tag}</strong>
          {applied.guildCount > 0 &&
            ` · ${applied.guildCount} servidor(es) detectado(s) automaticamente para monitorar.`}
        </p>
      ) : (
        <div className="qr-box">
          {qr?.type === 'qr' ? (
            // QR em data URL — next/image não se aplica (sem otimização necessária).
            // eslint-disable-next-line @next/next/no-img-element
            <img className="qr-code" src={qr.qr} alt="QR Code de login do Discord" />
          ) : (
            <div className="qr-placeholder" aria-hidden="true">
              {busy || qr?.type === 'starting' ? <span className="qr-spinner" /> : 'QR'}
            </div>
          )}
        </div>
      )}

      {!applied && qr?.type === 'pending' && (
        <p className="qr-status">
          <span className="qr-pulse" />
          QR escaneado por <strong>{qr.user?.tag ?? '…'}</strong> — confirmando o login…
        </p>
      )}
      {!applied && qr?.type === 'qr' && (
        <p className="qr-status">
          <span className="qr-pulse" />
          Aguardando escaneamento…
          {qrLeft !== null && <span className="qr-countdown">expira em {qrLeft}s</span>}
        </p>
      )}
      {!applied && saving && (
        <p className="qr-status">
          <span className="qr-spinner" />
          Aplicando token na conta…
        </p>
      )}
      {!applied && qrFailed && (
        <p className="feedback feedback-error">{qr.error || 'A leitura foi interrompida. Gere um novo QR Code.'}</p>
      )}

      <div className="control-row">
        {applied ? (
          <button type="button" onClick={startScan}>
            Escanear outra conta
          </button>
        ) : (
          <button
            type="button"
            onClick={startScan}
            disabled={busy || saving || qr?.type === 'pending' || qr?.type === 'starting'}
          >
            {busy || qr?.type === 'starting'
              ? 'Conectando…'
              : qrActive
                ? 'Gerar novo QR Code'
                : 'Escanear QR Code'}
          </button>
        )}
        {!applied && (
          <span className="panel-hint">
            Prefere colar? Use a aba <em>Fleet</em> (testar token) ou <em>Scraper</em>.
          </span>
        )}
      </div>
    </section>
  );
}
