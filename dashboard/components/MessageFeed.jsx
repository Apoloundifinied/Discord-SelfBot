'use client';

import MessageItem from '@/components/MessageItem';

export default function MessageFeed({ messages }) {
  if (!messages.length) {
    return <div className="empty-state">Nenhuma mensagem ainda. Aguardando a fleet coletar...</div>;
  }

  return (
    <section className="message-feed">
      {messages.map(message => (
        <MessageItem key={message.id} message={message} />
      ))}
    </section>
  );
}
