import type { RoundingIncrement, RoundingMode, TimeFormat, WeekStart } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date -> YYYY-MM-DD (never uses UTC, avoids off-by-one days). */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DD -> local Date at midnight. */
export function fromDateKey(key: string): Date {
  const [y, m, day] = key.split('-').map(Number);
  return new Date(y, m - 1, day);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Midnight of the first day of the week containing `d`. */
export function startOfWeek(d: Date, weekStart: WeekStart): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (out.getDay() - weekStart + 7) % 7;
  return addDays(out, -diff);
}

/** The 7 days of the week containing `anchor`. */
export function weekDays(anchor: Date, weekStart: WeekStart): Date[] {
  const start = startOfWeek(anchor, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function isToday(d: Date): boolean {
  return toDateKey(d) === todayKey();
}

/** "Mon 9" style label for week columns. */
export function dayLabel(d: Date): { weekday: string; day: number } {
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    day: d.getDate(),
  };
}

/** "9 – 15 Jun 2026" or "30 Mar – 5 Apr 2026" style range label. */
export function weekRangeLabel(days: Date[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  const sameMonth = first.getMonth() === last.getMonth();
  const firstStr = first.toLocaleDateString(undefined, {
    day: 'numeric',
    ...(sameMonth ? {} : { month: 'short' }),
  });
  const lastStr = last.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${firstStr} – ${lastStr}`;
}

export function longDateLabel(key: string): string {
  return fromDateKey(key).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function shortDateLabel(key: string): string {
  return fromDateKey(key).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Format minutes per the user's time format setting. */
export function formatMinutes(minutes: number, fmt: TimeFormat): string {
  if (fmt === 'decimal') {
    return (minutes / 60).toFixed(2);
  }
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${pad(m)}`;
}

/** "1:05:09" style clock for the running timer. */
export function formatClock(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Parse a human duration into minutes. Returns null when unparseable.
 *
 * Accepted forms:
 *   "1:30"        -> 90      (h:mm)
 *   "1h 30m"      -> 90      (unit suffixes; h/m, hr/min also fine)
 *   "2h"          -> 120
 *   "45m"         -> 45
 *   "1.5" / "1,5" -> 90      (decimal hours)
 *   "8"           -> 480     (bare number < 10 = hours)
 *   "45"          -> 45      (bare integer >= 10 = minutes)
 */
export function parseDuration(raw: string): number | null {
  const input = raw.trim().toLowerCase().replace(',', '.');
  if (input === '') return null;

  // h:mm
  const colon = input.match(/^(\d{1,3}):([0-5]?\d)$/);
  if (colon) {
    return Number(colon[1]) * 60 + Number(colon[2]);
  }

  // unit suffixes: 1h 30m | 2h | 45m | 1.5h | 90min
  const units = input.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:ins?|inutes?)?)?$/);
  if (units && (units[1] !== undefined || units[2] !== undefined)) {
    const hours = units[1] ? parseFloat(units[1]) : 0;
    const mins = units[2] ? parseFloat(units[2]) : 0;
    const total = Math.round(hours * 60 + mins);
    return total > 0 ? total : null;
  }

  // bare number
  const num = input.match(/^\d+(\.\d+)?$/);
  if (num) {
    const value = parseFloat(input);
    if (value <= 0) return null;
    const isDecimal = input.includes('.');
    if (isDecimal || value < 10) {
      return Math.round(value * 60); // hours
    }
    return Math.round(value); // minutes
  }

  return null;
}

/** Round minutes to the configured increment for billable math. */
export function roundMinutes(
  minutes: number,
  increment: RoundingIncrement,
  mode: RoundingMode,
): number {
  if (increment === 0 || minutes <= 0) return minutes;
  const steps = minutes / increment;
  const rounded = mode === 'up' ? Math.ceil(steps) : Math.round(steps);
  return Math.max(increment, rounded * increment);
}
