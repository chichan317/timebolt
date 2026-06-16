import type { TimerState } from '../types';

/**
 * Persistence for the running timer. Kept in localStorage so a reload never
 * loses time, and shared so cross-device sync can carry it. `useTimer` owns the
 * React state; this module is the storage + the bridge for externally applied
 * (synced) timer changes.
 */

const STORAGE_KEY = 'timebolt.timer.v1';

/** Fired when the timer is changed from outside React (e.g. a sync pull). */
export const TIMER_SYNC_EVENT = 'timebolt:timer-sync';

export function loadTimer(): TimerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TimerState;
    if (typeof parsed.projectId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTimer(state: TimerState | null): void {
  if (state === null) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

/**
 * Apply a timer received from another device: persist it and notify the running
 * `useTimer` instance to reload. Does NOT trigger a sync push (no loop).
 */
export function applyExternalTimer(state: TimerState | null): void {
  const current = JSON.stringify(loadTimer());
  if (current === JSON.stringify(state)) return; // no change → no event
  saveTimer(state);
  window.dispatchEvent(new Event(TIMER_SYNC_EVENT));
}
