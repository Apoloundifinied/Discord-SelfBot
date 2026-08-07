'use client';

import { useEffect, useRef, useState } from 'react';
import BrandMark from '@/components/BrandMark';

// O assistente não reexibe depois de concluído (ou se o usuário pular).
const LS_DISMISS_KEY = 'void.onboarding.dismissed';
// Preview (só o dono usa): força o assistente mesmo com tudo configurado.
const LS_PREVIEW_KEY = 'void.onboarding.preview';

const STEPS = ['Banco de dados', 'Token por QR', 'Token do Discord', 'Servidores', 'Pronto'];

export default function OnboardingGate() {
  const [state, setState] = useState('loading'); // loading | onboarding | done
  const [dbInfo, setDbInfo] = useState(null);
  const [step, setStep] = useState(0);

  // Passo 1 — banco de dados
  const [dbMode, setDbMode] = useState(null); // 'local' | 'turso'
  const [dbBusy, setDbBusy] = useState(false);
  const [dbFeedback, setDbFeedback] = useState(null);
  const [tursoUrl, setTursoUrl] = useState('');
  const [tursoKey, setTursoKey] = useState('');

  // Passo 2 — token via QR Code (login do app do Discord)
  const [qrSession, setQrSession] = useState(null);
  const [qr, setQr] = useState(null); // último evento: { type, qr?, user?, token?, error? }
  const [qrBusy, setQrBusy] = useState(false);
  const [qrExpiresAt, setQrExpiresAt] = useState(null);
  // Relógio da contagem do QR; parte de 0 e o effect do passo 1 atualiza a cada segundo.
  const [now, setNow] = useState(0);
  const qrSessionRef = useRef(null);

  // Passo 3 — token do Discord (pré-preenchido pelo QR, se escaneado)
  const [token, setToken] = useState('');
  const [tokenBusy, setTokenBusy] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [tokenFeedback, setTokenFeedback] = useState(null);
  // Servidores detectados automaticamente ao salvar o token (passo 3 → 4).
  const [detectedGuilds, setDetectedGuilds] = useState(null); // null | [] | guilds
  const [guildsInput, setGuildsInput] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [db, scraper] = await Promise.all([
          fetch('/api/settings/database').then(r => r.json()),
          fetch('/api/settings/scraper').then(r => r.json()),
        ]);
        if (cancelled) return;

        const configured = Boolean(db.configured && scraper.hasToken);
        const dismissed = localStorage.getItem(LS_DISMISS_KEY) === '1';
        const preview = localStorage.getItem(LS_PREVIEW_KEY) === '1';

        setDbInfo(db);
        setStep(Boolean(db.configured) ? 1 : 0);
        setState(!preview && (configured || dismissed) ? 'done' : 'onboarding');
      } catch {
        // Sem backend acessível: não prende a interface.
        if (!cancelled) setState('done');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- QR Code ----------

  /** Encerra a sessão de QR atual (mata o processo filho e limpa os arquivos). */
  function discardQrSession() {
    const session = qrSessionRef.current;
    if (!session) return;
    qrSessionRef.current = null;
    fetch(`/api/token/qr?session=${session}`, { method: 'DELETE' }).catch(() => {});
  }

  async function startQrScan() {
    setQrBusy(true);
    setQr(null);
    setQrExpiresAt(null);
    try {
      const res = await fetch('/api/token/qr', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao iniciar a leitura do QR Code.');
      setQrSession(body.session);
    } catch (err) {
      setQr({ type: 'error', error: err.message });
    } finally {
      setQrBusy(false);
    }
  }

  // Ao entrar no passo de QR (sem sessão ativa), já inicia o escaneamento.
  // setTimeout(0) evita setState síncrono dentro do corpo do effect.
  // GUARDA de estado: quando o assistente está dispensado/concluído, NÃO
  // auto-iniciar sessão (antes, com o banco já configurado, o step subia
  // para 1 e um scan-token.js era spawnado a cada carga do painel).
  useEffect(() => {
    if (state !== 'onboarding' || step !== 1 || qrSession || qrBusy) return;
    const t = setTimeout(startQrScan, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, state]);

  // Polling da sessão ativa; encerra a anterior ao trocar de sessão (ou ao desmontar).
  useEffect(() => {
    if (!qrSession) return;
    qrSessionRef.current = qrSession;
    let cancelled = false;
    let timer;

    async function poll() {
      try {
        const res = await fetch(`/api/token/qr?session=${qrSession}`);
        const body = await res.json();
        if (cancelled || !body?.type) return;
        setQr(body);

        if (body.type === 'qr' && body.qr) {
          // O QR do Discord expira em ~2 min; contagem parte daqui.
          setQrExpiresAt(Date.now() + 115000);
        }

        if (body.type === 'finish' && body.token) {
          // Encerra a sessão (o cleanup dispara o DELETE e apaga o arquivo com
          // o token) e para o polling — senão o evento finish seria re-lido e
          // o usuário jogado de volta ao passo do token repetidamente.
          clearInterval(timer);
          setToken(body.token);
          setTestResult({ ok: true, user: body.user });
          setQrSession(null);
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
      discardQrSession();
    };
  }, [qrSession]);

  // Avança sozinho para a aba do token depois de mostrar a confirmação.
  // Effect dedicado: o cleanup do polling (disparado pelo setQrSession(null)
  // acima) não pode cancelar este timer.
  useEffect(() => {
    if (qr?.type !== 'finish') return;
    const t = setTimeout(() => setStep(2), 1800);
    return () => clearTimeout(t);
  }, [qr?.type]);

  // Relógio da contagem regressiva do QR.
  useEffect(() => {
    if (step !== 1 || !qrExpiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step, qrExpiresAt]);

  if (state !== 'onboarding') return null;

  function finish() {
    localStorage.setItem(LS_DISMISS_KEY, '1');
    setState('done');
  }

  async function saveDatabase() {
    setDbBusy(true);
    setDbFeedback(null);
    try {
      const payload =
        dbMode === 'local'
          ? { mode: 'local' }
          : { url: tursoUrl.trim(), key: tursoKey.trim() };
      const res = await fetch('/api/settings/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao configurar o banco.');

      setDbInfo(body);
      setDbFeedback({
        type: 'success',
        message: dbMode === 'local' ? 'Banco local criado com sucesso.' : 'Banco conectado com sucesso.',
      });
      setStep(1);
    } catch (err) {
      setDbFeedback({ type: 'error', message: err.message });
    } finally {
      setDbBusy(false);
    }
  }

  async function testToken() {
    if (!token.trim()) {
      setTestResult({ ok: false, error: 'Cole o token primeiro.' });
      return;
    }
    setTokenBusy(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/token/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao testar o token.');
      setTestResult(body);
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTokenBusy(false);
    }
  }

  async function saveToken() {
    setTokenBusy(true);
    setTokenFeedback(null);
    try {
      const res = await fetch('/api/settings/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao salvar o token.');

      // Servidores detectados automaticamente: mostra para o cliente confirmar
      // (ou ajustar manualmente) antes de concluir.
      const guilds = body.detectedGuilds ?? null;
      setDetectedGuilds(guilds);
      if (Array.isArray(guilds) && guilds.length) {
        setGuildsInput(guilds.map(g => g.id).join(','));
      }

      setTokenFeedback({ type: 'success', message: 'Token salvo.' });
      setStep(3);
    } catch (err) {
      setTokenFeedback({ type: 'error', message: err.message });
    } finally {
      setTokenBusy(false);
    }
  }

  async function saveGuilds() {
    setTokenBusy(true);
    try {
      const ids = guildsInput
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .join(',');
      const res = await fetch('/api/settings/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildIds: ids }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao salvar os servidores.');
      setStep(4);
    } catch (err) {
      setTokenFeedback({ type: 'error', message: err.message });
    } finally {
      setTokenBusy(false);
    }
  }

  const qrLeft = qrExpiresAt ? Math.max(0, Math.ceil((qrExpiresAt - now) / 1000)) : null;
  const qrActive = qr?.type === 'qr' || qr?.type === 'pending';
  const qrFailed = ['cancel', 'closed', 'error', 'timeout'].includes(qr?.type);

  const stepClass = i => `onboarding-step${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`;

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Configuração inicial">
      <div className="onboarding-card">
        <header className="onboarding-head">
          <BrandMark className="onboarding-mark" size={40} />
          <span className="onboarding-kicker">configuração inicial</span>
          <h1 className="onboarding-title">Bem-vindo ao HUGGING</h1>
          <p className="onboarding-sub">
            Conecte sua base de dados e o token da sua conta do Discord. Tudo roda nesta máquina.
          </p>
          <ol className="onboarding-steps">
            {STEPS.map((label, i) => (
              <li key={label} className={stepClass(i)}>
                <span className="onboarding-step-num">{i < step ? '✓' : i + 1}</span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </header>

        {step === 0 && (
          <section className="onboarding-body">
            <div className="onboarding-cards">
                  <button
                    type="button"
                    className={`onboarding-option${dbMode === 'local' ? ' is-selected' : ''}`}
                    onClick={() => setDbMode('local')}
                    aria-pressed={dbMode === 'local'}
                  >
                    <span className="onboarding-option-tag">recomendado</span>
                    <strong>Local — arquivo neste computador</strong>
                    <span>Zero configuração. Cria um banco SQLite na pasta de dados da aplicação. Nada sai da máquina.</span>
                  </button>
                  <button
                    type="button"
                    className={`onboarding-option${dbMode === 'turso' ? ' is-selected' : ''}`}
                    onClick={() => setDbMode('turso')}
                    aria-pressed={dbMode === 'turso'}
                  >
                    <span className="onboarding-option-tag">nuvem</span>
                    <strong>Turso — banco remoto</strong>
                    <span>Para acessar os dados de várias máquinas. Exige uma URL e um token do painel do Turso.</span>
                  </button>
                </div>

                {dbMode === 'local' && (
                  <div className="onboarding-inline">
                    <p className="panel-hint">
                      Será criado o arquivo <code>void.db</code> na pasta de dados da aplicação.
                    </p>
                    <button type="button" onClick={saveDatabase} disabled={dbBusy}>
                      {dbBusy ? 'Criando banco…' : 'Criar banco local'}
                    </button>
                  </div>
                )}

                {dbMode === 'turso' && (
                  <div className="onboarding-form">
                    <label>
                      URL do banco
                      <input
                        type="text"
                        value={tursoUrl}
                        onChange={e => setTursoUrl(e.target.value)}
                        placeholder="libsql://seu-banco.turso.io"
                      />
                    </label>
                    <label>
                      Token de acesso
                      <input
                        type="password"
                        value={tursoKey}
                        onChange={e => setTursoKey(e.target.value)}
                        placeholder="eyJ…"
                      />
                    </label>
                    <button type="button" onClick={saveDatabase} disabled={dbBusy || !tursoUrl.trim() || !tursoKey.trim()}>
                      {dbBusy ? 'Conectando…' : 'Conectar banco'}
                    </button>
                  </div>
                )}
            {dbFeedback && <p className={`feedback feedback-${dbFeedback.type}`}>{dbFeedback.message}</p>}
          </section>
        )}

        {step === 1 && (
          <section className="onboarding-body">
            <p className="panel-hint">
              Abra o app do Discord no celular → <strong>Configurações → Escanear QR Code</strong> e aponte para o
              código abaixo. O token da conta é coletado e validado automaticamente — nada para copiar e colar.
            </p>

            <div className="qr-box">
              {qr?.type === 'qr' ? (
                // QR em data URL — next/image não se aplica (sem otimização necessária).
                // eslint-disable-next-line @next/next/no-img-element
                <img className="qr-code" src={qr.qr} alt="QR Code de login do Discord" />
              ) : (
                <div className="qr-placeholder" aria-hidden="true">
                  {qrBusy || qr?.type === 'starting' ? <span className="qr-spinner" /> : 'QR'}
                </div>
              )}
            </div>

            {qr?.type === 'pending' && (
              <p className="qr-status">
                <span className="qr-pulse" />
                QR escaneado por <strong>{qr.user?.tag ?? '…'}</strong> — confirmando o login…
              </p>
            )}
            {qr?.type === 'qr' && (
              <p className="qr-status">
                <span className="qr-pulse" />
                Aguardando escaneamento…
                {qrLeft !== null && <span className="qr-countdown">expira em {qrLeft}s</span>}
              </p>
            )}
            {qr?.type === 'finish' && (
              <p className="feedback feedback-success">
                Token obtido e validado — {qr.user?.tag ?? 'conta'} autenticada. Aplicando…
              </p>
            )}
            {qrFailed && <p className="feedback feedback-error">{qr.error || 'A leitura foi interrompida. Gere um novo QR Code.'}</p>}

            <div className="control-row">
              <button
                type="button"
                onClick={startQrScan}
                disabled={qrBusy || qr?.type === 'pending' || qr?.type === 'starting'}
              >
                {qrBusy || qr?.type === 'starting'
                  ? 'Conectando…'
                  : qrActive
                    ? 'Gerar novo QR Code'
                    : 'Escanear QR Code'}
              </button>
              <button
                type="button"
                className="onboarding-link"
                onClick={() => {
                  // Encerra a sessão (cleanup dispara o DELETE) e zera o state
                  // para o auto-start funcionar se o usuário voltar.
                  setQrSession(null);
                  setStep(2);
                }}
              >
                Prefiro colar o token manualmente
              </button>
            </div>

            <button
              type="button"
              className="onboarding-back"
              onClick={() => {
                setQrSession(null);
                setStep(0);
              }}
            >
              ← Voltar ao banco de dados
            </button>
          </section>
        )}

        {step === 2 && (
          <section className="onboarding-body">
            <p className="panel-hint">
              Cole o token da conta do Discord que fará a coleta. Recomendamos testar antes de salvar.
            </p>
            <div className="onboarding-form onboarding-form-token">
              <label>
                Token da conta
                <input
                  type="password"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="MTM1NTU0MTAwOTE5ODYxNjg1Nw.…"
                />
              </label>
              <div className="control-row">
                <button type="button" onClick={testToken} disabled={tokenBusy}>
                  {tokenBusy ? 'Testando…' : 'Testar token'}
                </button>
                <button type="button" onClick={saveToken} disabled={tokenBusy || !token.trim()}>
                  Salvar e continuar
                </button>
              </div>
            </div>
            {testResult && (
              <p className={`feedback feedback-${testResult.ok ? 'success' : 'error'}`}>
                {testResult.ok
                  ? `Token válido — ${testResult.user?.username ?? 'conta'} autenticada.`
                  : testResult.error || 'Token inválido.'}
              </p>
            )}
            {tokenFeedback && <p className={`feedback feedback-${tokenFeedback.type}`}>{tokenFeedback.message}</p>}
            <button
              type="button"
              className="onboarding-back"
              onClick={() => {
                setQrSession(null);
                setQr(null);
                setStep(1);
              }}
            >
              ← Voltar e escanear o QR Code
            </button>
          </section>
        )}

        {step === 3 && (
          <section className="onboarding-body">
            <p className="panel-hint">
              {Array.isArray(detectedGuilds) && detectedGuilds.length
                ? `Encontramos ${detectedGuilds.length} servidor(es) da conta. Confirme os que quer monitorar (separados por vírgula):`
                : 'Não foi possível detectar os servidores automaticamente. Cole os IDs dos servidores que quer monitorar (separados por vírgula):'}
            </p>
            <div className="onboarding-form onboarding-form-token">
              <label>
                IDs dos servidores (GUILD_IDS)
                <input
                  type="text"
                  value={guildsInput}
                  onChange={e => setGuildsInput(e.target.value)}
                  placeholder="1275557907966070915, 1275557907966070916"
                />
              </label>
              {Array.isArray(detectedGuilds) && detectedGuilds.length > 0 && (
                <ul className="guild-pick-list">
                  {detectedGuilds.map(g => (
                    <li key={g.id}>
                      <span>{g.name || '(sem nome)'}</span>
                      <code>{g.id}</code>
                    </li>
                  ))}
                </ul>
              )}
              <div className="control-row">
                <button type="button" onClick={saveGuilds} disabled={tokenBusy || !guildsInput.trim()}>
                  {tokenBusy ? 'Salvando…' : 'Salvar e continuar'}
                </button>
              </div>
            </div>
            {tokenFeedback && <p className={`feedback feedback-${tokenFeedback.type}`}>{tokenFeedback.message}</p>}
            <button
              type="button"
              className="onboarding-back"
              onClick={() => {
                setStep(2);
              }}
            >
              ← Voltar ao token
            </button>
          </section>
        )}

        {step === 4 && (
          <section className="onboarding-body">
            <div className="onboarding-done" aria-hidden="true">✓</div>
            <h2 className="onboarding-done-title">Tudo pronto</h2>
            <p className="panel-hint">
              Base conectada, token salvo e servidores configurados. O feed ao vivo, a identidade e o resto do painel já estão prontos para uso.
            </p>
            <button type="button" onClick={finish}>
              Começar a usar
            </button>
          </section>
        )}

        {step < 4 && dbInfo?.configured && (
          <footer className="onboarding-foot">
            <button type="button" className="onboarding-skip" onClick={finish}>
              Entrar no painel sem configurar
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
