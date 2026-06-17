import { useCallback, useEffect, useMemo, useState } from 'react';
import { uid } from '../db';
import type { Client, Project, Settings, TimeEntry } from '../types';
import {
  billedMinutes,
  entryAmount,
  formatMoney,
  isFixedPrice,
  isRetainer,
  resolveRate,
} from '../lib/money';
import { shortDateLabel } from '../lib/time';
import { BoltIcon, Icon } from './ui';

interface InvoiceProps {
  settings: Settings;
  /** Already-filtered entries from the Reports view (respects the active filters). */
  entries: TimeEntry[];
  projectById: Map<string, Project>;
  clientById: Map<string, Client>;
  from: string;
  to: string;
  /** Pre-select this client if it has work in range (the Reports client filter). */
  initialClientId?: string;
  onClose: () => void;
}

/** An editable invoice line. `amount` is a string so it can be typed freely. */
interface Line {
  id: string;
  description: string;
  amount: string;
}

/** Hours shown on an invoice are decimal (2.50h), the billing convention. */
function hoursStr(min: number): string {
  return (min / 60).toFixed(2);
}

function currencySymbol(currency: string): string {
  const sym = formatMoney(0, currency).replace(/[\d.,\s]/g, '');
  return sym || currency;
}

/**
 * A print-friendly invoice for a single client, with editable lines. Lines are
 * seeded from the client's billable work (hourly projects, a retainer, or
 * fixed-price projects) and can be edited, removed, or added to before printing.
 * Use the browser's print dialog to save a PDF — no PDF dependency.
 */
