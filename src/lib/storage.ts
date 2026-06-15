/**
 * Storage durability helpers.
 *
 * IndexedDB is "best-effort" by default: the browser may evict it under
 * storage pressure. navigator.storage.persist() asks the browser to mark
 * this origin's storage as persistent (never auto-evicted). Chrome grants
 * it silently based on site engagement; Firefox prompts the user.
 */

const BACKUP_KEY = 'timebolt.lastBackup';
const SNOOZE_KEY = 'timebolt.backupSnooze';

const DAY_MS = 24 * 60 * 60 * 1000;
const REMIND_AFTER_MS = 7 * DAY_MS;
const SNOOZE_MS = 3 * DAY_MS;
/** Don't nag brand-new users over a couple of test entries. */
const MIN_ENTRIES_FOR_REMINDER = 3;

/** Ask the browser to make this origin's storage persistent. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      return await navigator.storage.persist();
    }
  } catch {
    /* unsupported — nothing to do */
  }
  return false;
}

export interface StorageInfo {
  /** null when the browser doesn't expose the API. */
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const info: StorageInfo = { persisted: null, usage: null, quota: null };
  try {
    if (navigator.storage && typeof navigator.storage.persisted === 'function') {
      info.persisted = await navigator.storage.persisted();
    }
    if (navigator.storage && typeof navigator.storage.estimate === 'function') {
      const est = await navigator.storage.estimate();
      info.usage = est.usage ?? null;
      info.quota = est.quota ?? null;
    }
  } catch {
    /* unsupported — leave nulls */
  }
  return info;
}

export function markBackupDone(): void {
  localStorage.setItem(BACKUP_KEY, String(Date.now()));
}

export function lastBackupAt(): number | null {
  const raw = localStorage.getItem(BACKUP_KEY);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function snoozeBackupReminder(): void {
  localStorage.setItem(SNOOZE_KEY, String(Date.now()));
}

function backupSnoozedAt(): number | null {
  const raw = localStorage.getItem(SNOOZE_KEY);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Should the backup reminder banner show right now? */
export function backupReminderDue(entryCount: number): boolean {
  if (entryCount < MIN_ENTRIES_FOR_REMINDER) return false;
  const last = lastBackupAt();
  if (last !== null && Date.now() - last < REMIND_AFTER_MS) return false;
  const snoozed = backupSnoozedAt();
  if (snoozed !== null && Date.now() - snoozed < SNOOZE_MS) return false;
  return true;
}

export function daysSince(timestamp: number): number {
  return Math.floor((Date.now() - timestamp) / DAY_MS);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
