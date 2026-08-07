'use client';

import { useMemo } from 'react';
import { usePolledResource } from '@/hooks/usePolledResource';

const DAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const HOUR_STEP_LABELS = 4; // rótulo a cada 4h no eixo das 24h

/** Gráficos de atividade (CSS puro, sem lib): distribuição por hora, últimos 14 dias,
 *  top canais e top autores. Atualiza por polling leve a cada 15s. */
export default function ActivityCharts() {
  const { data } = usePolledResource('/api/stats', { intervalMs: 15000 });

  // Extração + máximos em um único useMemo para evitar recriação por render.
  const chart = useMemo(() => {
    const hourly = data?.hourly ?? [];
    const daily = data?.daily ?? [];
    const topChannels = data?.topChannels ?? [];
    const topAuthors = data?.topAuthors ?? [];
    return {
      totals: data?.totals,
      hourly,
      daily,
      topChannels,
      topAuthors,
      maxHourly: Math.max(1, ...hourly.map(h => h.n)),
      maxDaily: Math.max(1, ...daily.map(d => d.n)),
      maxChannels: Math.max(1, ...topChannels.map(c => c.n)),
      maxAuthors: Math.max(1, ...topAuthors.map(a => a.n)),
    };
  }, [data]);

  const { totals, hourly, daily, topChannels, topAuthors, maxHourly, maxDaily, maxChannels, maxAuthors } = chart;

  return (
    <section className="charts" aria-label="Estatísticas de atividade">
      <div className="chart-card chart-card-wide">
        <ChartTitle>Mensagens por hora do dia</ChartTitle>
        <div className="chart-bars chart-bars-hourly">
          {hourly.map(({ hour, n }) => (
            <div key={hour} className="chart-bar-col" title={`${String(hour).padStart(2, '0')}h — ${n} msg`}>
              <div className="chart-bar-track">
                <div className="chart-bar" style={{ height: `${Math.max(2, (n / maxHourly) * 100)}%` }} />
              </div>
              {hour % HOUR_STEP_LABELS === 0 && <span className="chart-axis-label">{hour}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="chart-card chart-card-wide">
        <ChartTitle>Últimos 14 dias</ChartTitle>
        <div className="chart-bars chart-bars-daily">
          {daily.map(({ day, n }) => {
            const date = new Date(`${day}T00:00:00Z`);
            const label = Number.isNaN(date.getTime()) ? day.slice(5) : DAY_LABELS[date.getUTCDay()];
            return (
              <div key={day} className="chart-bar-col" title={`${day} — ${n} msg`}>
                <div className="chart-bar-track">
                  <div className="chart-bar chart-bar-dim" style={{ height: `${Math.max(2, (n / maxDaily) * 100)}%` }} />
                </div>
                <span className="chart-axis-label chart-axis-label-sm">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="chart-card">
        <ChartTitle>Top canais</ChartTitle>
        {topChannels.length === 0 ? (
          <p className="panel-hint">Sem dados de canal ainda.</p>
        ) : (
          <div className="chart-rows">
            {topChannels.map(({ channel, guild, n }, index) => (
              <div key={`${guild ?? ''}::${channel}`} className="chart-row" title={guild ? `${guild} · ${channel}` : channel}>
                <span className="chart-row-rank">{index + 1}</span>
                <div className="chart-row-body">
                  <div className="chart-row-head">
                    <span className="chart-row-label">#{channel}</span>
                    <span className="chart-row-value">{n}</span>
                  </div>
                  <div className="chart-row-track">
                    <div className="chart-row-fill" style={{ width: `${(n / maxChannels) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="chart-card">
        <ChartTitle>Top autores</ChartTitle>
        {topAuthors.length === 0 ? (
          <p className="panel-hint">Sem dados de autor ainda.</p>
        ) : (
          <div className="chart-rows">
            {topAuthors.map(({ author, n }, index) => (
              <div key={author} className="chart-row">
                <span className="chart-row-rank">{index + 1}</span>
                <div className="chart-row-body">
                  <div className="chart-row-head">
                    <span className="chart-row-label">{author}</span>
                    <span className="chart-row-value">{n}</span>
                  </div>
                  <div className="chart-row-track">
                    <div className="chart-row-fill chart-row-fill-violet" style={{ width: `${(n / maxAuthors) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {totals && (
        <div className="chart-card chart-card-totals">
          <ChartTitle>Volume total</ChartTitle>
          <div className="chart-totals">
            <TotalStat value={totals.messages} label="mensagens" />
            <TotalStat value={totals.authors} label="autores únicos" />
            <TotalStat value={totals.guilds} label="servidores" />
          </div>
        </div>
      )}
    </section>
  );
}

function ChartTitle({ children }) {
  return <h3 className="chart-title">{children}</h3>;
}

function TotalStat({ value, label }) {
  return (
    <div className="chart-total">
      <span className="chart-total-value">{value.toLocaleString('pt-BR')}</span>
      <span className="chart-total-label">{label}</span>
    </div>
  );
}
