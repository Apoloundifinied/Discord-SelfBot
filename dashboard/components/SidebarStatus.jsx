'use client';

import { useHealth } from '@/hooks/useHealth';

/**
 * SidebarStatus — rodapé da sidebar (status do console): dots de estado,
 * contagem da fleet, assinatura ed25519 e situação da licença.
 * Reusa /api/health (cacheado no servidor ~10s) — polling de 15s é barato.
 */
export default function SidebarStatus({ license }) {
  const { data } = useHealth();

  const fleetCount = data?.fleet ? String(data.fleet.accounts) : '—';

  const licState = !license
    ? { label: 'licença', color: 'var(--text-faint)' }
    : license.valid
      ? { label: 'licenciado', color: 'var(--success)' }
      : license.mode === 'owner'
        ? { label: 'modo dono', color: 'var(--violet)' }
        : license.activated
          ? { label: 'inválida', color: 'var(--danger)' }
          : { label: 'livre', color: 'var(--text-faint)' };

  return (
    <footer className="sidebar-foot">
      <div className="sidebar-foot-dots" aria-hidden="true">
        <span className="side-dot" style={{ background: 'var(--accent)' }} />
        <span className="side-dot" style={{ background: 'var(--violet)' }} />
        <span className="side-dot" style={{ background: licState.color }} />
      </div>
      <div className="sidebar-foot-line">
        <span className="sidebar-foot-key">fleet</span>
        <span className="sidebar-foot-value">{fleetCount}</span>
      </div>
      <div className="sidebar-foot-line">
        <span className="sidebar-foot-key">assinatura</span>
        <span className="sidebar-foot-value">ed25519</span>
      </div>
      <div className="sidebar-foot-line">
        <span className="sidebar-foot-key">licença</span>
        <span className="sidebar-foot-value" style={{ color: licState.color }}>
          {licState.label}
        </span>
      </div>
    </footer>
  );
}
