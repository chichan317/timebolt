/** Unique identifier (crypto.randomUUID). */
export type ID = string;

/** A client you bill. Projects belong to clients. */
export interface Client {
  id: ID;
  name: string;
  /** Default hourly rate for this client's projects. Null = no rate. */
  hourlyRate: number | null;
  /**
   * Fixed monthly retainer amount. When set (> 0) the client is billed this
   * flat amount and their work is tracked but never billed hourly — see
   * `isRetainer`. Null = normal hourly client.
   */
  retainerAmount: number | null;
  archived: boolean;
  createdAt: number;
}

/** A project belonging to a client. Time entries belong to projects. */
export interface Project {
  id: ID;
  clientId: ID;
  name: string;
  /** Hex color used for entry cards and charts. */
  color: string;
  /** Overrides the client rate when set. Null = inherit client rate. */
  hourlyRate: number | null;
  /** New entries on this project default to this billable flag. */
  billableByDefault: boolean;
  archived: boolean;
  createdAt: number;
}

/** A single block of tracked time, stored as a date + duration. */
export interface TimeEntry {
  id: ID;
  projectId: ID;
  /** Local calendar date, formatted YYYY-MM-DD. */
  date: string;
  /** Duration in whole minutes. Always >= 1. */
  minutes: number;
  note: string;
  billable: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 0 = Sunday, 1 = Monday, 6 = Saturday. */
export type WeekStart = 0 | 1 | 6;

/** Rounding increment in minutes applied to billable math. 0 = exact. */
export type RoundingIncrement = 0 | 5 | 6 | 10 | 15 | 30 | 60;

export type RoundingMode = 'nearest' | 'up';

/** 'hm' renders 1:30, 'decimal' renders 1.50. */
export type TimeFormat = 'hm' | 'decimal';

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  id: 'settings';
  /** ISO 4217 currency code, e.g. 'USD', 'AUD'. */
  currency: string;
  weekStart: WeekStart;
  rounding: RoundingIncrement;
  roundingMode: RoundingMode;
  timeFormat: TimeFormat;
  theme: ThemePref;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  currency: 'USD',
  weekStart: 1,
  rounding: 0,
  roundingMode: 'nearest',
  timeFormat: 'hm',
  theme: 'system',
};

/** Shape of the JSON backup file. */
export interface BackupFile {
  app: 'timebolt';
  version: 1;
  exportedAt: string;
  settings: Settings;
  clients: Client[];
  projects: Project[];
  entries: TimeEntry[];
}

/**
 * Running timer, persisted to localStorage so a reload or closed tab
 * never loses time.
 * - running:  startedAt != null
 * - paused:   startedAt == null && accumulatedMs > 0
 */
export interface TimerState {
  projectId: ID;
  note: string;
  billable: boolean;
  /** Epoch ms when the current run segment started. Null while paused. */
  startedAt: number | null;
  /** Ms accumulated from previous run segments (before any pause). */
  accumulatedMs: number;
}

/** Palette offered when creating projects. */
export const PROJECT_COLORS = [
  '#6366f1', // indigo
  '#0ea5e9', // sky
  '#14b8a6', // teal
  '#22c55e', // green
  '#eab308', // yellow
  '#f59e0b', // amber
  '#f97316', // orange
  '#ef4444', // red
  '#ec4899', // pink
  '#a855f7', // purple
  '#8b5cf6', // violet
  '#64748b', // slate
] as const;

export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'JPY', 'CHF', 'SEK', 'NOK',
  'DKK', 'SGD', 'HKD', 'INR', 'ZAR', 'BRL', 'MXN', 'PLN', 'CZK', 'AED',
] as const;
