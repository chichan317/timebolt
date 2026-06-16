import { useState } from 'react';
import { useSync, type SyncStatus } from '../hooks/useSync';
import { useToast } from './ui';

const STATUS_LABEL: Record<SyncStatus, string> = {
  disabled: 'Not connected',
  syncing: 'Syncing…',
  synced: 'Synced',
  offline: 'Offline — will retry',
  error: 'Error',
};

function timeAgo(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ms).toLocaleDateString();
}

export function SyncSettings() {
  const toast = useToast();
  const sync = useSync();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);

  const connected = sync.config !== null;

  const onConnect = async () => {
    if (url.trim() === '' || token.trim() === '') {
      toast('Enter both the server address and password.', 'error');
      return;
    }
    setConnecting(true);
    try {
      await sync.connect(url, token);
      toast('Connected — syncing is on');
      setUrl('');
      setToken('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not connect.', 'error');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <section className="panel">
      <h2>Sync across devices</h2>
      <p className="muted small">
        Keep the same data on your computer and phone automatically, through your own server. Enter
        the same address and password on each device. Data syncs when you open the app and after
        each change.
      </p>

      {!connected ? (
        <div className="settings-grid">
          <label className="field">
            <span>Server address</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourdomain.com/timebolt-sync.php"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="The secret token from your server"
            />
          </label>
        </div>
      ) : (
        <ul className="storage-status">
          <li>
            <span className="storage-label">Status</span>
            <span
              className={
                sync.status === 'synced'
                  ? 'storage-good'
                  : sync.status === 'error'
                    ? 'storage-warn'
                    : undefined
              }
            >
              {STATUS_LABEL[sync.status]}
              {sync.status === 'error' && sync.error ? ` — ${sync.error}` : ''}
            </span>
          </li>
          <li>
            <span className="storage-label">Server</span>
            <span className="sync-url">{sync.config?.url}</span>
          </li>
          <li>
            <span className="storage-label">Last sync</span>
            <span>{sync.lastSyncedAt ? timeAgo(sync.lastSyncedAt) : '—'}</span>
          </li>
        </ul>
      )}

      <div className="settings-actions">
        {!connected ? (
          <button className="btn btn-primary" onClick={() => void onConnect()} disabled={connecting} type="button">
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        ) : (
          <>
            <button className="btn" onClick={sync.syncNow} type="button">
              Sync now
            </button>
            <button className="btn" onClick={sync.disconnect} type="button">
              Disconnect
            </button>
          </>
        )}
      </div>
    </section>
  );
}
