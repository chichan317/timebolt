import { parseDuration, roundMinutes, startOfWeek, weekDays, toDateKey, formatMinutes } from '../src/lib/time';
import { entryAmount, isRetainer, resolveRate } from '../src/lib/money';
import { decideSync } from '../src/lib/sync';
import { wallTimeToUtc, localMinutesOfDay } from '../src/lib/clock';
import type { Client, Project, Settings, TimeEntry } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/types';

const eq = (a: unknown, b: unknown, label: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.error('FAIL', label, a, '!==', b); process.exitCode = 1; }
  else console.log('ok', label);
};

eq(parseDuration('1:30'), 90, 'h:mm');
eq(parseDuration('0:05'), 5, 'h:mm small');
eq(parseDuration('1.5'), 90, 'decimal hours');
eq(parseDuration('1,5'), 90, 'comma decimal');
eq(parseDuration('90m'), 90, 'minutes suffix');
eq(parseDuration('2h'), 120, 'hours suffix');
eq(parseDuration('1h 30m'), 90, 'mixed');
eq(parseDuration('1h30m'), 90, 'mixed nospace');
eq(parseDuration('8'), 480, 'bare small = hours');
eq(parseDuration('45'), 45, 'bare big = minutes');
eq(parseDuration('abc'), null, 'garbage');
eq(parseDuration(''), null, 'empty');
eq(parseDuration('0'), null, 'zero');

eq(roundMinutes(52, 15, 'nearest'), 45, 'round nearest down');
eq(roundMinutes(53, 15, 'nearest'), 60, 'round nearest up');
eq(roundMinutes(46, 15, 'up'), 60, 'round up');
eq(roundMinutes(3, 15, 'up'), 15, 'round min increment');
eq(roundMinutes(90, 0, 'nearest'), 90, 'no rounding');

// Sat 2026-06-13; Monday start -> 2026-06-08, Sunday start -> 2026-06-07
const d = new Date(2026, 5, 13);
eq(toDateKey(startOfWeek(d, 1)), '2026-06-08', 'week start monday');
eq(toDateKey(startOfWeek(d, 0)), '2026-06-07', 'week start sunday');
eq(toDateKey(startOfWeek(d, 6)), '2026-06-13', 'week start saturday');
eq(weekDays(d, 1).map(toDateKey)[6], '2026-06-14', 'week end');

eq(formatMinutes(90, 'hm'), '1:30', 'fmt hm');
eq(formatMinutes(90, 'decimal'), '1.50', 'fmt decimal');
eq(formatMinutes(5, 'hm'), '0:05', 'fmt pad');

// --- rounding edge cases ---
eq(roundMinutes(60, 15, 'nearest'), 60, 'round exact multiple unchanged');
eq(roundMinutes(30, 30, 'up'), 30, 'round up exact multiple unchanged');
eq(roundMinutes(0, 15, 'up'), 0, 'round zero stays zero');
eq(roundMinutes(2, 15, 'nearest'), 15, 'round tiny nearest floors to increment, not 0');
eq(roundMinutes(1, 60, 'up'), 60, 'round 1min up to a full hour');
eq(roundMinutes(9, 6, 'nearest'), 12, 'round half-step rounds up (Math.round)');
eq(roundMinutes(91, 60, 'nearest'), 120, 'round 91min nearest hour = 2h');
eq(roundMinutes(61, 60, 'nearest'), 60, 'round 61min nearest hour = 1h');

// --- entryAmount applies rounding + billable rules ---
const settings: Settings = { ...DEFAULT_SETTINGS, rounding: 15, roundingMode: 'up' };
const billable = (minutes: number, billable: boolean): TimeEntry => ({
  id: 'x', projectId: 'p', date: '2026-06-15', minutes, note: '', billable,
  createdAt: 0, updatedAt: 0,
});
eq(entryAmount(billable(50, true), 60, settings), 60, 'amount rounds 50min up to 60min @ $60/h');
eq(entryAmount(billable(50, false), 60, settings), 0, 'non-billable entry earns 0');
eq(entryAmount(billable(50, true), 0, settings), 0, 'zero rate earns 0');
eq(entryAmount(billable(60, true), 90, { ...DEFAULT_SETTINGS, rounding: 0 }), 90, 'no rounding: 1h @ $90 = 90');

// --- resolveRate precedence: project overrides client ---
const client: Client = {
  id: 'c', name: 'C', hourlyRate: 100, retainerAmount: null, archived: false, createdAt: 0,
};
const proj = (rate: number | null): Project => ({
  id: 'p', clientId: 'c', name: 'P', color: '#000', hourlyRate: rate,
  billableByDefault: true, archived: false, createdAt: 0,
});
eq(resolveRate(proj(150), client), 150, 'rate: project override wins');
eq(resolveRate(proj(null), client), 100, 'rate: inherits client when project null');
eq(resolveRate(undefined, undefined), 0, 'rate: 0 when nothing set');

