import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { entriesBetween } from '../db';
import type { Client, Project, Settings, TimeEntry } from '../types';
import {
  addDays,
  endOfMonth,
  formatMinutes,
  shortDateLabel,
  startOfMonth,
  startOfWeek,
  toDateKey,
} from '../lib/time';
import { billedMinutes, entryAmount, formatMoney, resolveRate, sumTotals } from '../lib/money';
import { useClientMap, useProjectMap } from '../hooks/useData';
import { buildCsv, downloadFile } from '../lib/csv';
import { EntryModal } from './EntryModal';
import { useToast } from './ui';

interface ReportsProps {
  settings: Settings;
  clients: Client[];
  projects: Project[];
}

type Preset = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';
type BillableFilter = 'all' | 'billable' | 'nonbillable';

function presetRange(preset: Preset, settings: Settings): { from: string; to: string } {
  const now = new Date();
  switch (preset) {
    case 'thisWeek': {
      const start = startOfWeek(now, settings.weekStart);
      return { from: toDateKey(start), to: toDateKey(addDays(start, 6)) };
    }
    case 'lastWeek': {
      const start = addDays(startOfWeek(now, settings.weekStart), -7);
      return { from: toDateKey(start), to: toDateKey(addDays(start, 6)) };
    }
    case 'thisMonth':
      return { from: toDateKey(startOfMonth(now)), to: toDateKey(endOfMonth(now)) };
    case 'lastMonth': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: toDateKey(prev), to: toDateKey(endOfMonth(prev)) };
    }
    case 'thisYear':
      return {
        from: toDateKey(new Date(now.getFullYear(), 0, 1)),
        to: toDateKey(new Date(now.getFullYear(), 11, 31)),
      };
    case 'custom':
      return { from: '', to: '' };
  }
}

