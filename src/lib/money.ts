import type { Client, Project, Settings, TimeEntry } from '../types';
import { roundMinutes } from './time';

/** A retainer client is billed a fixed monthly amount, not by the hour. */
export function isRetainer(client: Client | undefined): boolean {
  return client != null && client.retainerAmount != null && client.retainerAmount > 0;
}

/** A fixed-price project is billed one flat amount, not by the hour. */
export function isFixedPrice(project: Project | undefined): boolean {
  return project != null && project.fixedPrice != null && project.fixedPrice > 0;
}

/** A no-charge client is never billed — time is tracked only. */
export function isNoCharge(client: Client | undefined): boolean {
  return client?.nonBillable === true;
}

/**
 * Effective hourly rate: project override, else client default, else 0.
 * Retainer, no-charge clients and fixed-price projects never bill by the hour,
 * so their rate is always 0 — this zeroes hourly money for them everywhere
 * money flows through this function.
 */
export function resolveRate(
  project: Project | undefined,
  client: Client | undefined,
): number {
  if (isRetainer(client) || isNoCharge(client) || isFixedPrice(project)) return 0;
  return project?.hourlyRate ?? client?.hourlyRate ?? 0;
}

/** Minutes used for billing after the rounding setting is applied. */
export function billedMinutes(entry: TimeEntry, settings: Settings): number {
  return roundMinutes(entry.minutes, settings.rounding, settings.roundingMode);
}

/** Currency amount earned by one entry (0 for non-billable). */
export function entryAmount(entry: TimeEntry, rate: number, settings: Settings): number {
  if (!entry.billable || rate <= 0) return 0;
  return (billedMinutes(entry, settings) / 60) * rate;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Totals across a set of entries. */
export interface Totals {
  minutes: number;
  billableMinutes: number;
  amount: number;
}

export function sumTotals(
  entries: TimeEntry[],
  projectById: Map<string, Project>,
  clientById: Map<string, Client>,
  settings: Settings,
): Totals {
  const totals: Totals = { minutes: 0, billableMinutes: 0, amount: 0 };
  for (const entry of entries) {
    totals.minutes += entry.minutes;
    if (entry.billable) totals.billableMinutes += entry.minutes;
    const project = projectById.get(entry.projectId);
    const client = project ? clientById.get(project.clientId) : undefined;
    totals.amount += entryAmount(entry, resolveRate(project, client), settings);
  }
  return totals;
}
