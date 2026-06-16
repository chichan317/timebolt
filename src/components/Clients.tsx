import { useMemo, useState } from 'react';
import { clientUsage, db, deleteClientCascade, deleteProjectCascade, projectUsage, uid } from '../db';
import type { Client, Project, Settings } from '../types';
import { PROJECT_COLORS } from '../types';
import { formatMoney, isRetainer } from '../lib/money';
import { ConfirmDialog, EmptyState, Icon, Modal, useToast } from './ui';

interface ClientsProps {
  settings: Settings;
  clients: Client[];
  projects: Project[];
}

type ModalState =
  | { kind: 'closed' }
  | { kind: 'client'; client: Client | null }
  | { kind: 'project'; project: Project | null; clientId: string };

interface PendingDelete {
  label: string;
  message: string;
  action: () => Promise<void>;
}

/* ------------------------------- Client modal ------------------------------ */

function ClientModal({
  client,
  onClose,
}: {
  client: Client | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(client?.name ?? '');
  const [mode, setMode] = useState<'hourly' | 'retainer'>(
    isRetainer(client ?? undefined) ? 'retainer' : 'hourly',
  );
  const [rate, setRate] = useState(client?.hourlyRate?.toString() ?? '');
  const [retainer, setRetainer] = useState(client?.retainerAmount?.toString() ?? '');
  const [address, setAddress] = useState(client?.address ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [abn, setAbn] = useState(client?.abn ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Give the client a name.');
      return;
    }
    let hourlyRate: number | null = null;
    let retainerAmount: number | null = null;
    if (mode === 'retainer') {
      const parsed = retainer.trim() === '' ? null : Number(retainer);
      if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) {
        setError('Enter the monthly retainer amount (a positive number).');
        return;
      }
      retainerAmount = parsed;
    } else {
      const parsed = rate.trim() === '' ? null : Number(rate);
      if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
        setError('The rate must be a positive number (or empty).');
        return;
      }
      hourlyRate = parsed;
    }
    await db.clients.put({
      id: client?.id ?? uid(),
      name: trimmed,
      address: address.trim(),
      email: email.trim(),
      abn: abn.trim(),
      hourlyRate,
      retainerAmount,
      archived: client?.archived ?? false,
      createdAt: client?.createdAt ?? Date.now(),
    });
    toast(client ? 'Client updated' : 'Client added');
    onClose();
  };

  return (
    <Modal
      title={client ? 'Edit client' : 'New client'}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void save()} type="button">
            {client ? 'Save' : 'Add client'}
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
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Pty Ltd"
            autoFocus
          />
        </label>
        <div className="field">
          <span>Billing</span>
          <div className="segmented">
            <button
              type="button"
              className={mode === 'hourly' ? 'seg-active' : ''}
              onClick={() => setMode('hourly')}
            >
              Hourly
            </button>
            <button
              type="button"
              className={mode === 'retainer' ? 'seg-active' : ''}
              onClick={() => setMode('retainer')}
            >
              Retainer (fixed monthly)
            </button>
          </div>
        </div>
        {mode === 'hourly' ? (
          <label className="field">
            <span>Default hourly rate</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="e.g. 120 (optional)"
            />
          </label>
        ) : (
          <label className="field">
            <span>Monthly retainer amount</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={retainer}
              onChange={(e) => setRetainer(e.target.value)}
              placeholder="e.g. 2000"
              autoFocus
            />
            <span className="field-hint">
              Time is still tracked, but this client is billed this fixed amount — not by the hour.
            </span>
          </label>
        )}

        <p className="field-section-label">Billing details (shown on invoices)</p>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="billing@client.com (optional)"
          />
        </label>
        <label className="field">
          <span>Address</span>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Client's billing address (optional)"
            rows={2}
          />
        </label>
        <label className="field">
          <span>ABN</span>
          <input
            type="text"
            value={abn}
            onChange={(e) => setAbn(e.target.value)}
            placeholder="Client's ABN (optional)"
          />
        </label>

        {error && <p className="form-error">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/* ------------------------------ Project modal ------------------------------ */

function ProjectModal({
  project,
  clientId,
  clients,
  onClose,
}: {
  project: Project | null;
  clientId: string;
  clients: Client[];
  onClose: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(project?.name ?? '');
  const [owner, setOwner] = useState(project?.clientId ?? clientId);
  const [color, setColor] = useState(
    project?.color ?? PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
  );
  const [rate, setRate] = useState(project?.hourlyRate?.toString() ?? '');
  const [billableByDefault, setBillableByDefault] = useState(project?.billableByDefault ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Give the project a name.');
      return;
    }
    const parsedRate = rate.trim() === '' ? null : Number(rate);
    if (parsedRate !== null && (!Number.isFinite(parsedRate) || parsedRate < 0)) {
      setError('The rate must be a positive number (or empty to inherit the client rate).');
      return;
    }
    await db.projects.put({
      id: project?.id ?? uid(),
      clientId: owner,
      name: trimmed,
      color,
      hourlyRate: parsedRate,
      billableByDefault,
      archived: project?.archived ?? false,
      createdAt: project?.createdAt ?? Date.now(),
    });
    toast(project ? 'Project updated' : 'Project added');
    onClose();
  };

  return (
    <Modal
      title={project ? 'Edit project' : 'New project'}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void save()} type="button">
            {project ? 'Save' : 'Add project'}
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
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Website redesign"
            autoFocus
          />
        </label>
        <label className="field">
          <span>Client</span>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            {clients
              .filter((c) => !c.archived || c.id === owner)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <div className="field">
          <span>Color</span>
          <div className="color-palette">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch ${c === color ? 'color-active' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
        <label className="field">
          <span>Hourly rate (overrides client rate)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="Leave empty to inherit"
          />
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={billableByDefault}
            onChange={(e) => setBillableByDefault(e.target.checked)}
          />
          <span>New entries are billable by default</span>
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/* --------------------------------- main page ------------------------------- */

export function Clients({ settings, clients, projects }: ClientsProps) {
  const toast = useToast();
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const projectsByClient = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of projects) {
      const list = map.get(p.clientId) ?? [];
      list.push(p);
      map.set(p.clientId, list);
    }
    return map;
  }, [projects]);

  const activeClients = clients.filter((c) => !c.archived);
  const archivedClients = clients.filter((c) => c.archived);

  const setClientArchived = async (client: Client, archived: boolean) => {
    await db.clients.update(client.id, { archived });
    toast(archived ? `${client.name} archived` : `${client.name} restored`);
  };

  const setProjectArchived = async (project: Project, archived: boolean) => {
    await db.projects.update(project.id, { archived });
    toast(archived ? `${project.name} archived` : `${project.name} restored`);
  };

  const askDeleteClient = async (client: Client) => {
    const usage = await clientUsage(client.id);
    setPendingDelete({
      label: `Delete ${client.name}?`,
      message:
        usage.projects === 0 && usage.entries === 0
          ? 'This client has no projects or time entries.'
          : `This permanently deletes ${usage.projects} project(s) and ${usage.entries} time entr${usage.entries === 1 ? 'y' : 'ies'} belonging to ${client.name}. Consider archiving instead — archived clients keep their history.`,
      action: async () => {
        await deleteClientCascade(client.id);
        toast(`${client.name} deleted`);
      },
    });
  };

  const askDeleteProject = async (project: Project) => {
    const count = await projectUsage(project.id);
    setPendingDelete({
      label: `Delete ${project.name}?`,
      message:
        count === 0
          ? 'This project has no time entries.'
          : `This permanently deletes ${count} time entr${count === 1 ? 'y' : 'ies'} tracked on ${project.name}. Consider archiving instead.`,
      action: async () => {
        await deleteProjectCascade(project.id);
        toast(`${project.name} deleted`);
      },
    });
  };

  const renderProjectRow = (project: Project) => (
    <li key={project.id} className="project-row">
      <span className="bar-dot" style={{ background: project.color }} />
      <span className="project-name">
        {project.name}
        {project.archived && <span className="tag">archived</span>}
        {!project.billableByDefault && <span className="tag">non-billable</span>}
      </span>
      <span className="project-rate">
        {project.hourlyRate !== null
          ? `${formatMoney(project.hourlyRate, settings.currency)}/h`
          : 'inherits'}
      </span>
      <span className="row-actions">
        <button
          className="link-btn"
          onClick={() => setModal({ kind: 'project', project, clientId: project.clientId })}
          type="button"
        >
          Edit
        </button>
        <button
          className="link-btn"
          onClick={() => void setProjectArchived(project, !project.archived)}
          type="button"
        >
          {project.archived ? 'Restore' : 'Archive'}
        </button>
        <button className="link-btn link-danger" onClick={() => void askDeleteProject(project)} type="button">
          Delete
        </button>
      </span>
    </li>
  );

  const renderClientCard = (client: Client) => {
    const clientProjects = (projectsByClient.get(client.id) ?? []).filter(
      (p) => showArchived || !p.archived || client.archived,
    );
    return (
      <section key={client.id} className="panel client-card">
        <header className="client-head">
          <h2>
            {client.name}
            {isRetainer(client) && <span className="tag tag-retainer">retainer</span>}
            {client.archived && <span className="tag">archived</span>}
          </h2>
          <span className="client-rate">
            {isRetainer(client)
              ? `${formatMoney(client.retainerAmount ?? 0, settings.currency)}/mo retainer`
              : client.hourlyRate !== null
                ? `${formatMoney(client.hourlyRate, settings.currency)}/h default`
                : 'no default rate'}
          </span>
          <span className="row-actions">
            <button
              className="link-btn"
              onClick={() => setModal({ kind: 'client', client })}
              type="button"
            >
              Edit
            </button>
            <button
              className="link-btn"
              onClick={() => void setClientArchived(client, !client.archived)}
              type="button"
            >
              {client.archived ? 'Restore' : 'Archive'}
            </button>
            <button className="link-btn link-danger" onClick={() => void askDeleteClient(client)} type="button">
              Delete
            </button>
          </span>
        </header>
        <ul className="project-list">
          {clientProjects.map(renderProjectRow)}
          {!client.archived && (
            <li>
              <button
                className="link-btn btn-icon"
                onClick={() => setModal({ kind: 'project', project: null, clientId: client.id })}
                type="button"
              >
                <Icon name="plus" size={13} /> Add project
              </button>
            </li>
          )}
        </ul>
      </section>
    );
  };

  return (
    <div className="page">
      <div className="page-toolbar">
        <h1>Clients &amp; projects</h1>
        <div className="toolbar-actions">
          {archivedClients.length > 0 || projects.some((p) => p.archived) ? (
            <button className="btn btn-sm" onClick={() => setShowArchived(!showArchived)} type="button">
              {showArchived ? 'Hide archived' : 'Show archived'}
            </button>
          ) : null}
          <button
            className="btn btn-primary btn-sm btn-icon"
            onClick={() => setModal({ kind: 'client', client: null })}
            type="button"
          >
            <Icon name="plus" size={14} /> New client
          </button>
        </div>
      </div>

      {activeClients.length === 0 && archivedClients.length === 0 ? (
        <EmptyState
          icon={<Icon name="clients" size={34} strokeWidth={1.6} />}
          title="No clients yet"
          message="Clients hold your projects and default hourly rates. Add your first one to start tracking."
          action={
            <button
              className="btn btn-primary btn-icon"
              onClick={() => setModal({ kind: 'client', client: null })}
              type="button"
            >
              <Icon name="plus" size={15} /> New client
            </button>
          }
        />
      ) : (
        <>
          {activeClients.map(renderClientCard)}
          {showArchived && archivedClients.map(renderClientCard)}
        </>
      )}

      {modal.kind === 'client' && (
        <ClientModal client={modal.client} onClose={() => setModal({ kind: 'closed' })} />
      )}
      {modal.kind === 'project' && (
        <ProjectModal
          project={modal.project}
          clientId={modal.clientId}
          clients={clients}
          onClose={() => setModal({ kind: 'closed' })}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.label}
          message={pendingDelete.message}
          confirmLabel="Delete permanently"
          danger
          onConfirm={() => {
            void pendingDelete.action().then(() => setPendingDelete(null));
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
