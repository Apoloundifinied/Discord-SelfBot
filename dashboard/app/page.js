'use client';

import { useMemo, useState } from 'react';
import Header from '@/components/Header';
import WindowBar from '@/components/WindowBar';
import SidebarStatus from '@/components/SidebarStatus';
import StatsBar from '@/components/StatsBar';
import HealthCard from '@/components/HealthCard';
import ActivityCharts from '@/components/ActivityCharts';
import FilterBar from '@/components/FilterBar';
import MessageFeed from '@/components/MessageFeed';
import Tabs from '@/components/Tabs';
import DatabasePanel from '@/components/DatabasePanel';
import QrTokenPanel from '@/components/QrTokenPanel';
import DataControlPanel from '@/components/DataControlPanel';
import FleetPanel from '@/components/FleetPanel';
import ScraperPanel from '@/components/ScraperPanel';
import IdentityPanel from '@/components/IdentityPanel';
import SelfPanel from '@/components/SelfPanel';
import TokenTester from '@/components/TokenTester';
import LicenseGate from '@/components/LicenseGate';
import LicensePanel from '@/components/LicensePanel';
import BrandMark from '@/components/BrandMark';
import OnboardingGate from '@/components/OnboardingGate';
import { useMessagesFeed } from '@/hooks/useMessagesFeed';
import useLicense from '@/hooks/useLicense';

const TABS = [
  { id: 'live', label: 'Feed' },
  { id: 'identity', label: 'Identidade' },
  { id: 'self', label: 'Minha Conta' },
  { id: 'database', label: 'Banco de Dados' },
  { id: 'fleet', label: 'Fleet' },
  { id: 'scraper', label: 'Scraper' },
  { id: 'license', label: 'Licença' },
];

export default function Home() {
  const [tab, setTab] = useState('live');
  const { messages, status } = useMessagesFeed();
  const { status: license, refresh: refreshLicense } = useLicense();
  const [guildFilter, setGuildFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [identityTarget, setIdentityTarget] = useState(null);

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

  /** Busca global (Header) ou "Ver" recente: abre a aba Identidade no usuário alvo. */
  function openIdentity(userId) {
    setIdentityTarget(userId);
    setTab('identity');
  }

  // Boot: enquanto o estado de licença não é conhecido, nada do painel é
  // renderizado — evita flash de conteúdo antes do bloqueio.
  if (license.loading) {
    return (
      <main className="page">
        <div className="boot-screen">
          <BrandMark className="boot-mark" size={40} />
          <div className="boot-spinner" aria-hidden="true" />
          verificando licença…
        </div>
      </main>
    );
  }

  // Fail-closed: se o estado de licença não pôde ser consultado (ex.: painel
  // aberto com credenciais na URL, servidor local fora do ar), NUNCA renderizar
  // o painel destrancado — fica no boot e tenta de novo no próximo poll.
  if (license.unreachable) {
    return (
      <main className="page">
        <div className="boot-screen">
          <BrandMark className="boot-mark" size={40} />
          <div className="boot-spinner" aria-hidden="true" />
          sem conexão com o servidor local — tentando de novo…
        </div>
      </main>
    );
  }

  // Bloqueio de licença: quando habilitado e sem chave válida, nada do painel
  // é renderizado — só a tela de desbloqueio.
  if (license.enforce && !license.valid) {
    return <LicenseGate status={license} onActivated={refreshLicense} />;
  }

  return (
    <div className="app-shell">
      <WindowBar status={status} license={license} />

      <div className={`app-body${tab === 'live' ? ' has-rail' : ''}`}>
        {/* Sidebar — wordmark, busca global, navegação e status do console */}
        <aside className="sidebar">
          <div className="sidebar-top">
            <div className="sidebar-brand">
              <h1 className="wordmark brand-wordmark">
                <BrandMark size={26} />
                HUGGING
              </h1>
              <p className="header-sub">console de inteligência · discord</p>
            </div>
            <Header onOpenIdentity={openIdentity} />
          </div>

          <nav className="sidebar-nav" aria-label="Seções do console">
            <Tabs tabs={TABS} active={tab} onChange={setTab} />
          </nav>

          <SidebarStatus license={license} />
        </aside>

        {/* Workspace — conteúdo da aba ativa */}
        <main className="workspace">
          <div className="page">
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
                <div className="feed-head">
                  <span className="feed-head-title">feed ao vivo</span>
                  <span className="feed-head-count">{filtered.length.toLocaleString('pt-BR')}</span>
                </div>
                <MessageFeed messages={filtered} status={status} />
                <HealthCard />
              </>
            )}
            {tab === 'identity' && (
              <IdentityPanel key={identityTarget ?? 'empty'} initialUserId={identityTarget} />
            )}
            {tab === 'self' && <SelfPanel />}
            {tab === 'database' && (
              <>
                <DatabasePanel />
                <QrTokenPanel />
                <DataControlPanel />
              </>
            )}
            {tab === 'fleet' && (
              <>
                <FleetPanel />
                <TokenTester />
              </>
            )}
            {tab === 'scraper' && <ScraperPanel />}
            {tab === 'license' && <LicensePanel license={license} onRefresh={refreshLicense} />}
          </div>
        </main>

        {/* Rail — atividade 24h e top canais, só na aba Feed */}
        {tab === 'live' && (
          <aside className="rail" aria-label="Estatísticas de atividade">
            <ActivityCharts />
          </aside>
        )}
      </div>

      <OnboardingGate />
    </div>
  );
}
