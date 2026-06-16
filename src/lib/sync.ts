import type { BackupFile } from '../types';

/** Where and how to reach the user's self-hosted sync server. */
export interface SyncConfig {
  url: string;
  token: string;
}

export interface ServerStatus {
  version: number;
  updatedAt: number;
}

export interface ServerDoc extends ServerStatus {
  payload: BackupFile | null;
}

export type PushResult =
  | { ok: true; version: number; updatedAt: number }
  | { ok: false; conflict: ServerDoc };

/* -------------------------------- decision -------------------------------- */

export type SyncDecision =
  | 'noop'
  | 'push'
  | 'pull'
  | 'conflict-push'
  | 'conflict-pull';

export interface DecideInput {
  /** Local has changes not yet pushed. */
  dirty: boolean;
  /** Server version this device last synced to. */
  lastSyncVersion: number;
  /** When local data last changed (ms). */
  localModifiedAt: number;
  /** Current server version. 0 = server empty. */
  serverVersion: number;
  /** When the server doc was last written (ms). */
  serverUpdatedAt: number;
}

/**
 * Decide what to do given local and server state. Pure + unit-tested.
 * - server unchanged since our last sync → push if dirty, else nothing.
 * - server moved on and we're clean → pull (adopt it).
 * - both changed → last-write-wins by modified time.
 */
export function decideSync(i: DecideInput): SyncDecision {
  const serverChanged = i.serverVersion > i.lastSyncVersion;
  if (!serverChanged) {
    return i.dirty ? 'push' : 'noop';
  }
  if (!i.dirty) return 'pull';
  return i.localModifiedAt > i.serverUpdatedAt ? 'conflict-push' : 'conflict-pull';
}

/* ------------------------------ server calls ------------------------------ */

function authHeaders(cfg: SyncConfig): HeadersInit {
  // A custom header (not Authorization) so the token survives hosts that strip
  // the Authorization header under FastCGI/CGI (e.g. SiteGround).
  return { 'X-Timebolt-Token': cfg.token };
}

async function asError(res: Response): Promise<Error> {
  let detail = res.statusText;
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) detail = body.error;
  } catch {
    /* non-JSON error body */
  }
  return new Error(detail || `Request failed (${res.status})`);
}

export async function getStatus(cfg: SyncConfig): Promise<ServerStatus> {
  const res = await fetch(`${cfg.url}?action=status`, { headers: authHeaders(cfg) });
  if (!res.ok) throw await asError(res);
  return (await res.json()) as ServerStatus;
}

export async function pull(cfg: SyncConfig): Promise<ServerDoc> {
  const res = await fetch(`${cfg.url}?action=pull`, { headers: authHeaders(cfg) });
  if (!res.ok) throw await asError(res);
  return (await res.json()) as ServerDoc;
}

export async function push(
  cfg: SyncConfig,
  baseVersion: number,
  updatedAt: number,
  payload: BackupFile,
): Promise<PushResult> {
  const res = await fetch(`${cfg.url}?action=push`, {
    method: 'POST',
    headers: { ...authHeaders(cfg), 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseVersion, updatedAt, payload }),
  });
  if (res.status === 409) {
    return { ok: false, conflict: (await res.json()) as ServerDoc };
  }
  if (!res.ok) throw await asError(res);
  const body = (await res.json()) as { version: number; updatedAt: number };
  return { ok: true, version: body.version, updatedAt: body.updatedAt };
}
