'use client';

import { formatRelativeTime } from '@/lib/format';

export default function MessageItem({ message }) {
  const guildName = message.source_info?.guild_name;
  const channelName = message.source_info?.channel_name;

  return (
    <article className="message-item">
      <div className="message-meta">
        <span className="message-author">{message.author_name}</span>
        {(guildName || channelName) && (
          <span className="message-location">
            {guildName}
            {channelName ? ` · #${channelName}` : ''}
          </span>
        )}
        <span className="message-time">{formatRelativeTime(message.captured_at)}</span>
      </div>
      <p className="message-content">{message.message_content || <em>[sem texto/anexo]</em>}</p>
    </article>
  );
}
