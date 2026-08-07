'use client';

import { useState } from 'react';
import { usePolledResource } from '@/hooks/usePolledResource';

/**
 * Controle das mensagens coletadas pelo scraper (e fleet) no Turso.
 * Permite apagar tudo, tudo de um servidor específico ou tudo de um canal,
 * com contagem por guild/canal e confirmação explícita (duplo clique).
 */
export default function DataControlPanel() {
  const { data, refresh } = usePolledResource('/api/messages/cleanup', { intervalMs: 10000 });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  // Escopo armado para confirmação (double-click): 'all' | guildId | channelId
  const [armed, setArmed] = useState(null);

  const total = data?.total ?? 0;
  const guilds = data?.guilds ?? [];
  const channels = data?.channels ?? [];

  async function runDelete(payload, armKey) {
    // Confirmação: primeiro clique arma, segundo executa (dentro de 8s).
    if (armed !== armKey) {
      setArmed(armKey);
      setTimeout(() => setArmed(prev => (prev === armKey ? null : prev)), 8000);
      setFeedback({ type: 'success', message: 'Confirme clicando de novo em até 8s para apagar.' });
      return;
    }

    setBusy(true);
    setFeedback(null);
    setArmed(null);
    try {
      const res = await fetch('/api/messages/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, confirm: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Falha ao apagar.');
      setFeedback({ type: 'success', message: `Apagadas ${body.deleted} mensagem(ns).` });
      refresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Controle dos dados coletados</h2>
      <p className="panel-hint">
        Apaga mensagens armazenadas no Turso (scraper e fleet gravam na mesma tabela). A ação precisa de
        confirmação: clique uma vez para armar e outra para executar. Os dados removidos não têm recuperação.
      </p>

      <div className="status-line">
        Total na tabela: <strong>{total}</strong> mensagens · {guilds.length} servidor(es) ·{' '}
        {channels.length} canal(ais)
      </div>

      <div className="control-row">
        <button
          type="button"
          className={armed === 'all' ? 'button-arm' : undefined}
          aria-pressed={armed === 'all'}
          onClick={() => runDelete({ scope: 'all' }, 'all')}
          disabled={busy || total === 0}
        >
          {armed === 'all' ? 'Confirmar: apagar TUDO?' : `Apagar tudo (${total})`}
        </button>
      </div>

      {guilds.length > 0 && (
        <>
          <h3>Por servidor</h3>
          <ul className="entity-list">
            {guilds.map(guild => (
              <li key={guild.guild_id}>
                <span className="entity-label">{guild.guild_name || guild.guild_id}</span>
                <span className="entity-detail">{guild.guild_id}</span>
                <span className="entity-status">{guild.count} msgs</span>
                <button
                  type="button"
                  className={armed === `guild:${guild.guild_id}` ? 'button-arm' : undefined}
                  aria-pressed={armed === `guild:${guild.guild_id}`}
                  onClick={() => runDelete({ scope: 'guild', guildId: guild.guild_id }, `guild:${guild.guild_id}`)}
                  disabled={busy}
                >
                  {armed === `guild:${guild.guild_id}` ? 'Confirmar?' : 'Apagar servidor'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {channels.length > 0 && (
        <>
          <h3>Por canal</h3>
          <ul className="entity-list">
            {channels.map(channel => (
              <li key={channel.channel_id}>
                <span className="entity-label">
                  {channel.channel_name ? `#${channel.channel_name}` : channel.channel_id}
                </span>
                <span className="entity-detail">
                  {channel.guild_name || channel.channel_id}
                </span>
                <span className="entity-status">{channel.count} msgs</span>
                <button
                  type="button"
                  className={armed === `channel:${channel.channel_id}` ? 'button-arm' : undefined}
                  aria-pressed={armed === `channel:${channel.channel_id}`}
                  onClick={() =>
                    runDelete({ scope: 'channel', channelId: channel.channel_id }, `channel:${channel.channel_id}`)
                  }
                  disabled={busy}
                >
                  {armed === `channel:${channel.channel_id}` ? 'Confirmar?' : 'Apagar canal'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {total === 0 && <p className="panel-hint">Nenhuma mensagem armazenada ainda.</p>}

      {feedback && <p className={`feedback feedback-${feedback.type}`}>{feedback.message}</p>}
    </section>
  );
}
