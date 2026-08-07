'use client';

import { useHealth } from '@/hooks/useHealth';
import { formatRelativeTime } from '@/lib/format';

/** Tempo relativo com fallback '—' para ausência (reusa formatRelativeTime). */
function timeAgo(iso) {
  if (!iso) return '—';
  const relative = formatRelativeTime(iso);
  if (!relative) return new Date(iso).toLocaleString('pt-BR');
  return relative;
}

function fmtCount(n) {
  return n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-BR');
}

const LICENSE_REASONS = {
  'sem-ativacao': 'aguardando ativação',
  'formato-invalido': 'formato inválido',
  'assinatura-invalida': 'assinatura inválida',
  'expirada': 'chave expirada',
  'maquina-diferente': 'vinculada a outra máquina',
  'chave-publica-ausente': 'chave pública ausente no build',
  'verificacao-falhou': 'falha na verificação',
};

function licenseRow(lic) {
  if (lic.valid) {
    const date = lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString('pt-BR') : '—';
    const detail = lic.machineBound ? `vinculada à máquina · expira ${date}` : `expira ${date}`;
    return { state: 'ok', value: lic.subject || 'Licença ativada', detail };
  }
  // Razões específicas primeiro — um build sem public.pem NÃO é "aguardando ativação".
  if (lic.reason && lic.reason !== 'sem-ativacao') {
    return { state: 'bad', value: 'Licença indisponível', detail: LICENSE_REASONS[lic.reason] ?? lic.reason };
  }
  if (!lic.activated && lic.mode === 'owner' && !lic.enforce) {
    return { state: 'ok', value: 'Modo dono', detail: 'cofre presente · bloqueio desligado' };
  }
  if (!lic.activated) {
    return { state: 'warn', value: 'Aguardando ativação', detail: 'cole a chave recebida na tela de desbloqueio' };
  }
  return { state: 'bad', value: 'Licença inválida', detail: LICENSE_REASONS[lic.reason] ?? lic.reason ?? 'falha na verificação' };
}

function databaseRow(db) {
  if (!db.configured) {
    return { state: 'na', value: 'Não configurado', detail: 'use o assistente de configuração' };
  }
  const kind = db.local ? 'SQLite local' : 'Turso';
  if (!db.connected) {
    return { state: 'bad', value: `${kind} offline`, detail: db.error };
  }
  const collected = db.messageCount === null ? 'schema ainda não aplicado' : `${fmtCount(db.messageCount)} mensagens`;
  return { state: 'ok', value: `${kind} conectado`, detail: `${collected} · última coleta ${timeAgo(db.lastCollectedAt)}` };
}

function tokenRow(tok) {
  if (!tok.present) {
    return { state: 'na', value: 'Sem token', detail: 'configure no Scraper ou na Fleet' };
  }
  if (tok.valid) {
    const user = tok.user ? `${tok.user.tag} · ${tok.user.id}` : 'válido';
    return { state: 'ok', value: 'Token válido', detail: user };
  }
  return { state: 'bad', value: 'Token inválido', detail: tok.error };
}

function fleetRow(fleet, scraperTokenPresent) {
  if (fleet.configured) {
    return {
      state: fleet.withToken > 0 ? 'ok' : 'warn',
      value: `${fleet.withToken}/${fleet.accounts} contas`,
      detail: 'com token na fleet',
    };
  }
  if (scraperTokenPresent) {
    return { state: 'ok', value: 'Scraper', detail: 'token configurado para coleta histórica' };
  }
  return { state: 'na', value: 'Sem contas', detail: 'adicione em Fleet ou Scraper' };
}

/** Cartão "Diagnóstico" — estado consolidado da instalação (GET /api/health). */
export default function HealthCard() {
  const { data, error, refresh } = useHealth();

  const rows = data
    ? [
        {
          id: 'node',
          state: data.nodeOk ? 'ok' : 'bad',
          label: 'Ambiente',
          value: `Node ${data.node}`,
          detail: `${data.version ? `v${data.version} · ` : ''}${data.platform}${data.nodeOk ? '' : ' · mínimo 20.18'}`,
        },
        { id: 'database', label: 'Banco', ...databaseRow(data.database) },
        { id: 'license', label: 'Licença', ...licenseRow(data.license) },
        { id: 'token', label: 'Token', ...tokenRow(data.token) },
        { id: 'fleet', label: 'Fleet', ...fleetRow(data.fleet, data.scraperTokenPresent) },
      ]
    : [];

  const badge = !data && !error
    ? { cls: 'badge-off', text: 'verificando…' }
    : error && !data
      ? { cls: 'badge-warn', text: 'indisponível' }
      : data.ok
        ? { cls: 'badge-ok', text: 'operacional' }
        : { cls: 'badge-warn', text: `${data.problems.length} pendente(s)` };

  const checkedAt = data?.checkedAt ? new Date(data.checkedAt) : null;

  return (
    <section className="panel health-card">
      <div className="health-head">
        <h3 className="health-title">Diagnóstico</h3>
        <span className={`badge ${badge.cls}`}>{badge.text}</span>
        <span className="health-meta" title={checkedAt?.toLocaleString('pt-BR')}>
          {data?.checkedAt ? `verificado ${timeAgo(data.checkedAt)}${data.cached ? ' · cache' : ''}` : '…'}
        </span>
        {/* Falha transitória com dados anteriores ainda visíveis: aviso sutil, sem esconder o estado real. */}
        {error && data && (
          <span className="health-meta-error" role="status">
            falha ao atualizar
          </span>
        )}
        <button type="button" className="health-refresh" onClick={refresh} disabled={!data && !error}>
          Atualizar
        </button>
      </div>

      {error && !data && <p className="panel-hint health-error">Falha ao consultar o diagnóstico: {error}</p>}

      {rows.length > 0 && (
        <div className="health-grid">
          {rows.map(row => (
            <div key={row.id} className="health-row">
              <span className={`health-dot health-dot-${row.state}`} aria-hidden="true" />
              <div className="health-row-body">
                <span className="health-label">{row.label}</span>
                <span className="health-value">{row.value}</span>
                <span className="health-detail">{row.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
