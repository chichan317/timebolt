import { useCallback, useEffect, useState } from 'react';
import { db, uid } from '../db';
import type { TimerState } from '../types';
import { todayKey } from '../lib/time';

const STORAGE_KEY = 'timebolt.timer.v1';

function load(): TimerState | null {
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

function persist(state: TimerState | null): void {
  if (state === null) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export function elapsedMs(state: TimerState, now: number): number {
  return state.accumulatedMs + (state.startedAt !== null ? now - state.startedAt : 0);
}

export interface TimerApi {
  /** Null when no timer exists; check startedAt for running vs paused. */
  timer: TimerState | null;
  elapsed: number;
  isRunning: boolean;
  start: (projectId: string, note: string, billable: boolean) => void;
  pause: () => void;
  resume: () => void;
  /** Saves the elapsed time as an entry on today's date, then clears. */
  stop: () => Promise<void>;
  discard: () => void;
  setNote: (note: string) => void;
  setBillable: (billable: boolean) => void;
}

export function useTimer(): TimerApi {
  const [timer, setTimer] = useState<TimerState | null>(load);
  const [now, setNow] = useState(() => Date.now());

  const isRunning = timer !== null && timer.startedAt !== null;

  // Tick once per second while running so the clock display updates.
  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const update = useCallback((next: TimerState | null) => {
    persist(next);
    setTimer(next);
  }, []);

  const start = useCallback(
    (projectId: string, note: string, billable: boolean) => {
      update({ projectId, note, billable, startedAt: Date.now(), accumulatedMs: 0 });
      setNow(Date.now());
    },
    [update],
  );

  const pause = useCallback(() => {
    setTimer((current) => {
      if (current === null || current.startedAt === null) return current;
      const next: TimerState = {
        ...current,
        accumulatedMs: current.accumulatedMs + (Date.now() - current.startedAt),
        startedAt: null,
      };
      persist(next);
      return next;
    });
  }, []);

  const resume = useCallback(() => {
    setTimer((current) => {
      if (current === null || current.startedAt !== null) return current;
      const next: TimerState = { ...current, startedAt: Date.now() };
      persist(next);
      setNow(Date.now());
      return next;
    });
  }, []);

  const stop = useCallback(async () => {
    const current = timer;
    if (current === null) return;
    const ms = elapsedMs(current, Date.now());
    const minutes = Math.max(1, Math.round(ms / 60000));
    const timestamp = Date.now();
    await db.entries.put({
      id: uid(),
      projectId: current.projectId,
      date: todayKey(),
      minutes,
      note: current.note,
      billable: current.billable,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    update(null);
  }, [timer, update]);

  const discard = useCallback(() => update(null), [update]);

  const setNote = useCallback(
    (note: string) => {
      setTimer((current) => {
        if (current === null) return current;
        const next = { ...current, note };
        persist(next);
        return next;
      });
    },
    [],
  );

  const setBillable = useCallback((billable: boolean) => {
    setTimer((current) => {
      if (current === null) return current;
      const next = { ...current, billable };
      persist(next);
      return next;
    });
  }, []);

  return {
    timer,
    elapsed: timer ? elapsedMs(timer, now) : 0,
    isRunning,
    start,
    pause,
    resume,
    stop,
    discard,
    setNote,
    setBillable,
  };
}
