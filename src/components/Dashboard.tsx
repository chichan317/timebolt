import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { entriesBetween } from '../db';
import type { Client, Project, Settings, TimeEntry } from '../types';
import {
  endOfMonth,
  formatMinutes,
  startOfMonth,
  startOfWeek,
  toDateKey,
  todayKey,
  addDays,
} from '../lib/time';
import { entryAmount, formatMoney, isFixedPrice, isRetainer, resolveRate, sumTotals } from '../lib/money';
import { useClientMap, useProjectMap } from '../hooks/useData';
import { Donut, type DonutSlice } from './Donut';

interface DashboardProps {
  settings: Settings;
  clients: Client[];
  projects: Project[];
}

interface ProjectSlice {
  project: Project | undefined;
  client: Client | undefined;
  minutes: number;
  amount: number;
}

export function Dashboard({ settings, clients, projects }: DashboardProps) {
  const now = new Date();
  const weekStartDate = startOfWeek(now, settings.weekStart);
  const monthFrom = toDateKey(startOfMonth(now));
  const monthTo = toDateKey(endOfMonth(now));
  const weekFrom = toDateKey(weekStartDate);
  const weekTo = toDateKey(addDays(weekStartDate, 6));
  const today = todayKey();

  // The month range nearly always contains the week + today, but weeks can
  // straddle months, so fetch the union range and slice locally.
  const rangeFrom = weekFrom < monthFrom ? weekFrom : monthFrom;
  const rangeTo = weekTo > monthTo ? weekTo : monthTo;

  const entries = useLiveQuery(() => entriesBetween(rangeFrom, rangeTo), [rangeFrom, rangeTo]);
  const projectById = useProjectMap(projects);
  const clientById = useClientMap(clients);

  const slices = useMemo(() => {
    const all = entries ?? [];
    const todayEntries = all.filter((e) => e.date === today);
    const weekEntries = all.filter((e) => e.date >= weekFrom && e.date <= weekTo);
    const monthEntries = all.filter((e) => e.date >= monthFrom && e.date <= monthTo);
    return { todayEntries, weekEntries, monthEntries };
  }, [entries, today, weekFrom, weekTo, monthFrom, monthTo]);

  const cards = [
    { label: 'Today', data: slices.todayEntries },
    { label: 'This week', data: slices.weekEntries },
    { label: 'This month', data: slices.monthEntries },
  ].map(({ label, data }) => ({
    label,
    totals: sumTotals(data, projectById, clientById, settings),
  }));

  const weekByProject = useMemo<ProjectSlice[]>(() => {
    const map = new Map<string, ProjectSlice>();
    for (const e of slices.weekEntries) {
      const project = projectById.get(e.projectId);
      const client = project ? clientById.get(project.clientId) : undefined;
      const slice = map.get(e.projectId) ?? { project, client, minutes: 0, amount: 0 };
      slice.minutes += e.minutes;
      slice.amount += entryAmount(e, resolveRate(project, client), settings);
      map.set(e.projectId, slice);
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [slices.weekEntries, projectById, clientById, settings]);

  const recent = useMemo<TimeEntry[]>(() => {
    return [...(entries ?? [])]
      .sort((a, b) => (a.date === b.date ? b.updatedAt - a.updatedAt : b.date.localeCompare(a.date)))
      .slice(0, 8);
  }, [entries]);

  const maxProjectMinutes = weekByProject[0]?.minutes ?? 0;
  const weekMinutes = weekByProject.reduce((sum, s) => sum + s.minutes, 0);
  const donutSlices: DonutSlice[] = weekByProject.map((s) => ({
    label: s.project?.name ?? 'Unknown',
    value: s.minutes,
    color: s.project?.color ?? 'var(--border)',
  }));
  const pct = (minutes: number) => (weekMinutes > 0 ? Math.round((minutes / weekMinutes) * 100) : 0);
  const donutAria =
    weekMinutes > 0
      ? `Time by project this week: ${weekByProject
          .map((s) => `${s.project?.name ?? 'Unknown'} ${pct(s.minutes)} percent`)
          .join(', ')}`
      : 'No time tracked this week';

  return (
    <div className="page">
      <div className="page-toolbar">
        <h1>Dashboard</h1>
      </div>

      <div className="stat-cards">
        {cards.map(({ label, totals }) => (
          <div key={label} className="stat-card">
            <span className="stat-label">{label}</span>
            <span className="stat-hours">{formatMinutes(totals.minutes, settings.timeFormat)}</span>
            <span className="stat-amount">{formatMoney(totals.amount, settings.currency)}</span>
            <span className="stat-sub">
              {formatMinutes(totals.billableMinutes, settings.timeFormat)} billable
            </span>
          </div>
        ))}
      </div>

      <div className="dash-columns">
        <section className="panel">
          <h2>This week by project</h2>
          {weekByProject.length === 0 ? (
            <p className="muted">Nothing tracked this week yet.</p>
          ) : (
            <div className="byproject">
              <div className="byproject-chart">
                <Donut
                  slices={donutSlices}
                  centerLabel={formatMinutes(weekMinutes, settings.timeFormat)}
                  centerSub="this week"
                  ariaLabel={donutAria}
                />
              </div>
              <ul className="bar-list byproject-legend">
                {weekByProject.map((slice) => (
                  <li key={slice.project?.id ?? 'unknown'}>
                    <div className="bar-row">
                      <span className="bar-dot" style={{ background: slice.project?.color ?? 'var(--border)' }} />
                      <span className="bar-name">
                        {slice.project?.name ?? 'Unknown'}
                        {slice.client && <span className="bar-client"> · {slice.client.name}</span>}
                      </span>
                      <span className="bar-value">
                        <span className="bar-pct">{pct(slice.minutes)}%</span>
                        {formatMinutes(slice.minutes, settings.timeFormat)}
                        {isRetainer(slice.client) ? (
                          <span className="tag tag-retainer">retainer</span>
                        ) : isFixedPrice(slice.project) ? (
                          <span className="tag tag-fixed">fixed</span>
                        ) : (
                          slice.amount > 0 && (
                            <span className="bar-amount"> {formatMoney(slice.amount, settings.currency)}</span>
                          )
                        )}
                      </span>
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${maxProjectMinutes > 0 ? (slice.minutes / maxProjectMinutes) * 100 : 0}%`,
                          background: slice.project?.color ?? 'var(--border)',
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Recent entries</h2>
          {recent.length === 0 ? (
            <p className="muted">No entries yet. Start the timer or add time on the Week page.</p>
          ) : (
            <ul className="recent-list">
              {recent.map((entry) => {
                const project = projectById.get(entry.projectId);
                return (
                  <li key={entry.id}>
                    <span className="bar-dot" style={{ background: project?.color ?? 'var(--border)' }} />
                    <span className="recent-name">
                      {project?.name ?? 'Unknown'}
                      {entry.note && <span className="recent-note"> — {entry.note}</span>}
                    </span>
                    <span className="recent-date">{entry.date.slice(5)}</span>
                    <span className="recent-time">{formatMinutes(entry.minutes, settings.timeFormat)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
