import { parseDuration, roundMinutes, startOfWeek, weekDays, toDateKey, formatMinutes } from '../src/lib/time';

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
console.log('done');