export function Reports({ settings, clients, projects }: ReportsProps) {
  const toast = useToast();
  const [preset, setPreset] = useState<Preset>('thisWeek');
  const initial = presetRange('thisWeek', settings);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [clientFilter, setClientFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [billableFilter, setBillableFilter] = useState<BillableFilter>('all');
  const [editing, setEditing] = useState<TimeEntry | null>(null);

  const projectById = useProjectMap(projects);
  const clientById = useClientMap(clients);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') {
      const range = presetRange(p, settings);
      setFrom(range.from);
      setTo(range.to);
    }
  };

  const rangeValid = from !== '' && to !== '' && from <= to;
  const raw = useLiveQuery(
    () => (rangeValid ? entriesBetween(from, to) : Promise.resolve([] as TimeEntry[])),
    [from, to, rangeValid],
  );

  const filtered = useMemo(() => {
    return (raw ?? [])
      .filter((e) => {
        const project = projectById.get(e.projectId);
        if (projectFilter && e.projectId !== projectFilter) return false;
        if (clientFilter && project?.clientId !== clientFilter) return false;
        if (billableFilter === 'billable' && !e.billable) return false;
        if (billableFilter === 'nonbillable' && e.billable) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  }, [raw, projectFilter, clientFilter, billableFilter, projectById]);

  const totals = useMemo(
    () => sumTotals(filtered, projectById, clientById, settings),
    [filtered, projectById, clientById, settings],
  );

  /* ------------------------- grouped client/project ------------------------ */

  interface GroupRow {
    clientName: string;
    projectName: string;
    color: string;
    minutes: number;
    billableMinutes: number;
    amount: number;
  }

  const groups = useMemo<GroupRow[]>(() => {
    const map = new Map<string, GroupRow>();
    for (const e of filtered) {
      const project = projectById.get(e.projectId);
      const client = project ? clientById.get(project.clientId) : undefined;
      const key = e.projectId;
      const row = map.get(key) ?? {
        clientName: client?.name ?? 'Unknown client',
        projectName: project?.name ?? 'Unknown project',
        color: project?.color ?? 'var(--border)',
        minutes: 0,
        billableMinutes: 0,
        amount: 0,
      };
      row.minutes += e.minutes;
      if (e.billable) row.billableMinutes += e.minutes;
      row.amount += entryAmount(e, resolveRate(project, client), settings);
      map.set(key, row);
    }
    return [...map.values()].sort(
      (a, b) =>
        a.clientName.localeCompare(b.clientName) || a.projectName.localeCompare(b.projectName),
    );
  }, [filtered, projectById, clientById, settings]);

  /* -------------------------------- CSV export ------------------------------ */

  const exportCsv = () => {
    const header = [
      'Date',
      'Client',
      'Project',
      'Note',
      'Billable',
      'Hours',
      'Billed hours',
      'Rate',
      'Amount',
      'Currency',
    ];
    const rows = filtered.map((e) => {
      const project = projectById.get(e.projectId);
      const client = project ? clientById.get(project.clientId) : undefined;
      const rate = resolveRate(project, client);
      const billed = e.billable ? billedMinutes(e, settings) : 0;
      return [
        e.date,
        client?.name ?? '',
        project?.name ?? '',
        e.note,
        e.billable ? 'yes' : 'no',
        (e.minutes / 60).toFixed(2),
        (billed / 60).toFixed(2),
        e.billable ? rate.toFixed(2) : '',
        entryAmount(e, rate, settings).toFixed(2),
        settings.currency,
      ];
    });
    downloadFile(`timebolt-report-${from}-to-${to}.csv`, buildCsv([header, ...rows]), 'text/csv');
    toast('CSV exported');
  };

  const selectableProjects = projects.filter(
    (p) => clientFilter === '' || p.clientId === clientFilter,
  );

  return (
    <div className="page">
      <div className="page-toolbar">
        <h1>Reports</h1>
        <div className="toolbar-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            type="button"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="filters">
        <label className="field">
          <span>Range</span>
          <select value={preset} onChange={(e) => choosePreset(e.target.value as Preset)}>
            <option value="thisWeek">This week</option>
            <option value="lastWeek">Last week</option>
            <option value="thisMonth">This month</option>
            <option value="lastMonth">Last month</option>
            <option value="thisYear">This year</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label className="field">
          <span>From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset('custom');
            }}
          />
        </label>
        <label className="field">
          <span>To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset('custom');
            }}
          />
        </label>
        <label className="field">
          <span>Client</span>
          <select
            value={clientFilter}
            onChange={(e) => {
              setClientFilter(e.target.value);
              setProjectFilter('');
            }}
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Project</span>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="">All projects</option>
            {selectableProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Billable</span>
          <select
            value={billableFilter}
            onChange={(e) => setBillableFilter(e.target.value as BillableFilter)}
          >
            <option value="all">All</option>
            <option value="billable">Billable only</option>
            <option value="nonbillable">Non-billable only</option>
          </select>
        </label>
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-label">Total time</span>
          <span className="stat-hours">{formatMinutes(totals.minutes, settings.timeFormat)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Billable time</span>
          <span className="stat-hours">
            {formatMinutes(totals.billableMinutes, settings.timeFormat)}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Billable amount</span>
          <span className="stat-hours">{formatMoney(totals.amount, settings.currency)}</span>
          {settings.rounding > 0 && (
            <span className="stat-sub">
              rounded to {settings.rounding} min ({settings.roundingMode})
            </span>
          )}
        </div>
      </div>

      {groups.length > 0 && (
        <section className="panel">
          <h2>By client &amp; project</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Project</th>
                <th className="num">Time</th>
                <th className="num">Billable</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={`${g.clientName}-${g.projectName}`}>
                  <td>{g.clientName}</td>
                  <td>
                    <span className="bar-dot" style={{ background: g.color }} /> {g.projectName}
                  </td>
                  <td className="num">{formatMinutes(g.minutes, settings.timeFormat)}</td>
                  <td className="num">{formatMinutes(g.billableMinutes, settings.timeFormat)}</td>
                  <td className="num">{formatMoney(g.amount, settings.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="panel">
        <h2>Entries ({filtered.length})</h2>
        {filtered.length === 0 ? (
          <p className="muted">No entries match these filters.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Client / project</th>
                <th>Note</th>
                <th className="num">Time</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const project = projectById.get(e.projectId);
                const client = project ? clientById.get(project.clientId) : undefined;
                const amount = entryAmount(e, resolveRate(project, client), settings);
                return (
                  <tr key={e.id} className="row-clickable" onClick={() => setEditing(e)}>
                    <td>{shortDateLabel(e.date)}</td>
                    <td>
                      <span className="bar-dot" style={{ background: project?.color ?? 'var(--border)' }} />{' '}
                      {client?.name ?? '?'} — {project?.name ?? '?'}
                    </td>
                    <td className="cell-note">{e.note}</td>
                    <td className="num">
                      {formatMinutes(e.minutes, settings.timeFormat)}
                      {!e.billable && <span className="entry-nonbill"> NB</span>}
                    </td>
                    <td className="num">{amount > 0 ? formatMoney(amount, settings.currency) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {editing && (
        <EntryModal
          entry={editing}
          clients={clients}
          projects={projects}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
