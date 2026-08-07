'use client';

import MessageItem from '@/components/MessageItem';

export default function MessageFeed({ messages, status = 'live' }) {
  // Primeira carga (nenhuma mensagem ainda): mostra skeletons.
  if (status === 'connecting' && messages.length === 0) {
    return (
      <section className="message-feed" aria-busy="true" aria-label="Carregando mensagens">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="message-skeleton" key={i}>
            <div className="skeleton-line shimmer" style={{ width: '28%' }} />
            <div className="skeleton-line shimmer" style={{ width: '82%' }} />
            <div className="skeleton-line shimmer" style={{ width: '55%' }} />
          </div>
        ))}
      </section>
    );
  }

  if (status === 'error') {
    return (
      <div className="empty-state empty-state-error">
        <div className="empty-glyph" aria-hidden="true">
          !
        </div>
        <h3>Falha de conexão</h3>
        <p>Não foi possível buscar as mensagens no Turso. Verifique a configuração do banco na aba Banco de Dados.</p>
      </div>
    );
  }

  if (!messages.length) {
    return (
      <div className="empty-state">
        <div className="empty-glyph" aria-hidden="true">
          ◌
        </div>
        <h3>Nenhuma mensagem ainda</h3>
        <p>Aguarde a fleet coletar os primeiros eventos — eles aparecem aqui em tempo real.</p>
      </div>
    );
  }

  return (
    <section className="message-feed" aria-live="polite">
      {messages.map(message => (
        <MessageItem key={message.id} message={message} />
      ))}
    </section>
  );
}
