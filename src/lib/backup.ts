import { db, clearAllData, getSettings } from '../db';
import type { BackupFile, Client, Project, Settings, TimeEntry, WorkTemplate } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { downloadFile } from './csv';
import { markBackupDone } from './storage';
import { loadTimer } from './timerStore';

/** Build the full backup document (the single source of truth for the data). */
export async function buildBackupData(): Promise<BackupFile> {
  const [settings, clients, projects, entries, templates] = await Promise.all([
    getSettings(),
    db.clients.toArray(),
    db.projects.toArray(),
    db.entries.toArray(),
    db.templates.toArray(),
  ]);
  return {
    app: 'timebolt',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    clients,
    projects,
    entries,
    templates,
    timer: loadTimer(),
  };
}

/** Build and download a full JSON backup. */
export async function exportBackup(): Promise<void> {
  const backup = await buildBackupData();
  const stamp = new Date().toISOString().slice(0, 10);
  downloadFile(`timebolt-backup-${stamp}.json`, JSON.stringify(backup, null, 2), 'application/json');
  markBackupDone();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function validClient(v: unknown): v is Client {
  return isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string';
}

function validProject(v: unknown): v is Project {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.clientId === 'string' &&
    typeof v.name === 'string'
  );
}

function validEntry(v: unknown): v is TimeEntry {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.projectId === 'string' &&
    typeof v.date === 'string' &&
    typeof v.minutes === 'number' &&
    v.minutes > 0
  );
}

function validTemplate(v: unknown): v is WorkTemplate {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.projectId === 'string' &&
    typeof v.minutes === 'number' &&
    v.minutes > 0
  );
}

/** Parse + validate a backup file. Throws with a readable message on bad input. */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!isRecord(data) || data.app !== 'timebolt') {
    throw new Error('That file does not look like a TimeBolt backup.');
  }
  if (data.version !== 1) {
    throw new Error(`Unsupported backup version: ${String(data.version)}.`);
  }
  const clients = Array.isArray(data.clients) ? data.clients.filter(validClient) : [];
  const projects = Array.isArray(data.projects) ? data.projects.filter(validProject) : [];
  const entries = Array.isArray(data.entries) ? data.entries.filter(validEntry) : [];
  const templates = Array.isArray(data.templates) ? data.templates.filter(validTemplate) : [];
  const settings: Settings = isRecord(data.settings)
    ? { ...DEFAULT_SETTINGS, ...(data.settings as Partial<Settings>), id: 'settings' }
    : DEFAULT_SETTINGS;
  return {
    app: 'timebolt',
    version: 1,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
    settings,
    clients,
    projects,
    entries,
    templates,
  };
}

/** Replace the entire database with the backup's contents. */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  await clearAllData();
  await db.transaction(
    'rw',
    [db.clients, db.projects, db.entries, db.settings, db.templates],
    async () => {
      await db.clients.bulkPut(backup.clients);
      await db.projects.bulkPut(backup.projects);
      await db.entries.bulkPut(backup.entries);
      await db.settings.put(backup.settings);
      await db.templates.bulkPut(backup.templates ?? []);
    },
  );
}
