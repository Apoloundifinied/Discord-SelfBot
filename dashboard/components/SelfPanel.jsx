'use client';

import { useState } from 'react';
import Image from 'next/image';
import { usePolledResource } from '@/hooks/usePolledResource';
import {
  formatRelativeTime,
  discordSnowflakeToDate,
  discordAvatarUrl,
  discordBannerUrl,
  publicFlagsToBadges,
  premiumTypeLabel,
} from '@/lib/format';

const TYPE_COLORS = {
  online: '#22c55e',
  idle: '#facc15',
  dnd: '#ef4444',
  offline: '#64748b',
  invisible: '#64748b',
};

function BadgesRow({ publicFlags }) {
  const badges = publicFlagsToBadges(publicFlags);
  if (!badges.length) return null;
  return (
    <div className="badge-row">
      {badges.map(badge => (
        <span key={badge} className="badge badge-flag">
          {badge}
        </span>
      ))}
    </div>
  );
}

function AccountHeader({ self }) {
  const { account } = self;
  const avatarUrl = discordAvatarUrl(account.user_id, account.avatar, 160);
  const bannerUrl = discordBannerUrl(account.user_id, account.banner, 1200);
  const displayName = account.global_name || account.username || 'Desconhecido';
  const nitro = premiumTypeLabel(account.premium_type);
  const status = account.status || 'offline';

  return (
    <div
      className="self-profile"
      style={
        bannerUrl
          ? {
              backgroundImage: `linear-gradient(rgba(10,11,14,0.55), rgba(10,11,14,0.94)), url("${bannerUrl}")`,
            }
          : undefined
      }
    >
      {avatarUrl ? (
        <Image className="identity-avatar" src={avatarUrl} alt={displayName} width={80} height={80} unoptimized />
      ) : (
        <div className="identity-avatar identity-avatar-fallback">{displayName.slice(0, 1).toUpperCase()}</div>
      )}
      <div className="identity-heading">
        <h2>{displayName}</h2>
        <BadgesRow publicFlags={account.public_flags} />
        <p className="identity-tag">
          {account.username ?? '?'}
          {account.discriminator && account.discriminator !== '0' ? `#${account.discriminator}` : ''}
          <span className="identity-id"> · {account.user_id}</span>
        </p>
        <p className="identity-meta">Coletado {account.fetched_at ? formatRelativeTime(account.fetched_at) : '—'}</p>
      </div>
      <div className="self-status">
        <span className="presence-dot" style={{ backgroundColor: TYPE_COLORS[status] ?? TYPE_COLORS.offline }} />
        <span className="self-status-label">{status}</span>
      </div>
    </div>
  );
}

