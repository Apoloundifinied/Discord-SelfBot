'use client';

import { useMemo, useState } from 'react';
import Header from '@/components/Header';
import StatsBar from '@/components/StatsBar';
import FilterBar from '@/components/FilterBar';
import MessageFeed from '@/components/MessageFeed';
import Tabs from '@/components/Tabs';
import DatabasePanel from '@/components/DatabasePanel';
import FleetPanel from '@/components/FleetPanel';
import ScraperPanel from '@/components/ScraperPanel';
import { useMessagesFeed } from '@/hooks/useMessagesFeed';

const TABS = [
  { id: 'live', label: 'Ao vivo' },
  { id: 'database', label: 'Banco de Dados' },
  { id: 'fleet', label: 'Fleet' },
  { id: 'scraper', label: 'Scraper' },
];

export default function Home() {
  const [tab, setTab] = useState('live');
  const { messages, status } = useMessagesFeed();
  const [guildFilter, setGuildFilter] = useState('all');
  const [search, setSearch] = useState('');

  const guilds = useMemo(() => {
    const map = new Map();
    messages.forEach(m => {
      const id = m.source_info?.guild_id;
      const name = m.source_info?.guild_name;
      if (id && name && !map.has(id)) map.set(id, name);
    });
    return [...map.entries()];
  }, [messages]);

  const filtered = useMemo(() => {
    return messages.filter(m => {
      if (guildFilter !== 'all' && m.source_info?.guild_id !== guildFilter) return false;
      if (search) {
        const haystack = `${m.author_name} ${m.message_content ?? ''}`.toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [messages, guildFilter, search]);

  return (
    <main className="page">
      <Header status={status} />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'live' && (
        <>
          <StatsBar messages={messages} />
          <FilterBar
            guilds={guilds}
            guildFilter={guildFilter}
            onGuildChange={setGuildFilter}
            search={search}
            onSearchChange={setSearch}
          />
          <MessageFeed messages={filtered} />
        </>
      )}
      {tab === 'database' && <DatabasePanel />}
      {tab === 'fleet' && <FleetPanel />}
      {tab === 'scraper' && <ScraperPanel />}
    </main>
  );
}
