import { useCallback, useEffect, useState } from 'react';
import { useClients, useProjects, useSettings } from './hooks/useData';
import { useTimer } from './hooks/useTimer';
import { SyncContext, useSync } from './hooks/useSync';
import { TimerBar } from './components/TimerBar';
import { BackupBanner } from './components/BackupBanner';
import { requestPersistence } from './lib/storage';
import { WeekView } from './components/WeekView';
import { Dashboard } from './components/Dashboard';
import { Reports } from './components/Reports';
import { Clients } from './components/Clients';
import { Clocks } from './components/Clocks';
import { SettingsPage } from './components/SettingsPage';
import { BoltIcon, Icon, type IconName } from './components/ui';

type Route = 'week' | 'dashboard' | 'reports' | 'clients' | 'clocks' | 'settings';

const ROUTES: { id: Route; label: string; icon: IconName }[] = [
  { id: 'week', label: 'Week', icon: 'week' },
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'reports', label: 'Reports', icon: 'reports' },
  { id: 'clients', label: 'Clients', icon: 'clients' },
  { id: 'clocks', label: 'Clocks', icon: 'clock' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

function routeFromHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES.some((r) => r.id === hash) ? hash : 'week') as Route;
}

function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(routeFromHash);
  useEffect(() => {
    const onChange = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((r: Route) => {
    window.location.hash = `/${r}`;
  }, []);
  return [route, navigate];
}

export default function App() {
  const [route, navigate] = useHashRoute();
  const settings = useSettings();
  const clients = useClients();
  const projects = useProjects();
  const timerApi = useTimer();
  // Runs at the root so sync keeps listening for changes on every page.
  const sync = useSync();

  // Ask the browser to never auto-evict our IndexedDB data.
  useEffect(() => {
    void requestPersistence();
  }, []);

  // Apply theme: explicit choice wins, otherwise follow the OS.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const effective =
        settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme;
      document.documentElement.dataset.theme = effective;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme]);

  // Keep the tab title useful while the timer runs.
  useEffect(() => {
    if (timerApi.timer && timerApi.isRunning) {
      const mins = Math.floor(timerApi.elapsed / 60000);
      document.title = `▶ ${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')} — TimeBolt`;
    } else {
      document.title = 'TimeBolt — Time Tracking';
    }
  }, [timerApi.timer, timerApi.isRunning, timerApi.elapsed]);

  const loading = clients === undefined || projects === undefined;
  const allClients = clients ?? [];
  const allProjects = projects ?? [];
  const goToClients = useCallback(() => navigate('clients'), [navigate]);

  return (
    <SyncContext.Provider value={sync}>
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-bolt">
            <BoltIcon size={20} />
          </span>
          <span className="brand-name">TimeBolt</span>
        </div>
        <nav className="nav">
          {ROUTES.map((r) => (
            <button
              key={r.id}
              className={`nav-item ${route === r.id ? 'nav-active' : ''}`}
              onClick={() => navigate(r.id)}
              type="button"
            >
              <span className="nav-icon" aria-hidden="true">
                <Icon name={r.icon} size={18} />
              </span>
              <span className="nav-label">{r.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="muted small">Local-first · your data stays in this browser</span>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <TimerBar
            timerApi={timerApi}
            clients={allClients}
            projects={allProjects}
            onGoToClients={goToClients}
          />
        </header>

        <BackupBanner />

        <main className="content">
          {loading ? (
            <div className="page">
              <p className="muted">Loading…</p>
            </div>
          ) : route === 'week' ? (
            <WeekView
              settings={settings}
              clients={allClients}
              projects={allProjects}
              onGoToClients={goToClients}
            />
          ) : route === 'dashboard' ? (
            <Dashboard settings={settings} clients={allClients} projects={allProjects} />
          ) : route === 'reports' ? (
            <Reports settings={settings} clients={allClients} projects={allProjects} />
          ) : route === 'clients' ? (
            <Clients settings={settings} clients={allClients} projects={allProjects} />
          ) : route === 'clocks' ? (
            <Clocks settings={settings} />
          ) : (
            <SettingsPage settings={settings} clients={allClients} projects={allProjects} />
          )}
        </main>
      </div>
    </div>
    </SyncContext.Provider>
  );
}