// --- retainer clients: tracked but never billed hourly ---
const retainerClient: Client = {
  id: 'r', name: 'R', hourlyRate: 200, retainerAmount: 2000, archived: false, createdAt: 0,
};
eq(isRetainer(retainerClient), true, 'isRetainer: true when amount set');
eq(isRetainer(client), false, 'isRetainer: false for hourly client');
eq(isRetainer({ ...retainerClient, retainerAmount: 0 }), false, 'isRetainer: false when amount 0');
eq(isRetainer(undefined), false, 'isRetainer: false for undefined');
// rate is 0 even though hourlyRate is 200 and the project sets its own rate
eq(resolveRate(proj(150), retainerClient), 0, 'retainer: rate forced to 0');

// --- sync decision logic ---
const decide = (o: Partial<Parameters<typeof decideSync>[0]>) =>
  decideSync({
    dirty: false, lastSyncVersion: 0, localModifiedAt: 0,
    serverVersion: 0, serverUpdatedAt: 0, ...o,
  });
eq(decide({}), 'noop', 'sync: nothing changed -> noop');
eq(decide({ dirty: true }), 'push', 'sync: local dirty, server same -> push');
eq(decide({ serverVersion: 3, lastSyncVersion: 1 }), 'pull', 'sync: server ahead, clean -> pull');
eq(decide({ dirty: true, serverVersion: 3, lastSyncVersion: 1, localModifiedAt: 200, serverUpdatedAt: 100 }), 'conflict-push', 'sync: both changed, local newer -> push');
eq(decide({ dirty: true, serverVersion: 3, lastSyncVersion: 1, localModifiedAt: 100, serverUpdatedAt: 200 }), 'conflict-pull', 'sync: both changed, server newer -> pull');
eq(decide({ dirty: true, serverVersion: 2, lastSyncVersion: 2 }), 'push', 'sync: dirty, already at server version -> push');

// --- timezone conversion (DST-aware) ---
// Adelaide in June = ACST (UTC+9:30): 10:00 local -> 00:30 UTC same day.
eq(wallTimeToUtc('2026-06-18', 600, 'Australia/Adelaide'), Date.UTC(2026, 5, 18, 0, 30), 'tz: Adelaide June +9:30');
// Adelaide in January = ACDT (UTC+10:30): 10:00 local -> previous day 23:30 UTC.
eq(wallTimeToUtc('2026-01-15', 600, 'Australia/Adelaide'), Date.UTC(2026, 0, 14, 23, 30), 'tz: Adelaide Jan +10:30 (DST)');
// Perth always UTC+8: 10:00 local -> 02:00 UTC.
eq(wallTimeToUtc('2026-06-18', 600, 'Australia/Perth'), Date.UTC(2026, 5, 18, 2, 0), 'tz: Perth +8');
// Bogotá always UTC-5: 10:00 local -> 15:00 UTC.
eq(wallTimeToUtc('2026-06-18', 600, 'America/Bogota'), Date.UTC(2026, 5, 18, 15, 0), 'tz: Bogota -5');
// Round-trip: the instant reads back as 10:00 (600 min) local.
eq(localMinutesOfDay(wallTimeToUtc('2026-06-18', 600, 'Australia/Adelaide'), 'Australia/Adelaide'), 600, 'tz: round-trip minutes');

// Adelaide DST transition days 2026 (ends Sun 5 Apr, starts Sun 4 Oct).
// Fall-back: 01:30 is still ACDT (+10:30); 03:30 is ACST (+9:30).
eq(wallTimeToUtc('2026-04-05', 90, 'Australia/Adelaide'), Date.UTC(2026, 3, 4, 15, 0), 'tz: Adelaide 5 Apr 01:30 +10:30');
eq(wallTimeToUtc('2026-04-05', 210, 'Australia/Adelaide'), Date.UTC(2026, 3, 4, 18, 0), 'tz: Adelaide 5 Apr 03:30 +9:30');
// Spring-forward: 01:30 is ACST (+9:30); 03:30 is ACDT (+10:30).
eq(wallTimeToUtc('2026-10-04', 90, 'Australia/Adelaide'), Date.UTC(2026, 9, 3, 16, 0), 'tz: Adelaide 4 Oct 01:30 +9:30');
eq(wallTimeToUtc('2026-10-04', 210, 'Australia/Adelaide'), Date.UTC(2026, 9, 3, 17, 0), 'tz: Adelaide 4 Oct 03:30 +10:30');

console.log('done');
