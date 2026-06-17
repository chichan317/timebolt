import type { ClockCity } from '../types';

/** Curated cities to add from. `label` is what we show; `timeZone` is IANA. */
export const CITY_PRESETS: { label: string; timeZone: string }[] = [
  { label: 'Adelaide', timeZone: 'Australia/Adelaide' },
  { label: 'Perth', timeZone: 'Australia/Perth' },
  { label: 'Medellín', timeZone: 'America/Bogota' },
  { label: 'Sydney', timeZone: 'Australia/Sydney' },
  { label: 'Melbourne', timeZone: 'Australia/Melbourne' },
  { label: 'Brisbane', timeZone: 'Australia/Brisbane' },
  { label: 'Auckland', timeZone: 'Pacific/Auckland' },
  { label: 'Singapore', timeZone: 'Asia/Singapore' },
  { label: 'Tokyo', timeZone: 'Asia/Tokyo' },
  { label: 'Hong Kong', timeZone: 'Asia/Hong_Kong' },
  { label: 'Dubai', timeZone: 'Asia/Dubai' },
  { label: 'Mumbai', timeZone: 'Asia/Kolkata' },
  { label: 'London', timeZone: 'Europe/London' },
  { label: 'Paris', timeZone: 'Europe/Paris' },
  { label: 'Berlin', timeZone: 'Europe/Berlin' },
  { label: 'Madrid', timeZone: 'Europe/Madrid' },
  { label: 'New York', timeZone: 'America/New_York' },
  { label: 'Chicago', timeZone: 'America/Chicago' },
  { label: 'Denver', timeZone: 'America/Denver' },
  { label: 'Los Angeles', timeZone: 'America/Los_Angeles' },
  { label: 'Mexico City', timeZone: 'America/Mexico_City' },
  { label: 'Bogotá', timeZone: 'America/Bogota' },
  { label: 'Lima', timeZone: 'America/Lima' },
  { label: 'Santiago', timeZone: 'America/Santiago' },
  { label: 'Buenos Aires', timeZone: 'America/Argentina/Buenos_Aires' },
  { label: 'São Paulo', timeZone: 'America/Sao_Paulo' },
  { label: 'UTC', timeZone: 'UTC' },
];

export const DEFAULT_CLOCKS: ClockCity[] = [
  { id: 'adelaide', label: 'Adelaide', timeZone: 'Australia/Adelaide' },
  { id: 'perth', label: 'Perth', timeZone: 'Australia/Perth' },
  { id: 'medellin', label: 'Medellín', timeZone: 'America/Bogota' },
];

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

/** The local wall-clock parts of an instant in a timezone. */
export function partsInTz(ms: number, timeZone: string): Parts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value === '24' ? '0' : p.value);
  }
  return out as unknown as Parts;
}

/** The timezone's UTC offset (ms) at the given instant — DST aware. */
function offsetMs(ms: number, timeZone: string): number {
  const p = partsInTz(ms, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - ms;
}

/**
 * UTC instant of a local wall-clock time (date + minutes-of-day) in a timezone.
 * DST-safe: the offset is measured at the resulting instant. (Ambiguous times in
 * the DST gap/overlap can be off by an hour — acceptable for this tool.)
 */
export function wallTimeToUtc(dateStr: string, minutesOfDay: number, timeZone: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const hours = Math.floor(minutesOfDay / 60);
  const mins = minutesOfDay % 60;
  const naive = Date.UTC(y, m - 1, d, hours, mins, 0);
  // First guess assumes the offset of `naive`, then correct once.
  const guessOffset = offsetMs(naive, timeZone);
  const corrected = naive - guessOffset;
  const finalOffset = offsetMs(corrected, timeZone);
  return naive - finalOffset;
}

/** UTC instant of 00:00 local on a given date in a timezone. */
export function dayStartUtc(dateStr: string, timeZone: string): number {
  return wallTimeToUtc(dateStr, 0, timeZone);
}

/** Local minutes-of-day (0..1439) of an instant in a timezone. */
export function localMinutesOfDay(ms: number, timeZone: string): number {
  const p = partsInTz(ms, timeZone);
  return p.hour * 60 + p.minute;
}

/** Local YYYY-MM-DD of an instant in a timezone. */
export function localDateKey(ms: number, timeZone: string): string {
  const p = partsInTz(ms, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export type HourCategory = 'night' | 'fringe' | 'day';

/** Classify a local hour for the day/night colour bar. */
export function hourCategory(hour: number): HourCategory {
  if (hour < 7 || hour >= 22) return 'night';
  if (hour < 9 || hour >= 18) return 'fringe';
  return 'day';
}

const timeFmtCache = new Map<string, Intl.DateTimeFormat>();
function cachedFormat(
  cache: Map<string, Intl.DateTimeFormat>,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = timeZone + JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, ...options });
    cache.set(key, f);
  }
  return f;
}

export function formatTime(ms: number, timeZone: string): string {
  return cachedFormat(timeFmtCache, timeZone, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(ms));
}

export function formatDate(ms: number, timeZone: string): string {
  return cachedFormat(timeFmtCache, timeZone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(ms));
}

/** Short GMT offset label, e.g. "GMT+10:30". */
export function offsetLabel(ms: number, timeZone: string): string {
  for (const p of cachedFormat(timeFmtCache, timeZone, {
    timeZoneName: 'shortOffset',
    hour: 'numeric',
  }).formatToParts(new Date(ms))) {
    if (p.type === 'timeZoneName') return p.value;
  }
  return '';
}

/** Whole-day difference of an instant in `tz` vs the reference timezone. */
export function dayDiff(ms: number, tz: string, refTz: string): number {
  const a = localDateKey(ms, tz);
  const b = localDateKey(ms, refTz);
  if (a === b) return 0;
  const da = Date.UTC(...(a.split('-').map(Number) as [number, number, number]));
  const db = Date.UTC(...(b.split('-').map(Number) as [number, number, number]));
  return Math.round((da - db) / 86400000);
}
