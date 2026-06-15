import { useMemo, useState } from 'react';
import { db, uid } from '../db';
import type { Client, Project, TimeEntry } from '../types';
import { formatMinutes, parseDuration, todayKey } from '../lib/time';
import { ConfirmDialog, Modal, useToast } from './ui';

interface EntryModalProps {
  /** Existing entry to edit, or null to create a new one. */
  entry: TimeEntry | null;
  /** Date pre-filled when creating. */
  defaultDate?: string;
  clients: Client[];
  projects: Project[];
  onClose: () => void;
}

export function EntryModal({ entry, defaultDate, clients, projects, onClose }: EntryModalProps) {
  const toast = useToast();
  const isEdit = entry !== null;

  const selectable = useMemo(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]));
    return projects
      .filter((p) => !p.archived || p.id === entry?.projectId)
      .filter((p) => !clientById.get(p.clientId)?.archived || p.id === entry?.projectId)
      .map((p) => ({ project: p, client: clientById.get(p.clientId) }))
      .sort((a, b) =>
        `${a.client?.name ?? ''} ${a.project.name}`.localeCompare(
          `${b.client?.name ?? ''} ${b.project.name}`,
        ),
      );
  }, [clients, projects, entry]);

  const [projectId, setProjectId] = useState<string>(
    entry?.projectId ?? selectable[0]?.project.id ?? '',
  );
  const [date, setDate] = useState<string>(entry?.date ?? defaultDate ?? todayKey());
  const [duration, setDuration] = useState<string>(
    entry ? formatMinutes(entry.minutes, 'hm') : '',
  );
  const [note, setNote] = useState<string>(entry?.note ?? '');
  const [billable, setBillable] = useState<boolean>(() => {
    if (entry) return entry.billable;
    const first = selectable.find((s) => s.project.id === projectId) ?? selectable[0];
    return first ? first.project.billableByDefault : true;
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onProjectChange = (id: string) => {
    setProjectId(id);
    if (!isEdit) {
      const proj = selectable.find((s) => s.project.id === id)?.project;
      if (proj) setBillable(proj.billableByDefault);
    }
  };

  const save = async () => {
    const minutes = parseDuration(duration);
    if (projectId === '') {
      setError('Pick a project first.');
      return;
    }
    if (minutes === null) {
      setError('Could not read that duration. Try 1:30, 1.5h or 90m.');
      return;
    }
    if (date === '') {
      setError('Pick a date.');
      return;
    }
    const timestamp = Date.now();
    await db.entries.put({
      id: entry?.id ?? uid(),
      projectId,
      date,
      minutes,
      note: note.trim(),
      billable,
      createdAt: entry?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
    toast(isEdit ? 'Entry updated' : 'Entry added');
    onClose();
  };

  const remove = async () => {
    if (entry) {
      await db.entries.delete(entry.id);
      toast('Entry deleted');
    }
    onClose();
  };

  if (selectable.length === 0) {
    return (
      <Modal title="No projects yet" onClose={onClose}>
        <p className="confirm-message">
          Time entries belong to projects. Create a client and a project first, under{' '}
          <strong>Clients</strong> in the sidebar.
        </p>
      </Modal>
    );
  }

  return (
    <>
      <Modal
        title={isEdit ? 'Edit entry' : 'New entry'}
        onClose={onClose}
        footer={
          <>
            {isEdit && (
              <button
                className="btn btn-danger-ghost"
                onClick={() => setConfirmDelete(true)}
                type="button"
              >
                Delete
              </button>
            )}
            <span className="spacer" />
            <button className="btn" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => void save()} type="button">
              {isEdit ? 'Save' : 'Add entry'}
            </button>
          </>
        }
      >
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="field">
            <span>Project</span>
            <select value={projectId} onChange={(e) => onProjectChange(e.target.value)} autoFocus={!isEdit}>
              {selectable.map(({ project, client }) => (
                <option key={project.id} value={project.id}>
                  {client ? `${client.name} — ${project.name}` : project.name}
                </option>
              ))}
            </select>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Duration</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="1:30, 1.5h, 90m"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                autoFocus={isEdit}
              />
            </label>
          </div>

          <label className="field">
            <span>Note</span>
            <input
              type="text"
              placeholder="What did you work on? (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <label className="check-field">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
            />
            <span>Billable</span>
          </label>

          {error && <p className="form-error">{error}</p>}
          {/* allow Enter key submit */}
          <button type="submit" hidden />
        </form>
      </Modal>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete entry?"
          message="This removes the time entry permanently."
          confirmLabel="Delete"
          danger
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
