import { useEffect, useRef, useState } from 'react';
import { clearAllData, db, saveSettings } from '../db';
import type {
  BusinessProfile,
  Client,
  Project,
  RoundingIncrement,
  RoundingMode,
  Settings,
  ThemePref,
  TimeFormat,
  WeekStart,
} from '../types';
import { CURRENCIES } from '../types';
import { exportBackup, parseBackup, restoreBackup } from '../lib/backup';
import { buildCsv, downloadFile } from '../lib/csv';
import { billedMinutes, entryAmount, resolveRate } from '../lib/money';
import {
  formatBytes,
  getStorageInfo,
  lastBackupAt,
  type StorageInfo,
} from '../lib/storage';
import { ConfirmDialog, useToast } from './ui';
import { SyncSettings } from './SyncSettings';

interface SettingsPageProps {
  settings: Settings;
  clients: Client[];
  projects: Project[];
}

export function SettingsPage({ settings, clients, projects }: SettingsPageProps) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [pendingImport, setPendingImport] = useState<ReturnType<typeof parseBackup> | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [backupTime, setBackupTime] = useState<number | null>(lastBackupAt);

  const emptyBusiness: BusinessProfile = { name: '', abn: '', address: '', email: '', payment: '' };
  const [biz, setBiz] = useState<BusinessProfile>(settings.business ?? emptyBusiness);
  const updateBiz = (patch: Partial<BusinessProfile>) => {
    const next = { ...biz, ...patch };
    setBiz(next);
    void saveSettings({ business: next });
  };

  useEffect(() => {
    void getStorageInfo().then(setStorageInfo);
  }, []);

  const update = (patch: Partial<Settings>) => {
    void saveSettings(patch);
  };

  /* ------------------------------ JSON import ------------------------------ */

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const backup = parseBackup(text);
      setPendingImport(backup);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not read that file.', 'error');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const runImport = async () => {
    if (!pendingImport) return;
    await restoreBackup(pendingImport);
    setPendingImport(null);
    toast('Backup restored');
  };

  /* ------------------------------ full CSV dump ----------------------------- */

  const exportAllCsv = async () => {
    const entries = await db.entries.toArray();
    if (entries.length === 0) {
      toast('No entries to export yet', 'error');
      return;
    }
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const header = [
      'Date', 'Client', 'Project', 'Note', 'Billable',
      'Hours', 'Billed hours', 'Rate', 'Amount', 'Currency',
    ];
    const rows = entries
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => {
        const project = projectById.get(e.projectId);
        const client = project ? clientById.get(project.clientId) : undefined;
        const rate = resolveRate(project, client);
        return [
          e.date,
          client?.name ?? '',
          project?.name ?? '',
          e.note,
          e.billable ? 'yes' : 'no',
          (e.minutes / 60).toFixed(2),
          e.billable ? (billedMinutes(e, settings) / 60).toFixed(2) : '0.00',
          e.billable ? rate.toFixed(2) : '',
          entryAmount(e, rate, settings).toFixed(2),
          settings.currency,
        ];
      });
    downloadFile('timebolt-all-entries.csv', buildCsv([header, ...rows]), 'text/csv');
    toast('CSV exported');
  };

  return (
    <div className="page page-narrow">
      <div className="page-toolbar">
        <h1>Settings</h1>
      </div>

      <section className="panel">
        <h2>Preferences</h2>
        <div className="settings-grid">
          <label className="field">
            <span>Currency</span>
            <select value={settings.currency} onChange={(e) => update({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Week starts on</span>
            <select
              value={settings.weekStart}
              onChange={(e) => update({ weekStart: Number(e.target.value) as WeekStart })}
            >
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
              <option value={6}>Saturday</option>
            </select>
          </label>

          <label className="field">
            <span>Time display</span>
            <select
              value={settings.timeFormat}
              onChange={(e) => update({ timeFormat: e.target.value as TimeFormat })}
            >
              <option value="hm">Hours &amp; minutes (1:30)</option>
              <option value="decimal">Decimal hours (1.50)</option>
            </select>
          </label>

          <label className="field">
            <span>Theme</span>
            <select
              value={settings.theme}
              onChange={(e) => update({ theme: e.target.value as ThemePref })}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>

          <label className="field">
            <span>Rounding for billing</span>
            <select
              value={settings.rounding}
              onChange={(e) => update({ rounding: Number(e.target.value) as RoundingIncrement })}
            >
              <option value={0}>No rounding (exact minutes)</option>
              <option value={5}>5 minutes</option>
              <option value={6}>6 minutes (1/10 hour)</option>
              <option value={10}>10 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
            </select>
          </label>

          <label className="field">
            <span>Rounding direction</span>
            <select
              value={settings.roundingMode}
              onChange={(e) => update({ roundingMode: e.target.value as RoundingMode })}
              disabled={settings.rounding === 0}
            >
              <option value="nearest">To nearest</option>
              <option value="up">Always up</option>
            </select>
          </label>
        </div>
        <p className="muted small">
          Rounding only affects billable amounts in reports and exports — your tracked minutes are
          stored exactly as entered.
        </p>
      </section>

      <section className="panel">
        <h2>Business details</h2>
        <p className="muted small">
          Your details for invoices — filled in once and reused. They sync to your devices.
        </p>
        <div className="settings-grid">
          <label className="field">
            <span>Business name</span>
            <input
              type="text"
              value={biz.name}
              onChange={(e) => updateBiz({ name: e.target.value })}
              placeholder="Your business or your name"
            />
          </label>
          <label className="field">
            <span>ABN</span>
            <input
              type="text"
              value={biz.abn}
              onChange={(e) => updateBiz({ abn: e.target.value })}
              placeholder="e.g. 12 345 678 901"
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={biz.email}
              onChange={(e) => updateBiz({ email: e.target.value })}
              placeholder="you@example.com"
            />
          </label>
        </div>
        <label className="field">
          <span>Address</span>
          <textarea
            value={biz.address}
            onChange={(e) => updateBiz({ address: e.target.value })}
            placeholder="Street, suburb, state, postcode"
            rows={2}
          />
        </label>
        <label className="field">
          <span>Payment details</span>
          <textarea
            value={biz.payment}
            onChange={(e) => updateBiz({ payment: e.target.value })}
            placeholder="Bank name, BSB, account number, or payment terms"
            rows={2}
          />
        </label>
      </section>

      <section className="panel">
        <h2>Data</h2>
        <p className="muted small">
          Everything lives in this browser's storage — nothing is sent to any server. Browsers can
          evict local data (clearing site data, private windows, storage pressure), so download a
          JSON backup regularly.
        </p>
        <ul className="storage-status">
          <li>
            <span className="storage-label">Storage durability</span>
            {storageInfo === null || storageInfo.persisted === null ? (
              <span>unknown (browser doesn't report it)</span>
            ) : storageInfo.persisted ? (
              <span className="storage-good">persistent — the browser won't auto-evict it</span>
            ) : (
              <span className="storage-warn">
                best-effort — the browser may evict it under storage pressure
              </span>
            )}
          </li>
          {storageInfo?.usage !== null && storageInfo?.usage !== undefined && (
            <li>
              <span className="storage-label">Space used</span>
              <span>
                {formatBytes(storageInfo.usage)}
                {storageInfo.quota ? ` of ${formatBytes(storageInfo.quota)} available` : ''}
              </span>
            </li>
          )}
          <li>
            <span className="storage-label">Last backup</span>
            {backupTime === null ? (
              <span className="storage-warn">never</span>
            ) : (
              <span>{new Date(backupTime).toLocaleDateString()}</span>
            )}
          </li>
        </ul>
        <div className="settings-actions">
          <button
            className="btn"
            onClick={() => {
              void exportBackup().then(() => {
                setBackupTime(lastBackupAt());
                toast('Backup downloaded');
              });
            }}
            type="button"
          >
            Download JSON backup
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} type="button">
            Restore from backup…
          </button>
          <button className="btn" onClick={() => void exportAllCsv()} type="button">
            Export all entries (CSV)
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImportFile(file);
          }}
        />
      </section>

      <SyncSettings />

      <section className="panel panel-danger">
        <h2>Danger zone</h2>
        <p className="muted small">Removes every client, project, entry and setting from this browser.</p>
        <button className="btn btn-danger" onClick={() => setConfirmWipe(true)} type="button">
          Delete all data
        </button>
      </section>

      {confirmWipe && (
        <ConfirmDialog
          title="Delete all data?"
          message="This permanently wipes all clients, projects and time entries from this browser. Download a backup first if you might need them."
          confirmLabel="Delete everything"
          danger
          onConfirm={() => {
            void clearAllData().then(() => {
              setConfirmWipe(false);
              toast('All data deleted');
            });
          }}
          onCancel={() => setConfirmWipe(false)}
        />
      )}

      {pendingImport && (
        <ConfirmDialog
          title="Restore this backup?"
          message={`The backup contains ${pendingImport.clients.length} client(s), ${pendingImport.projects.length} project(s) and ${pendingImport.entries.length} entr${pendingImport.entries.length === 1 ? 'y' : 'ies'}${pendingImport.exportedAt ? `, exported ${pendingImport.exportedAt.slice(0, 10)}` : ''}. Restoring REPLACES everything currently in this browser.`}
          confirmLabel="Replace my data"
          danger
          onConfirm={() => void runImport()}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}
