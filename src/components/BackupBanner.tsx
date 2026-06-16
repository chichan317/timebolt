import { useReducer } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { exportBackup } from '../lib/backup';
import {
  backupReminderDue,
  daysSince,
  lastBackupAt,
  snoozeBackupReminder,
} from '../lib/storage';
import { useSyncContext } from '../hooks/useSync';
import { useToast } from './ui';

/**
 * Slim reminder strip shown when tracked data exists but hasn't been
 * backed up for a while. Hidden once cross-device sync is connected —
 * then the data already lives on the user's own server, not just this
 * browser, so the nag no longer applies.
 */
export function BackupBanner() {
  const toast = useToast();
  const sync = useSyncContext();
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const entryCount = useLiveQuery(() => db.entries.count(), []);

  if (sync.config !== null) return null;
  if (entryCount === undefined || !backupReminderDue(entryCount)) return null;

  const last = lastBackupAt();
  const message =
    last === null
      ? 'Your tracked time only exists in this browser and has never been backed up.'
      : `Last backup was ${daysSince(last)} days ago.`;

  return (
    <div className="backup-banner" role="status">
      <span className="backup-banner-text">⚠ {message}</span>
      <button
        className="btn btn-sm backup-banner-cta"
        onClick={() => {
          void exportBackup().then(() => {
            toast('Backup downloaded');
            refresh();
          });
        }}
        type="button"
      >
        Back up now
      </button>
      <button
        className="link-btn backup-banner-later"
        onClick={() => {
          snoozeBackupReminder();
          refresh();
        }}
        type="button"
      >
        Remind me in 3 days
      </button>
    </div>
  );
}
