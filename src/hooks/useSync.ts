import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { subscribeDataChanged } from '../db';
import { buildBackupData, restoreBackup } from '../lib/backup';
import { applyExternalTimer } from '../lib/timerStore';
import {
  decideSync,
  getStatus,
  pull,
  push,
  type ServerDoc,
  type SyncConfig,
} from '../lib/sync';

export type SyncStatus = 'disabled' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  config: SyncConfig | null;
}

const K = {
  url: 'timebolt.sync.url',
  token: 'timebolt.sync.token',
  version: 'timebolt.sync.lastSyncVersion',
  modified: 'timebolt.sync.localModifiedAt',
  dirty: 'timebolt.sync.dirty',
  syncedAt: 'timebolt.sync.lastSyncedAt',
  snapshot: 'timebolt.sync.safetySnapshot',
} as const;

const num = (key: string, fallback = 0): number => {
  const v = localStorage.getItem(key);
  return v == null ? fallback : Number(v) || fallback;
};

const PUSH_DEBOUNCE_MS = 1500;

export function useSync(): SyncState & {
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => void;
  syncNow: () => void;
} {
  const [config, setConfig] = useState<SyncConfig | null>(() => {
    const url = localStorage.getItem(K.url);
    const token = localStorage.getItem(K.token);
    return url && token ? { url, token } : null;
  });
  const [status, setStatus] = useState<SyncStatus>(config ? 'synced' : 'disabled');
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => {
    const v = num(K.syncedAt, 0);
    return v > 0 ? v : null;
  });

  const configRef = useRef(config);
  configRef.current = config;
  const applyingRef = useRef(false);
  const runningRef = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);

  const markSynced = useCallback((version: number) => {
    localStorage.setItem(K.version, String(version));
    localStorage.setItem(K.dirty, '0');
    const now = Date.now();
    localStorage.setItem(K.syncedAt, String(now));
    setLastSyncedAt(now);
    setError(null);
    setStatus('synced');
  }, []);

  /** Apply a server document to local storage without re-triggering a push. */
  const applyServerDoc = useCallback(
    async (doc: ServerDoc, dirtyBeforeApply: boolean) => {
      if (!doc.payload) return;
      if (dirtyBeforeApply) {
        // We are about to overwrite unpushed local changes — keep a safety copy.
        const local = await buildBackupData();
        localStorage.setItem(K.snapshot, JSON.stringify(local));
      }
      applyingRef.current = true;
      try {
        await restoreBackup(doc.payload);
        // Adopt the running timer from the other device (transient, not part
        // of restoreBackup). applyExternalTimer doesn't re-trigger a push.
        applyExternalTimer(doc.payload.timer ?? null);
      } finally {
        applyingRef.current = false;
      }
      localStorage.setItem(K.modified, String(doc.updatedAt));
    },
    [],
  );

  const runSync = useCallback(async () => {
    const cfg = configRef.current;
    if (!cfg || runningRef.current) return;
    runningRef.current = true;
    setStatus('syncing');
    try {
      const dirty = localStorage.getItem(K.dirty) === '1';
      const lastSyncVersion = num(K.version, 0);
      const localModifiedAt = num(K.modified, 0);
      const server = await getStatus(cfg);
      const decision = decideSync({
        dirty,
        lastSyncVersion,
        localModifiedAt,
        serverVersion: server.version,
        serverUpdatedAt: server.updatedAt,
      });

      if (decision === 'noop') {
        markSynced(server.version);
        return;
      }

      if (decision === 'pull' || decision === 'conflict-pull') {
        const doc = await pull(cfg);
        await applyServerDoc(doc, decision === 'conflict-pull');
        markSynced(doc.version);
        return;
      }

      // push or conflict-push
      const payload = await buildBackupData();
      const result = await push(cfg, server.version, localModifiedAt || Date.now(), payload);
      if (result.ok) {
        markSynced(result.version);
      } else {
        // Another device pushed between our status check and push — adopt it.
        await applyServerDoc(result.conflict, true);
        markSynced(result.conflict.version);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
      setStatus(e instanceof TypeError ? 'offline' : 'error'); // fetch network error → TypeError
    } finally {
      runningRef.current = false;
    }
  }, [applyServerDoc, markSynced]);

  const schedulePush = useCallback(() => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void runSync(), PUSH_DEBOUNCE_MS);
  }, [runSync]);

  // Subscribe to local data changes → mark dirty + debounce a push.
  useEffect(() => {
    if (!config) return;
    const unsub = subscribeDataChanged(() => {
      if (applyingRef.current) return; // change came from a pull, not the user
      localStorage.setItem(K.dirty, '1');
      localStorage.setItem(K.modified, String(Date.now()));
      schedulePush();
    });
    return unsub;
  }, [config, schedulePush]);

  // Pull on mount and whenever the tab regains focus.
  useEffect(() => {
    if (!config) return;
    void runSync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runSync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [config, runSync]);

  const connect = useCallback(
    async (url: string, token: string) => {
      const cfg: SyncConfig = { url: url.trim(), token: token.trim() };
      // Validate by hitting the server once before saving (throws on bad
      // token / unreachable, surfaced to the caller).
      setStatus('syncing');
      setError(null);
      await getStatus(cfg);
      localStorage.setItem(K.url, cfg.url);
      localStorage.setItem(K.token, cfg.token);
      // A freshly connected device hasn't synced with this server yet.
      localStorage.setItem(K.version, '0');
      // If this device already has data, mark dirty so it seeds an empty
      // server; if the server already has data, decideSync will pull instead.
      const local = await buildBackupData();
      const hasLocalData = local.clients.length + local.entries.length > 0;
      localStorage.setItem(K.dirty, hasLocalData ? '1' : '0');
      if (!localStorage.getItem(K.modified)) {
        localStorage.setItem(K.modified, String(Date.now()));
      }
      setConfig(cfg);
      // runSync runs via the effect when config changes.
    },
    [],
  );

  const disconnect = useCallback(() => {
    localStorage.removeItem(K.url);
    localStorage.removeItem(K.token);
    localStorage.removeItem(K.version);
    localStorage.removeItem(K.dirty);
    localStorage.removeItem(K.syncedAt);
    setConfig(null);
    setStatus('disabled');
    setError(null);
    setLastSyncedAt(null);
  }, []);

  const syncNow = useCallback(() => void runSync(), [runSync]);

  return { status, lastSyncedAt, error, config, connect, disconnect, syncNow };
}

/* --------------------------- shared at app root --------------------------- */
/* useSync runs once at the app root so it keeps listening for data changes on
   every page, not only while Settings is open. Components read it via context. */

export type SyncApi = ReturnType<typeof useSync>;

export const SyncContext = createContext<SyncApi | null>(null);

export function useSyncContext(): SyncApi {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncContext must be used within a SyncContext provider');
  return ctx;
}
