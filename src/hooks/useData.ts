import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db, getSettings } from '../db';
import type { Client, Project, Settings, WorkTemplate } from '../types';
import { DEFAULT_SETTINGS } from '../types';

/** Live settings; falls back to defaults while IndexedDB loads. */
export function useSettings(): Settings {
  return useLiveQuery(getSettings, [], DEFAULT_SETTINGS);
}

/** All clients, sorted by name. Undefined while loading. */
export function useClients(): Client[] | undefined {
  return useLiveQuery(
    () => db.clients.toArray().then((c) => c.sort((a, b) => a.name.localeCompare(b.name))),
    [],
  );
}

/** All projects, sorted by name. Undefined while loading. */
export function useProjects(): Project[] | undefined {
  return useLiveQuery(
    () => db.projects.toArray().then((p) => p.sort((a, b) => a.name.localeCompare(b.name))),
    [],
  );
}

/** All quick-work templates, newest first. Undefined while loading. */
export function useTemplates(): WorkTemplate[] | undefined {
  return useLiveQuery(
    () => db.templates.toArray().then((t) => t.sort((a, b) => b.createdAt - a.createdAt)),
    [],
  );
}

export function useClientMap(clients: Client[] | undefined): Map<string, Client> {
  return useMemo(() => new Map((clients ?? []).map((c) => [c.id, c])), [clients]);
}

export function useProjectMap(projects: Project[] | undefined): Map<string, Project> {
  return useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
}