export function Invoice({
  settings,
  entries,
  projectById,
  clientById,
  from,
  to,
  initialClientId,
  onClose,
}: InvoiceProps) {
  const [notes, setNotes] = useState('');
  const business = settings.business;
  const hasBusiness = Boolean(business?.name.trim());
  const symbol = currencySymbol(settings.currency);

  const clientsWithWork = useMemo(() => {
    const ids = new Set<string>();
    for (const e of entries) {
      const p = projectById.get(e.projectId);
      if (p) ids.add(p.clientId);
    }
    return [...ids]
      .map((id) => clientById.get(id))
      .filter((c): c is Client => Boolean(c))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, projectById, clientById]);

  const [clientId, setClientId] = useState(() => {
    if (initialClientId && clientsWithWork.some((c) => c.id === initialClientId)) {
      return initialClientId;
    }
    return clientsWithWork[0]?.id ?? '';
  });
  const client = clientById.get(clientId);

  const seedLines = useCallback(
    (cid: string): Line[] => {
      const c = clientById.get(cid);
      if (!c) return [];
      if (isRetainer(c)) {
        return [
          { id: uid(), description: 'Monthly retainer', amount: (c.retainerAmount ?? 0).toFixed(2) },
        ];
      }
      const byProject = new Map<string, { project: Project; billedMin: number; amount: number }>();
      for (const e of entries) {
        const p = projectById.get(e.projectId);
        if (!p || p.clientId !== cid) continue;
        const cur = byProject.get(p.id) ?? { project: p, billedMin: 0, amount: 0 };
        if (isFixedPrice(p)) {
          cur.amount = p.fixedPrice ?? 0;
        } else if (e.billable) {
          cur.billedMin += billedMinutes(e, settings);
          cur.amount += entryAmount(e, resolveRate(p, c), settings);
        }
        byProject.set(p.id, cur);
      }
      const lines: Line[] = [];
      for (const { project, billedMin, amount } of byProject.values()) {
        if (isFixedPrice(project)) {
          lines.push({
            id: uid(),
            description: `${project.name} (fixed price)`,
            amount: amount.toFixed(2),
          });
        } else if (amount > 0) {
          const rate = resolveRate(project, c);
          lines.push({
            id: uid(),
            description: `${project.name} — ${hoursStr(billedMin)} h @ ${formatMoney(rate, settings.currency)}/h`,
            amount: amount.toFixed(2),
          });
        }
      }
      lines.sort((a, b) => a.description.localeCompare(b.description));
      return lines;
    },
    [entries, projectById, clientById, settings],
  );

  const [lines, setLines] = useState<Line[]>(() => seedLines(clientId));
  useEffect(() => {
    setLines(seedLines(clientId));
  }, [clientId, seedLines]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const total = lines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
  const issueDate = new Date().toISOString().slice(0, 10);
  const invoiceNumber = `INV-${issueDate.replace(/-/g, '')}`;

  const editLine = (id: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { id: uid(), description: '', amount: '0.00' }]);
  const removeLine = (id: string) => setLines((ls) => ls.filter((l) => l.id !== id));

  return (
    <div className="invoice-overlay">
      <div className="invoice-actions">
        <button className="btn" onClick={onClose} type="button">
          <Icon name="x" size={15} /> Close
        </button>
        {clientsWithWork.length > 0 && (
          <label className="invoice-client-pick">
            Bill
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {clientsWithWork.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="invoice-hint">Use “Save as PDF” in the print dialog to export.</span>
        <button className="btn btn-primary btn-icon" onClick={() => window.print()} type="button">
          Print / Save PDF
        </button>
      </div>

      <div className="invoice-sheet">
        <header className="invoice-head">
          <div className="invoice-brand">
            <span className="invoice-bolt">
              <BoltIcon size={22} />
            </span>
            {hasBusiness ? (
              <div className="invoice-from">
                <span className="invoice-business-name">{business?.name}</span>
                {business?.abn && <span className="invoice-from-line">ABN {business.abn}</span>}
                {business?.address && (
                  <span className="invoice-from-line invoice-multiline">{business.address}</span>
                )}
                {business?.email && <span className="invoice-from-line">{business.email}</span>}
              </div>
            ) : (
              <span className="invoice-business-placeholder">
                Add your details in Settings → Business details
              </span>
            )}
          </div>
          <div className="invoice-meta">
            <h1>Invoice</h1>
            <dl>
              <div>
                <dt>Invoice no.</dt>
                <dd>{invoiceNumber}</dd>
              </div>
              <div>
                <dt>Issued</dt>
                <dd>{shortDateLabel(issueDate)}</dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>
                  {shortDateLabel(from)} – {shortDateLabel(to)}
                </dd>
              </div>
            </dl>
          </div>
        </header>

        <div className="invoice-billto">
          <span className="invoice-label">Bill to</span>
          <span className="invoice-client">{client?.name ?? '—'}</span>
          {client?.abn && <span className="invoice-billto-line">ABN {client.abn}</span>}
          {client?.address && (
            <span className="invoice-billto-line invoice-multiline">{client.address}</span>
          )}
          {client?.email && <span className="invoice-billto-line">{client.email}</span>}
        </div>

        {clientsWithWork.length === 0 ? (
          <p className="muted">No billable work in this range. Adjust the filters and try again.</p>
        ) : (
          <>
            <table className="invoice-table invoice-edit-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Amount</th>
                  <th className="invoice-edit-only" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <input
                        className="invoice-line-input"
                        value={l.description}
                        onChange={(e) => editLine(l.id, { description: e.target.value })}
                        placeholder="Description"
                        aria-label="Line description"
                      />
                    </td>
                    <td className="num invoice-amount-cell">
                      <span className="invoice-cur">{symbol}</span>
                      <input
                        className="invoice-line-input invoice-amount-input"
                        value={l.amount}
                        inputMode="decimal"
                        onChange={(e) => editLine(l.id, { amount: e.target.value })}
                        aria-label="Line amount"
                      />
                    </td>
                    <td className="invoice-edit-only">
                      <button
                        className="invoice-line-del"
                        onClick={() => removeLine(l.id)}
                        aria-label="Remove line"
                        title="Remove line"
                        type="button"
                      >
                        <Icon name="x" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="invoice-add-line invoice-edit-only" onClick={addLine} type="button">
              + Add line
            </button>
          </>
        )}

        {clientsWithWork.length > 0 && (
          <div className="invoice-total">
            <span>Total due</span>
            <span className="invoice-total-amount">{formatMoney(total, settings.currency)}</span>
          </div>
        )}

        {business?.payment.trim() && (
          <div className="invoice-payment">
            <span className="invoice-label">Payment</span>
            <p className="invoice-payment-text invoice-multiline">{business.payment}</p>
          </div>
        )}

        <label className="invoice-notes">
          <span className="invoice-label">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything specific to this invoice… (optional)"
            rows={2}
          />
        </label>

        {settings.rounding > 0 && (
          <p className="invoice-foot-note">
            Hours billed are rounded to {settings.rounding} min ({settings.roundingMode}).
          </p>
        )}
      </div>
    </div>
  );
}
