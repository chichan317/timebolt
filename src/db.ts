import Dexie, { type Table } from 'dexie';
import type { Client, Project, Settings, TimeEntry, WorkTemplate } from './types';
import { DEFAULT_SETTINGS } from './types';

class TimeBoltDB extends Dexie {
  clients!: Table<Client, string>;
  projects!: Table<Project, string>;
  entries!: Table<TimeEntry, string>;
  settings!: Table<Settings, string>;
  templates!: Table<WorkTemplate, string>;

  constructor() {
    super('timebolt');
    this.version(1).stores({
      clients: 'id, name, archived',
      projects: 'id, clientId, archived',
      entries: 'id, projectId, date',
      settings: 'id',
    });
    // v2 adds reusable "common work" templates.
    this.version(2).stores({
      templates: 'id, projectId',
    });
  }
}

export const db = new TimeBoltDB();

export function uid(): string {
  return crypto.randomUUID();
}

/* ------------------------- data-change notifications ----------------------- */
/* A tiny emitter so features like sync know when *any* data changed, no matter
   which screen wrote it. Dexie table hooks fire for every create/update/delete. */

const dataChangeListeners = new Set<() => void>();

/** Notify subscribers that some syncable data changed (also used by the timer). */
export function notifyDataChanged(): void {
  for (const cb of dataChangeListeners) cb();
}

/** Subscribe to "some data changed"; returns an unsubscribe function. */
export function subscribeDataChanged(cb: () => void): () => void {
  dataChangeListeners.add(cb);
  return () => dataChangeListeners.delete(cb);
}

for (const table of [db.clients, db.projects, db.entries, db.settings, db.templates]) {
  table.hook('creating', () => {
    notifyDataChanged();
  });
  table.hook('updating', () => {
    notifyDataChanged();
  });
  table.hook('deleting', () => {
    notifyDataChanged();
  });
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('settings')) ?? DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: 'settings' });
}

/** Entries within an inclusive YYYY-MM-DD date range. */
export async function entriesBetween(from: string, to: string): Promise<TimeEntry[]> {
  return db.entries.where('date').between(from, to, true, true).toArray();
}

/** Delete a project and every entry and template tied to it. */
export async function deleteProjectCascade(projectId: string): Promise<void> {
  await db.transaction('rw', db.projects, db.entries, db.templates, async () => {
    await db.entries.where('projectId').equals(projectId).delete();
    await db.templates.where('projectId').equals(projectId).delete();
    await db.projects.delete(projectId);
  });
}

/** Delete a client, its projects, and all of their entries and templates. */
export async function deleteClientCascade(clientId: string): Promise<void> {
  await db.transaction('rw', db.clients, db.projects, db.entries, db.templates, async () => {
    const projectIds = (await db.projects.where('clientId').equals(clientId).toArray()).map(
      (p) => p.id,
    );
    if (projectIds.length > 0) {
      await db.entries.where('projectId').anyOf(projectIds).delete();
      await db.templates.where('projectId').anyOf(projectIds).delete();
      await db.projects.bulkDelete(projectIds);
    }
    await db.clients.delete(clientId);
  });
}

/** Count entries per project for a client (for delete confirmations). */
export async function clientUsage(clientId: string): Promise<{ projects: number; entries: number }> {
  const projectIds = (await db.projects.where('clientId').equals(clientId).toArray()).map(
    (p) => p.id,
  );
  const entries =
    projectIds.length === 0 ? 0 : await db.entries.where('projectId').anyOf(projectIds).count();
  return { projects: projectIds.length, entries };
}

export async function projectUsage(projectId: string): Promise<number> {
  return db.entries.where('projectId').equals(projectId).count();
}

/** Wipe everything (used by Settings -> danger zone and JSON import). */
export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.clients, db.projects, db.entries, db.settings, db.templates],
    async () => {
      await db.clients.clear();
      await db.projects.clear();
      await db.entries.clear();
      await db.settings.clear();
      await db.templates.clear();
    },
  );
}
