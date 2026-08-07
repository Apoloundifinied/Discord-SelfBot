'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { usePolledResource } from '@/hooks/usePolledResource';
import {
  formatRelativeTime,
  discordAvatarUrl,
  discordBannerUrl,
  publicFlagsToBadges,
  premiumTypeLabel,
  intToHex,
} from '@/lib/format';

const STATUS_COLORS = {
  online: '#22c55e',
  idle: '#facc15',
  dnd: '#ef4444',
  offline: '#64748b',
};

function PresenceDot({ status }) {
  return (
    <span
      className="presence-dot"
      style={{ backgroundColor: STATUS_COLORS[status] ?? STATUS_COLORS.offline }}
      title={status ?? 'offline'}
    />
  );
}

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

function ProfileDetails({ profile }) {
  const nitro = premiumTypeLabel(profile.premium_type);
  const accent = intToHex(profile.accent_color);
  const created = profile.created_at;
  const decoration = profile.avatar_decoration;

  const rows = [
    created && { label: 'Conta criada', value: created },
    nitro && { label: 'Nitro', value: nitro },
    accent && { label: 'Cor de destaque', value: accent, swatch: accent },
    decoration && { label: 'Decoração de avatar', value: decoration },
    Number.isFinite(Number(profile.mutual_friends_count)) && {
      label: 'Amigos mútuos',
      value: String(profile.mutual_friends_count),
    },
  ].filter(Boolean);

  if (!rows.length) return null;

  return (
    <section className="panel">
      <h3>Perfil</h3>
      <ul className="detail-list">
        {rows.map(row => (
          <li key={row.label} className="detail-item">
            <span className="detail-label">{row.label}</span>
            {row.swatch ? (
              <span className="detail-value">
                <span className="color-swatch" style={{ backgroundColor: row.swatch }} />
                {row.value}
              </span>
            ) : (
              <span className="detail-value">{row.value}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MutualFriendsSection({ mutualFriends, mutualFriendsCount }) {
  const list = mutualFriends ?? [];
  if (!list.length) return null;
  return (
    <section className="panel">
      <h3>Amigos mútuos ({mutualFriendsCount ?? list.length})</h3>
      <ul className="entity-list">
        {list.map(friend => (
          <li key={friend.id ?? friend.username} className="friend-item">
            <span className="entity-label">{friend.username || friend.id}</span>
            {friend.id && <span className="entity-detail">{friend.id}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProfileHeader({ profile }) {
  const avatarUrl = discordAvatarUrl(profile.user_id, profile.avatar, 160);
  const bannerUrl = discordBannerUrl(profile.user_id, profile.banner, 1200);
  const displayName = profile.global_name || profile.username || 'Desconhecido';

  return (
    <div
      className="identity-profile"
      style={bannerUrl ? { backgroundImage: `linear-gradient(rgba(11,15,20,0.55), rgba(11,15,20,0.92)), url("${bannerUrl}")` } : undefined}
    >
      {avatarUrl ? (
        <Image className="identity-avatar" src={avatarUrl} alt={displayName} width={80} height={80} unoptimized />
      ) : (
        <div className="identity-avatar identity-avatar-fallback">{displayName.slice(0, 1).toUpperCase()}</div>
      )}
      <div className="identity-heading">
        <h2>{displayName}</h2>
        <BadgesRow publicFlags={profile.public_flags} />
        <p className="identity-tag">
          {profile.username ?? '?'}
          {profile.discriminator && profile.discriminator !== '0' ? `#${profile.discriminator}` : ''}
          <span className="identity-id"> · {profile.user_id}</span>
        </p>
        <p className="identity-meta">Coletado {profile.fetched_at ? formatRelativeTime(profile.fetched_at) : '—'}</p>
      </div>
    </div>
  );
}

function AboutSection({ about }) {
  if (!about) return null;
  return (
    <section className="panel">
      <h3>About Me</h3>
      <p className="identity-about">{about}</p>
    </section>
  );
}

const DEVICE_LABELS = {
  desktop: 'Desktop',
  web: 'Web',
  mobile: 'Mobile',
};

function DevicesChips({ clientStatus }) {
  const entries = Object.entries(clientStatus ?? {}).filter(([, status]) => status);
  if (!entries.length) return null;
  return (
    <div className="role-chips">
      {entries.map(([device, status]) => (
        <span key={device} className="role-chip">
          {DEVICE_LABELS[device] ?? device} · {status}
        </span>
      ))}
    </div>
  );
}

function PresenceSection({ presence }) {
  if (!presence) {
    return (
      <section className="panel">
        <h3>Presença</h3>
        <p className="panel-hint">Sem dados de presença no momento (usuário offline ou não observado pelo gateway).</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h3>
        Presença <PresenceDot status={presence.status} />
      </h3>
      {presence.activities.length === 0 && <p className="panel-hint">Online, sem atividades registradas.</p>}
      <DevicesChips clientStatus={presence.client_status} />
      <ul className="activity-list">
        {presence.activities.map((activity, index) => (
          <li key={index} className="activity-item">
            <span className="activity-name">{activity.name}</span>
            {activity.type !== 'Jogando' && <span className="activity-type">({activity.type})</span>}
            {activity.details && <span className="activity-detail">{activity.details}</span>}
            {activity.state && <span className="activity-detail">{activity.state}</span>}
            {activity.applicationId && <span className="activity-app">app: {activity.applicationId}</span>}
            {activity.timestamps?.start && (
              <span className="activity-time">desde {formatRelativeTime(activity.timestamps.start)}</span>
            )}
            {activity.assets?.largeText && <span className="activity-asset">{activity.assets.largeText}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function GuildsSection({ guilds }) {
  return (
    <section className="panel">
      <h3>Servidores mútuos ({guilds.length})</h3>
      {guilds.length === 0 && <p className="panel-hint">Nenhum servidor mútuo encontrado com as contas da fleet.</p>}
      <ul className="entity-list">
        {guilds.map(guild => (
          <li key={guild.guild_id} className="guild-item">
            <div className="guild-main">
              <span className="entity-label">{guild.guild_name || guild.guild_id}</span>
              {guild.nick && <span className="guild-nick">nick: {guild.nick}</span>}
              {guild.joined_at && (
                <span className="entity-detail">entrou {formatRelativeTime(guild.joined_at)}</span>
              )}
            </div>
            <div className="role-chips">
              {guild.roles.slice(0, 6).map(role => (
                <span key={role.id} className="role-chip" style={role.color ? { color: `#${role.color.toString(16).padStart(6, '0')}` } : undefined}>
                  {role.name}
                </span>
              ))}
              {guild.roles.length > 6 && <span className="role-chip role-chip-more">+{guild.roles.length - 6}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TrackingSection() {
  const [trackId, setTrackId] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const { data, refresh } = usePolledResource('/api/identity/tracking', { intervalMs: 10000 });
  const tracked = data?.tracked ?? [];
  const trackingRunning = Boolean(data?.tracking?.running);
  const lastResult = data?.tracking?.lastResult ?? null;

  async function handleAdd(event) {
    event.preventDefault();
    if (!trackId) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/identity/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: trackId.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao adicionar.');
      setFeedback({ type: 'success', message: 'Adicionado ao rastreio (intervalo 60min).' });
      setTrackId('');
      refresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleLoop(action) {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/identity/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao controlar o loop.');
      setFeedback({ type: 'success', message: body.message });
      refresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(userId) {
    setFeedback(null);
    try {
      const res = await fetch('/api/identity/tracking', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao remover.');
      setFeedback({ type: 'success', message: 'Removido do rastreio.' });
      refresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    }
  }

  return (
    <section className="panel">
      <h3>Rastreio agendado</h3>
      <p className="panel-hint">
        Acompanha mudanças de nick/username/avatar/banner/bio e presença ao longo do tempo. Adicione usuários aqui e
        inicie o loop na fleet — cada passada checa os usuários cujo intervalo venceu. Também roda via CLI:{' '}
        <code>node fleet/track.js run</code>.
      </p>
      <div className="control-row">
        <span className={`badge ${trackingRunning ? 'badge-ok' : 'badge-off'}`}>
          {trackingRunning ? 'rastreio rodando' : 'rastreio pausado'}
        </span>
        <button type="button" onClick={() => handleLoop('start')} disabled={busy || trackingRunning}>
          Iniciar rastreio
        </button>
        <button type="button" onClick={() => handleLoop('stop')} disabled={busy || !trackingRunning}>
          Pausar rastreio
        </button>
        {lastResult && (
          <span className="entity-status">
            última passada: {lastResult.checked} checado(s) · {lastResult.changed} mudança(s)
            {lastResult.errors ? ` · ${lastResult.errors} erro(s)` : ''}
          </span>
        )}
      </div>
      <form onSubmit={handleAdd} className="form-inline">
        <input
          type="text"
          inputMode="numeric"
          placeholder="ID do usuário para rastrear"
          value={trackId}
          onChange={e => setTrackId(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Adicionando...' : 'Rastrear'}
        </button>
      </form>
      {feedback && <p className={`feedback feedback-${feedback.type}`}>{feedback.message}</p>}
      {tracked.length > 0 && (
        <ul className="entity-list">
          {tracked.map(t => (
            <li key={t.user_id}>
              <span className="entity-label">{t.user_id}</span>
              <span className="entity-detail">{t.interval_minutes}min</span>
              <span className="entity-detail">
                {t.last_checked_at ? `últ. ${formatRelativeTime(t.last_checked_at)}` : 'nunca'}
              </span>
              <button type="button" onClick={() => handleRemove(t.user_id)}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HistorySection({ userId }) {
  const { data } = usePolledResource(
    userId ? `/api/identity/tracking?userId=${encodeURIComponent(userId)}` : '/api/identity/tracking',
    { intervalMs: 15000, enabled: Boolean(userId) },
  );
  const history = data?.history ?? [];
  const presenceHistory = data?.presenceHistory ?? [];

  if (!userId || (!history.length && !presenceHistory.length)) return null;

  return (
    <>
      {history.length > 0 && (
        <section className="panel">
          <h3>Histórico de mudanças</h3>
          <ul className="history-list">
            {history.map((item, index) => (
              <li key={index} className="history-item">
                <div className="history-main">
                  <span className="history-field">{item.label}</span>
                  <span className="history-change">
                    <span className="history-old">{item.old_value || '—'}</span>
                    <span className="history-arrow">→</span>
                    <span className="history-new">{item.new_value || '—'}</span>
                  </span>
                </div>
                <span className="history-time">{item.changed_at ? formatRelativeTime(item.changed_at) : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {presenceHistory.length > 0 && (
        <section className="panel">
          <h3>Histórico de presença</h3>
          <ul className="history-list">
            {presenceHistory.map((item, index) => (
              <li key={index} className="history-item">
                <div className="history-main">
                  <PresenceDot status={item.status} />
                  <span className="history-field">{item.status ?? 'offline'}</span>
                  <span className="history-detail">
                    {item.activities
                      .slice(0, 3)
                      .map(a => a.name)
                      .filter(Boolean)
                      .join(', ') || 'sem atividades'}
                  </span>
                  {item.client_status && Object.keys(item.client_status).length > 0 && (
                    <span className="history-detail">
                      [
                      {Object.entries(item.client_status)
                        .filter(([, s]) => s)
                        .map(([device, status]) => `${DEVICE_LABELS[device] ?? device}:${status}`)
                        .join(', ')}
                      ]
                    </span>
                  )}
                </div>
                <span className="history-time">{item.observed_at ? formatRelativeTime(item.observed_at) : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function MessagesSection({ userId }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const { data, refresh } = usePolledResource(
    userId ? `/api/identity/messages?userId=${encodeURIComponent(userId)}` : '/api/identity/messages',
    { intervalMs: 15000, enabled: Boolean(userId) },
  );
  const messages = data?.messages ?? [];

  async function handleSearch() {
    if (!userId) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/identity/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao buscar mensagens.');
      setFeedback({
        type: 'success',
        message: `Busca concluída: ${body.data?.messages_found ?? 0} encontradas, ${body.data?.messages_new ?? 0} novas.`,
      });
      refresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (!userId) return null;

  return (
    <section className="panel">
      <h3>Mensagens do usuário ({messages.length})</h3>
      <p className="panel-hint">
        Busca o histórico deste autor nas guilds da conta da fleet via API de busca do Discord (mesma da barra de
        pesquisa do cliente). Requer a fleet rodando; respeita rate limit internamente. Também dá para rodar via CLI:
        <code> node fleet/search-messages.js {userId}</code>
      </p>
      <div className="control-row">
        <button type="button" onClick={handleSearch} disabled={busy}>
          {busy ? 'Buscando...' : 'Buscar mensagens por autor'}
        </button>
      </div>
      {feedback && <p className={`feedback feedback-${feedback.type}`}>{feedback.message}</p>}
      {messages.length === 0 && <p className="panel-hint">Nenhuma mensagem buscada ainda.</p>}
      {messages.length > 0 && (
        <ul className="history-list">
          {messages.map(message => (
            <li key={message.message_id} className="history-item">
              <div className="history-main">
                <span className="history-field">
                  {message.channel_name ? `#${message.channel_name}` : message.guild_id}
                </span>
                <span className="history-change history-new">{message.content || '—'}</span>
              </div>
              <span className="history-time">{message.sent_at ? formatRelativeTime(message.sent_at) : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ConnectionsSection({ connections, isOwn }) {
  return (
    <section className="panel">
      <h3>Conexões</h3>
      <p className="panel-hint">
        {isOwn
          ? 'Conexões da própria conta logada (Spotify, Steam, GitHub, Twitter etc.).'
          : 'O Discord só expõe conexões da própria conta. Para ver conexões de outros usuários, analise a conta que já está na fleet.'}
      </p>
      {connections.length === 0 && <p className="panel-hint">Nenhuma conexão vinculada.</p>}
      <ul className="connection-list">
        {connections.map((connection, index) => (
          <li key={index} className="connection-chip">
            <span className="connection-platform">{connection.platform}</span>
            <span className="connection-name">{connection.name}</span>
            {connection.verified && <span className="badge badge-ok">verificado</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function IdentityPanel({ initialUserId = null }) {
  const [userId, setUserId] = useState(initialUserId ?? '');
  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [identity, setIdentity] = useState(null);
  const { data: recentData, refresh: refreshRecent } = usePolledResource('/api/identity', {
    intervalMs: 10000,
  });
  const recent = recentData?.recent ?? [];

  // Quando a busca global (Header) abre esta aba com um alvo, carrega na hora.
  const initialLoadedRef = useRef(false);
  useEffect(() => {
    if (initialUserId && !initialLoadedRef.current) {
      initialLoadedRef.current = true;
      handleLoad(initialUserId);
    }
  }, [initialUserId]);

  async function handleResolve(event) {
    event.preventDefault();
    if (!userId) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao resolver identidade.');

      setResolving(false);
      setIdentity(body.data);
      setFeedback({ type: 'success', message: `Identidade de ${body.data?.profile?.username ?? userId} coletada.` });
      refreshRecent();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleLoad(loadedUserId) {
    setUserId(loadedUserId);
    setResolving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/identity?userId=${encodeURIComponent(loadedUserId)}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao carregar identidade.');
      setIdentity(body);
      setFeedback({ type: 'success', message: 'Identidade carregada do banco.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setResolving(false);
    }
  }

  // Só a própria conta logada tem conexões — esse é o sinal confiável de "é
  // uma conta da fleet". O resolver também envia `is_own` explícito.
  const isOwn = Boolean(identity?.is_own ?? identity?.connections?.length > 0);

  return (
    <div className="identity-area">
      <section className="panel">
        <h2>Identidade</h2>
        <p className="panel-hint">
          Resolve e armazena o perfil público de um usuário usando as contas da fleet: username/tag, ID global,
          avatar, banner, bio, presença/atividades (rich presence), servidores mútuos com cargos e data de entrada,
          e conexões vinculadas (Spotify, Steam, GitHub etc.). Os dados ficam no Turso e podem ser consultados a
          qualquer momento, mesmo com a fleet parada.
        </p>
        <p className="panel-hint">
          O perfil completo (bio, guilds mútuos) só pode ser resolvido para usuários com os quais a conta da
          fleet compartilha ao menos um servidor. Conexões vinculadas são expostas pelo Discord apenas para a
          própria conta logada.
        </p>

        <form onSubmit={handleResolve} className="form-inline">
          <input
            type="text"
            inputMode="numeric"
            placeholder="ID numérico do usuário (ex.: 123456789012345678)"
            value={userId}
            onChange={e => setUserId(e.target.value)}
            required
          />
          <button type="submit" disabled={busy || resolving}>
            {busy ? 'Analisando...' : 'Coletar identidade'}
          </button>
        </form>
        {feedback && <p className={`feedback feedback-${feedback.type}`}>{feedback.message}</p>}
      </section>

      {recent.length > 0 && (
        <section className="panel">
          <h3>Últimos perfis resolvidos</h3>
          <ul className="entity-list">
            {recent.map(profile => (
              <li key={profile.user_id}>
                <span className="entity-label">{profile.global_name || profile.username || profile.user_id}</span>
                <span className="entity-detail">{profile.user_id}</span>
                <button type="button" onClick={() => handleLoad(profile.user_id)} disabled={resolving}>
                  Ver
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <TrackingSection />

      {identity?.profile && (
        <>
          <ProfileHeader profile={{ ...identity.profile, user_id: identity.user_id }} />
          <AboutSection about={identity.profile.about_me} />
          <ProfileDetails profile={identity.profile} />
          <MutualFriendsSection
            mutualFriends={identity.profile.mutual_friends}
            mutualFriendsCount={identity.profile.mutual_friends_count}
          />
          <PresenceSection presence={identity.presence} />
          <GuildsSection guilds={identity.guilds} />
          <ConnectionsSection connections={identity.connections} isOwn={isOwn} />
          <HistorySection userId={identity.user_id} />
          <MessagesSection userId={identity.user_id} />
        </>
      )}
    </div>
  );
}
