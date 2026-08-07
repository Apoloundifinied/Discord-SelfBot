'use client';

import { formatRelativeTime } from '@/lib/format';

// Avatares de cor determinística por autor — o "tema" do console (letra em
// círculo colorido), como no feed do produto.
const AVATARS = [
  { bg: '#d9a441', fg: '#171104' },
  { bg: '#a78bfa', fg: '#140d33' },
  { bg: '#5af7b0', fg: '#06281c' },
  { bg: '#ff6b7d', fg: '#2a0509' },
  { bg: '#f2c14e', fg: '#171104' },
  { bg: '#6ee7d8', fg: '#06231f' },
  { bg: '#8d8dff', fg: '#0a0a14' },
  { bg: '#f0ab5a', fg: '#221003' },
];

function avatarStyle(name) {
  let h = 0;
  const s = String(name ?? '?');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const a = AVATARS[h % AVATARS.length];
  return { background: a.bg, color: a.fg };
}

export default function MessageItem({ message }) {
  const guildName = message.source_info?.guild_name;
  const channelName = message.source_info?.channel_name;
  const author = message.author_name ?? '?';

  return (
    <article className="message-item">
      <div className="message-avatar" style={avatarStyle(author)} aria-hidden="true">
        {author.trim().charAt(0).toUpperCase() || '?'}
      </div>
      <div className="message-body">
        <div className="message-meta">
          <span className="message-author">{author}</span>
          {(guildName || channelName) && (
            <span className="message-location">
              {guildName}
              {channelName ? ` · #${channelName}` : ''}
            </span>
          )}
          <span className="message-time">{formatRelativeTime(message.captured_at)}</span>
        </div>
        <p className="message-content">{message.message_content || <em>[sem texto/anexo]</em>}</p>
      </div>
    </article>
  );
}
