import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, entriesBetween, uid } from '../db';
import type { Client, Project, Settings, TimeEntry } from '../types';
import {
  addDays,
  dayLabel,
  formatMinutes,
  isToday,
  toDateKey,
  weekDays,
  weekRangeLabel,
} from '../lib/time';
import { entryAmount, formatMoney, resolveRate, sumTotals } from '../lib/money';
import { useClientMap, useProjectMap } from '../hooks/useData';
import { EntryModal } from './EntryModal';
import { BoltIcon, ConfirmDialog, EmptyState, useToast } from './ui';

interface WeekViewProps {
  settings: Settings;
  clients: Client[];
  projects: Project[];
  onGoToClients: () => void;
}

type ModalState =
  | { kind: 'closed' }
  | { kind: 'new'; date: string }
  | { kind: 'edit'; entry: TimeEntry };

export function WeekView({ settings, clients, projects, onGoToClients }: WeekViewProps) {
  const toast = useToast();
  const [anchor, setAnchor] = useState(() => new Date());
  const [hideWeekend, setHideWeekend] = useState(
    () => localStorage.getItem('timebolt.hideWeekend') === '1',
  );
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [copyPrompt, setCopyPrompt] = useState<TimeEntry[] | null>(null);

  const days = useMemo(() => weekDays(anchor, settings.weekStart), [anchor, settings.weekStart]);
  const visibleDays = useMemo(
    () => (hideWeekend ? days.filter((d) => d.getDay() !== 0 && d.getDay() !== 6) : days),
    [days, hideWeekend],
  );
  const fromKey = toDateKey(days[0]);
  const toKey = toDateKey(days[6]);

  const entries = useLiveQuery(() => entriesBetween(fromKey, toKey), [fromKey, toKey]);
  const projectById = useProjectMap(projects);
  const clientById = useClientMap(clients);

  const byDay = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const e of entries ?? []) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.createdAt - b.createdAt);
    }
    return map;
  }, [entries]);

  const weekTotals = useMemo(
    () => sumTotals(entries ?? [], projectById, clientById, settings),
    [entries, projectById, clientById, settings],
  );

  const toggleWeekend = () => {
    const next = !hideWeekend;
    setHideWeekend(next);
    localStorage.setItem('timebolt.hideWeekend', next ? '1' : '0');
  };

  /* ----------------------------- copy last week ---------------------------- */

  const promptCopyLastWeek = async () => {
    const prevFrom = toDateKey(addDays(days[0], -7));
    const prevTo = toDateKey(addDays(days[6], -7));
    const prev = await entriesBetween(prevFrom, prevTo);
    if (prev.length === 0) {
      toast('Last week has no entries to copy', 'error');
      return;
    }
    setCopyPrompt(prev);
  };

  const copyLastWeek = async (prev: TimeEntry[]) => {
    const timestamp = Date.now();
    const cloned = prev.map((e) => ({
      ...e,
      id: uid(),
      date: toDateKey(addDays(new Date(e.date + 'T00:00:00'), 7)),
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    await db.entries.bulkPut(cloned);
    setCopyPrompt(null);
    toast(`Copied ${cloned.length} ${cloned.length === 1 ? 'entry' : 'entries'} from last week`);
  };

  /* --------------------------------- render -------------------------------- */

  const hasAnyProjects = projects.some((p) => !p.archived);
  const loaded = entries !== undefined;
  const weekIsEmpty = loaded && (entries?.length ?? 0) === 0;

  return (
    <div className="page week-page">
      <div className="page-toolbar">
        <div className="week-nav">
          <button className="icon-btn" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Previous week" type="button">
            ‹
          </button>
          <button className="btn btn-sm" onClick={() => setAnchor(new Date())} type="button">
            Today
          </button>
          <button className="icon-btn" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Next week" type="button">
            ›
          </button>
          <h1 className="week-title">{weekRangeLabel(days)}</h1>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-sm" onClick={toggleWeekend} type="button">
            {hideWeekend ? '7 days' : '5 days'}
          </button>
          <button className="btn btn-sm" onClick={() => void promptCopyLastWeek()} type="button">
            Copy last week
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setModal({ kind: 'new', date: toDateKey(new Date()) })}
            type="button"
          >
            + New entry
          </button>
        </div>
      </div>

      {!hasAnyProjects && weekIsEmpty ? (
        <EmptyState
          icon={<BoltIcon size={34} />}
          title="Welcome to TimeBolt"
          message="Set up your first client and project, then log time straight onto your week."
          action={
            <button className="btn btn-primary" onClick={onGoToClients} type="button">
              Add a client
            </button>
          }
        />
      ) : (
        <div className={`week-grid ${hideWeekend ? 'week-grid-5' : ''}`}>
          {visibleDays.map((day) => {
            const key = toDateKey(day);
            const dayEntries = byDay.get(key) ?? [];
            const dayMinutes = dayEntries.reduce((sum, e) => sum + e.minutes, 0);
            const label = dayLabel(day);
            return (
              <section key={key} className={`day-col ${isToday(day) ? 'day-today' : ''}`}>
                <header className="day-head">
                  <span className="day-name">
                    {label.weekday} <strong>{label.day}</strong>
                  </span>
                  <span className="day-total">
                    {dayMinutes > 0 ? formatMinutes(dayMinutes, settings.timeFormat) : ''}
                  </span>
                </header>
                <div className="day-entries">
                  {dayEntries.map((entry) => {
                    const project = projectById.get(entry.projectId);
                    const client = project ? clientById.get(project.clientId) : undefined;
                    const amount = entryAmount(entry, resolveRate(project, client), settings);
                    return (
                      <button
                        key={entry.id}
                        className="entry-card"
                        style={{ borderLeftColor: project?.color ?? 'var(--border)' }}
                        onClick={() => setModal({ kind: 'edit', entry })}
                        type="button"
                      >
                        <span className="entry-top">
                          <span className="entry-project">{project?.name ?? 'Unknown'}</span>
                          <span className="entry-time">
                            {formatMinutes(entry.minutes, settings.timeFormat)}
                          </span>
                        </span>
                        <span className="entry-meta">
                          <span className="entry-client">{client?.name ?? ''}</span>
                          {entry.billable && amount > 0 && (
                            <span className="entry-amount">
                              {formatMoney(amount, settings.currency)}
                            </span>
                          )}
                          {!entry.billable && <span className="entry-nonbill">non-billable</span>}
                        </span>
                        {entry.note && <span className="entry-note">{entry.note}</span>}
                      </button>
                    );
                  })}
                  <button
                    className="day-add"
                    onClick={() => setModal({ kind: 'new', date: key })}
                    type="button"
                  >
                    +
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <footer className="week-summary">
        <span>
          <strong>{formatMinutes(weekTotals.minutes, settings.timeFormat)}</strong> tracked
        </span>
        <span>
          <strong>{formatMinutes(weekTotals.billableMinutes, settings.timeFormat)}</strong> billable
        </span>
        <span className="week-amount">
          <strong>{formatMoney(weekTotals.amount, settings.currency)}</strong>
        </span>
      </footer>

      {modal.kind === 'new' && (
        <EntryModal
          entry={null}
          defaultDate={modal.date}
          clients={clients}
          projects={projects}
          onClose={() => setModal({ kind: 'closed' })}
        />
      )}
      {modal.kind === 'edit' && (
        <EntryModal
          entry={modal.entry}
          clients={clients}
          projects={projects}
          onClose={() => setModal({ kind: 'closed' })}
        />
      )}
      {copyPrompt && (
        <ConfirmDialog
          title="Copy last week?"
          message={`This adds ${copyPrompt.length} ${copyPrompt.length === 1 ? 'entry' : 'entries'} from last week into this week. Existing entries stay untouched.`}
          confirmLabel="Copy entries"
          onConfirm={() => void copyLastWeek(copyPrompt)}
          onCancel={() => setCopyPrompt(null)}
        />
      )}
    </div>
  );
}
