import { useMemo, useState } from 'react';
import type { Client, Project } from '../types';
import type { TimerApi } from '../hooks/useTimer';
import { formatClock } from '../lib/time';
import { Icon, useToast } from './ui';

interface TimerBarProps {
  timerApi: TimerApi;
  clients: Client[];
  projects: Project[];
  onGoToClients: () => void;
}

export function TimerBar({ timerApi, clients, projects, onGoToClients }: TimerBarProps) {
  const toast = useToast();
  const { timer, elapsed, isRunning } = timerApi;
  const [pendingProject, setPendingProject] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const active = useMemo(
    () =>
      projects
        .filter((p) => !p.archived && !clientById.get(p.clientId)?.archived)
        .map((p) => ({ project: p, client: clientById.get(p.clientId) }))
        .sort((a, b) =>
          `${a.client?.name ?? ''} ${a.project.name}`.localeCompare(
            `${b.client?.name ?? ''} ${b.project.name}`,
          ),
        ),
    [projects, clientById],
  );

  const runningProject = timer ? projects.find((p) => p.id === timer.projectId) : undefined;
  const runningClient = runningProject ? clientById.get(runningProject.clientId) : undefined;

  const start = () => {
    const choice = active.find((a) => a.project.id === pendingProject) ?? active[0];
    if (!choice) return;
    timerApi.start(choice.project.id, '', choice.project.billableByDefault);
  };

  const stop = async () => {
    await timerApi.stop();
    toast('Timer saved to today');
  };

  /* ------------------------------ idle state ------------------------------ */
  if (timer === null) {
    if (active.length === 0) {
      return (
        <div className="timer-bar timer-idle">
          <span className="timer-hint">
            Add a client and project to start tracking —{' '}
            <button className="link-btn" onClick={onGoToClients} type="button">
              set up now
            </button>
          </span>
        </div>
      );
    }
    return (
      <div className="timer-bar timer-idle">
        <select
          className="timer-select"
          value={pendingProject || active[0].project.id}
          onChange={(e) => setPendingProject(e.target.value)}
          aria-label="Project for timer"
        >
          {active.map(({ project, client }) => (
            <option key={project.id} value={project.id}>
              {client ? `${client.name} — ${project.name}` : project.name}
            </option>
          ))}
        </select>
        <button className="btn btn-primary timer-start btn-icon" onClick={start} type="button">
          <Icon name="play" size={13} /> Start
        </button>
      </div>
    );
  }

  /* --------------------------- running / paused --------------------------- */
  return (
    <div className={`timer-bar ${isRunning ? 'timer-running' : 'timer-paused'}`}>
      <span
        className="timer-dot"
        style={{ background: runningProject?.color ?? 'var(--accent)' }}
        aria-hidden="true"
      />
      <div className="timer-info">
        <span className="timer-project">
          {runningClient ? `${runningClient.name} — ` : ''}
          {runningProject?.name ?? 'Unknown project'}
        </span>
        <input
          className="timer-note"
          type="text"
          placeholder="Add a note…"
          value={timer.note}
          onChange={(e) => timerApi.setNote(e.target.value)}
        />
      </div>
      <label className="timer-billable" title="Billable">
        <input
          type="checkbox"
          checked={timer.billable}
          onChange={(e) => timerApi.setBillable(e.target.checked)}
        />
        <span>$</span>
      </label>
      <span className={`timer-clock ${isRunning ? '' : 'timer-clock-paused'}`}>
        {formatClock(elapsed)}
      </span>
      {isRunning ? (
        <button className="icon-btn" onClick={timerApi.pause} title="Pause" aria-label="Pause" type="button">
          <Icon name="pause" size={15} />
        </button>
      ) : (
        <button className="icon-btn" onClick={timerApi.resume} title="Resume" aria-label="Resume" type="button">
          <Icon name="play" size={15} />
        </button>
      )}
      <button className="btn btn-primary btn-sm" onClick={() => void stop()} type="button">
        Stop
      </button>
      {confirmDiscard ? (
        <span className="timer-discard-confirm">
          Discard?{' '}
          <button
            className="link-btn"
            onClick={() => {
              timerApi.discard();
              setConfirmDiscard(false);
            }}
            type="button"
          >
            Yes
          </button>{' '}
          <button className="link-btn" onClick={() => setConfirmDiscard(false)} type="button">
            No
          </button>
        </span>
      ) : (
        <button
          className="icon-btn timer-discard"
          onClick={() => setConfirmDiscard(true)}
          title="Discard timer"
          aria-label="Discard timer"
          type="button"
        >
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
}
