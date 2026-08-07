'use client';

import { useHealth } from '@/hooks/useHealth';

const STATUS_META = {
  connecting: { label: 'Conectando…', color: 'var(--warning)' },
  live: { label: 'Ao vivo', color: 'var(--success)' },
  error: { label: 'Falha de conexão', color: 'var(--danger)' },
};

const LICENSE_META = {
  valid: { label: 'licença ativa', color: 'var(--success)' },
  activated: { label: 'licença inválida', color: 'var(--danger)' },
  off: { label: 'licença livre', color: 'var(--text-faint)' },
};

/**
 * WindowBar — a moldura do "console": dots de janela, pill "hugging.local ·
 * console" e o estado ao vivo. Apenas chrome; a versão vem de /api/health
 * (o servidor cacheia ~10s, então o polling de 15s é barato).
 */
export default function WindowBar({ status, license }) {
  const { data } = useHealth();

  const meta = STATUS_META[status] ?? { label: status, color: 'var(--text-muted)' };
  const licenseKey = !license ? null : license.valid ? 'valid' : license.activated ? 'activated' : 'off';
  const licenseMeta = licenseKey ? LICENSE_META[licenseKey] : null;
  const version = data?.version ? `v${data.version}` : '';

  return (
    <header className="window-bar">
      <div className="win-dots" aria-hidden="true">
        <span className="win-dot win-dot-close" />
        <span className="win-dot win-dot-min" />
        <span className="win-dot win-dot-max" />
      </div>

      <div className="win-pill" title="console local do HUGGING">
        <span className="status-dot" style={{ backgroundColor: 'var(--success)' }} />
        <span className="win-pill-host">hugging.local</span>
        <span className="win-pill-sep">·</span>
        <span className="win-pill-app">console</span>
      </div>

      <div className="win-right">
        <span className="header-status" title={meta.label}>
          <span className="status-dot" style={{ backgroundColor: meta.color }} />
          {meta.label}
        </span>
        {licenseMeta && (
          <span className={`header-license header-license-${licenseKey}`} title="Estado da licença — aba Licença">
            <span className="status-dot" style={{ backgroundColor: licenseMeta.color }} />
            {licenseMeta.label}
          </span>
        )}
        {version && <span className="win-version">{version}</span>}
      </div>
    </header>
  );
}