function AccountDetails({ account }) {
  const nitro = premiumTypeLabel(account.premium_type);
  const rows = [
    ['Nitro', nitro],
    ['Conta verificada', account.verified ? 'Sim' : 'Não'],
    ['2FA ativo', account.mfa_enabled ? 'Sim' : 'Não'],
    ['E-mail vinculado', account.email ? 'Sim' : 'Não'],
    ['Telefone vinculado', account.phone ? 'Sim' : 'Não'],
    ['Idioma (locale)', account.locale],
    ['Fuso horário', account.timezone_name],
    ['Tema', account.theme],
    ['Modo desenvolvedor', account.developer_mode ? 'Ativado' : 'Desativado'],
    ['Filtro de conteúdo explícito', account.explicit_content_filter],
    ['Sincronizar contatos', account.contact_sync_enabled ? 'Ativado' : 'Desativado'],
    ['País de cobrança', account.billing_country],
    ['Conta criada', account.created_at],
  ].filter(([, value]) => value !== null && value !== undefined);

  return (
    <section className="panel">
      <h3>Retrato da conta</h3>
      <ul className="detail-list">
        {rows.map(([label, value]) => (
          <li key={label} className="detail-item">
            <span className="detail-label">{label}</span>
            <span className="detail-value">{String(value)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RelationshipsSection({ relationships }) {
  const friends = relationships.filter(r => r.type === '1');
  const blocked = relationships.filter(r => r.type === '2');
  const pending = relationships.filter(r => r.type === '3' || r.type === '4');

  return (
    <section className="panel">
      <h3>
        Círculo social — {friends.length} amigo(s) · {blocked.length} bloqueado(s) · {pending.length} pendente(s)
      </h3>
      {relationships.length === 0 && <p className="panel-hint">Nenhuma relação encontrada (amigos, bloqueados, pendentes).</p>}
      <ul className="entity-list">
        {relationships.map(r => {
          const isBlocked = r.type === '2';
          return (
            <li key={`${r.type}-${r.target_user_id}`} className={isBlocked ? 'self-relation-blocked' : undefined}>
              <span className="entity-label">{r.nickname || r.username || r.target_user_id}</span>
              {r.nickname && r.username && <span className="entity-detail">({r.username})</span>}
              <span className="entity-detail">{r.type_label}</span>
              {r.since && <span className="entity-detail">amigos desde {formatRelativeTime(r.since)}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NotesSection({ notes }) {
  return (
    <section className="panel">
      <h3>Notas privadas ({notes.length})</h3>
      {notes.length === 0 && <p className="panel-hint">Nenhuma anotação registrada nesta conta.</p>}
      <ul className="history-list">
        {notes.map(note => (
          <li key={note.target_user_id} className="history-item">
            <div className="history-main">
              <span className="history-field">{note.target_user_id}</span>
              <span className="history-new">{note.note}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChannelsSection({ channels }) {
  return (
    <section className="panel">
      <h3>Conversas (DMs) ({channels.length})</h3>
      {channels.length === 0 && <p className="panel-hint">Nenhuma conversa direta ativa.</p>}
      <ul className="entity-list">
        {channels.map(ch => {
          const names = ch.recipients.map(u => u.global_name || u.username).filter(Boolean).join(', ');
          // last_message_id é um snowflake (não timestamp): converte antes de formatar.
          const lastMsg = discordSnowflakeToDate(ch.last_message_id);
          return (
            <li key={ch.channel_id}>
              <span className="entity-label">{names || ch.name || ch.channel_id}</span>
              {lastMsg && <span className="entity-detail">última msg {formatRelativeTime(lastMsg)}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AffinityRows({ items, emptyHint }) {
  if (!items.length) return <p className="panel-hint">{emptyHint}</p>;
  const max = Math.max(...items.map(i => i.score), 1);
  return (
    <ul className="entity-list">
      {items.slice(0, 15).map(item => (
        <li key={`${item.target_id}`} className="self-affinity-item">
          <span className="entity-detail">#{item.rank}</span>
          <span className="entity-label self-affinity-id">{item.target_id}</span>
          <span className="chart-row-track self-affinity-track">
            <span
              className="chart-row-fill"
              style={{ width: `${Math.round((item.score / max) * 100)}%` }}
            />
          </span>
          <span className="entity-detail">{item.score}</span>
        </li>
      ))}
    </ul>
  );
}

function AffinitiesSection({ affinities }) {
  return (
    <>
      <section className="panel">
        <h3>Affinities — com quem esta conta mais conversa</h3>
        <AffinityRows
          items={affinities.users}
          emptyHint="Sem dados de afinidade com usuários (ranking calculado pelo Discord)."
        />
      </section>
      <section className="panel">
        <h3>Affinities — onde esta conta é mais ativa</h3>
        <AffinityRows
          items={affinities.guilds}
          emptyHint="Sem dados de afinidade com servidores."
        />
      </section>
    </>
  );
}

function SuggestionsSection({ suggestions }) {
  return (
    <section className="panel">
      <h3>Sugestões de amigos ({suggestions.length})</h3>
      {suggestions.length === 0 && (
        <p className="panel-hint">O algoritmo do Discord não tem sugestões para esta conta no momento.</p>
      )}
      <ul className="entity-list">
        {suggestions.map(s => (
          <li key={s.suggested_user_id}>
            <span className="entity-label">{s.global_name || s.username || s.suggested_user_id}</span>
            <span className="entity-detail">{s.suggested_user_id}</span>
            {Number.isFinite(Number(s.mutual_friends_count)) && (
              <span className="entity-detail">{s.mutual_friends_count} amigos em comum</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EntitlementsSection({ entitlements, library }) {
  if (!entitlements.length && !library.length) return null;
  return (
    <section className="panel">
      <h3>Compras e biblioteca</h3>
      {entitlements.length > 0 && (
        <ul className="entity-list">
          {entitlements.map(e => (
            <li key={e.entitlement_id}>
              <span className="entity-label">{e.name || e.sku_id || e.entitlement_id}</span>
              {e.consumed && <span className="badge badge-off">consumido</span>}
            </li>
          ))}
        </ul>
      )}
      {library.length > 0 && (
        <ul className="entity-list">
          {library.map(a => (
            <li key={a.app_id}>
              <span className="entity-label">{a.name || a.app_id}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PaymentCard({ source }) {
  const ba = source.billing_address ?? {};
  const addressLines = [ba.line_1, ba.line_2, [ba.city, ba.state].filter(Boolean).join(', '), [ba.postal_code, ba.country].filter(Boolean).join(' ')].filter(Boolean);
  const expiry = source.expires_month && source.expires_year
    ? `${String(source.expires_month).padStart(2, '0')}/${String(source.expires_year).padStart(4, '0')}`
    : null;

  return (
    <li className="connection-chip self-payment-card">
      <span className="connection-platform">{source.brand || source.type || 'cartão'}</span>
      {source.last4 && <span className="connection-name self-card-number">•••• •••• •••• {source.last4}</span>}
      {expiry && <span className="connection-name">expira {expiry}</span>}
      {source.nickname && <span className="connection-name">{source.nickname}</span>}
      {source.is_default && <span className="badge badge-ok">padrão</span>}
      {source.invalid && <span className="badge badge-warn">inválido</span>}
      {addressLines.length > 0 && (
        <span className="connection-name self-payment-address" title={addressLines.join(', ')}>
          📍 {addressLines.join(', ')}
        </span>
      )}
    </li>
  );
}

function PaymentsSection({ paymentSources }) {
  return (
    <section className="panel">
      <h3>Métodos de pagamento ({paymentSources.length})</h3>
      <p className="panel-hint">
        Dados como o Discord os entrega à própria conta: marca, últimos 4 dígitos, validade e endereço de cobrança
        vinculado (quando presente). A API do Discord não expõe o número completo nem CVV — o que ela devolve é
        exatamente o que aparece aqui.
      </p>
      {paymentSources.length === 0 && (
        <p className="panel-hint">
          Nenhum método de pagamento salvo nesta conta — o endpoint respondeu, mas veio vazio. Cartões adicionados
          aqui aparecem nesta seção na próxima coleta.
        </p>
      )}
      <ul className="connection-list self-payment-list">
        {paymentSources.map(p => (
          <PaymentCard key={p.source_id} source={p} />
        ))}
      </ul>
    </section>
  );
}

export default function SelfPanel() {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const { data: self, refresh } = usePolledResource('/api/self', { intervalMs: 20000 });

  async function handleCollect() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/self', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao coletar o self.');
      const sections = Object.entries(body.data?.sections ?? {})
        .filter(([, count]) => count > 0)
        .map(([name, count]) => `${name}=${count}`)
        .join(', ');
      setFeedback({ type: 'success', message: `Coleta concluída. ${sections || 'nenhuma seção com dados.'}` });
      refresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="identity-area">
      <section className="panel">
        <h2>Minha Conta (Self)</h2>
        <p className="panel-hint">
          Exploração completa da conta dona do token — o que o Discord permite que o próprio dono veja sobre si: perfil
          oficial e preferências, círculo social (amigos com nickname privado e data de amizade, bloqueados, pendentes),
          notas privadas, conversas ativas, servidores, ranking de afinidade (com quem a conta mais interage e onde é
          mais ativa), sugestões de amigos, compras e biblioteca.
        </p>
        <p className="panel-hint">
          Dados sensíveis são protegidos: métodos de pagamento são exibidos <strong>somente redigidos</strong> (marca,
          últimos 4, país) — número completo, CVV e endereço nunca são lidos. Requer a fleet rodando (ou use a CLI:{' '}
          <code>node fleet/self.js</code>).
        </p>
        <div className="control-row">
          <button type="button" onClick={handleCollect} disabled={busy}>
            {busy ? 'Coletando...' : 'Coletar conta'}
          </button>
        </div>
        {feedback && <p className={`feedback feedback-${feedback.type}`}>{feedback.message}</p>}
      </section>

      {!self && !busy && (
        <section className="panel">
          <h3>Ainda sem dados</h3>
          <p className="panel-hint">
            Clique em “Coletar conta” para buscar e persistir o snapshot completo no Turso. A coleta respeita rate
            limit internamente (leva cerca de 20s) e pode ser refeita a qualquer momento.
          </p>
        </section>
      )}

      {self && (
        <>
          <AccountHeader self={self} />
          <AccountDetails account={self.account} />
          <RelationshipsSection relationships={self.relationships} />
          <NotesSection notes={self.notes} />
          <ChannelsSection channels={self.channels} />
          <AffinitiesSection affinities={self.affinities} />
          <SuggestionsSection suggestions={self.friend_suggestions} />
          <EntitlementsSection entitlements={self.entitlements} library={self.library} />
          <PaymentsSection paymentSources={self.payment_sources} />
        </>
      )}
    </div>
  );
}
