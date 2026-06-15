import { parseDuration, roundMinutes, startOfWeek, weekDays, toDateKey, formatMinutes } from '../src/lib/time';
import { entryAmount, isRetainer, resolveRate } from '../src/lib/money';
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

console.log('done');
