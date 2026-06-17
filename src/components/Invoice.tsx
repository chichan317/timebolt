import { useCallback, useEffect, useMemo, useState } from 'react';
import { uid } from '../db';
import type { Client, Project, Settings, TimeEntry } from '../types';
import {
  billedMinutes,
  entryAmount,
  formatMoney,
  isFixedPrice,
  isNoCharge,
  isRetainer,
  resolveRate,
} from '../lib/money';
import { shortDateLabel } from '../lib/time';
import { Icon } from './ui';

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
  const symbol = currencySymbol(settings.currency);
  const issueDate = new Date().toISOString().slice(0, 10);
  const business = settings.business;

  // Every field below is editable on the invoice (one-off overrides, not saved),
  // seeded from your business profile / the chosen client / sensible defaults.
  const [bizName, setBizName] = useState(business?.name ?? '');
  const [bizAbn, setBizAbn] = useState(business?.abn ? `ABN ${business.abn}` : '');
  const [bizAddress, setBizAddress] = useState(business?.address ?? '');
  const [bizEmail, setBizEmail] = useState(business?.email ?? '');
  const [bizPayment, setBizPayment] = useState(business?.payment ?? '');
  const [invoiceNo, setInvoiceNo] = useState(`INV-${issueDate.replace(/-/g, '')}`);
  const [issued, setIssued] = useState(shortDateLabel(issueDate));
  const [period, setPeriod] = useState(`${shortDateLabel(from)} – ${shortDateLabel(to)}`);
  const [billName, setBillName] = useState('');
  const [billAbn, setBillAbn] = useState('');
  const [billAddress, setBillAddress] = useState('');
  const [billEmail, setBillEmail] = useState('');

  const clientsWithWork = useMemo(() => {
    const ids = new Set<string>();
    for (const e of entries) {
      const p = projectById.get(e.projectId);
      if (p) ids.add(p.clientId);
    }
    return [...ids]
      .map((id) => clientById.get(id))
      .filter((c): c is Client => Boolean(c) && !isNoCharge(c))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, projectById, clientById]);

  const [clientId, setClientId] = useState(() => {
    if (initialClientId && clientsWithWork.some((c) => c.id === initialClientId)) {
      return initialClientId;
    }
    return clientsWithWork[0]?.id ?? '';
  });

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
    const c = clientById.get(clientId);
    setBillName(c?.name ?? '');
    setBillAbn(c?.abn ? `ABN ${c.abn}` : '');
    setBillAddress(c?.address ?? '');
    setBillEmail(c?.email ?? '');
  }, [clientId, seedLines, clientById]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const total = lines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

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
            <div className="invoice-from">
              <input
                className="invoice-edit-text invoice-business-name"
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                placeholder="Your business name"
                aria-label="Your business name"
              />
              <input
                className="invoice-edit-text invoice-from-line"
                value={bizAbn}
                onChange={(e) => setBizAbn(e.target.value)}
                placeholder="ABN"
                aria-label="Your ABN"
              />
              <textarea
                className="invoice-edit-text invoice-from-line"
                value={bizAddress}
                onChange={(e) => setBizAddress(e.target.value)}
                placeholder="Address"
                aria-label="Your address"
                rows={2}
              />
              <input
                className="invoice-edit-text invoice-from-line"
                value={bizEmail}
                onChange={(e) => setBizEmail(e.target.value)}
                placeholder="Email"
                aria-label="Your email"
              />
            </div>
          </div>
          <div className="invoice-meta">
            <h1>Invoice</h1>
            <dl>
              <div>
                <dt>Invoice no.</dt>
                <dd>
                  <input
                    className="invoice-edit-text invoice-meta-input"
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    aria-label="Invoice number"
                  />
                </dd>
              </div>
              <div>
                <dt>Issued</dt>
                <dd>
                  <input
                    className="invoice-edit-text invoice-meta-input"
                    value={issued}
                    onChange={(e) => setIssued(e.target.value)}
                    aria-label="Issue date"
                  />
                </dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>
                  <input
                    className="invoice-edit-text invoice-meta-input"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    aria-label="Billing period"
                  />
                </dd>
              </div>
            </dl>
          </div>
        </header>

        <div className="invoice-billto">
          <span className="invoice-label">Bill to</span>
          <input
            className="invoice-edit-text invoice-client"
            value={billName}
            onChange={(e) => setBillName(e.target.value)}
            placeholder="Client name"
            aria-label="Bill-to name"
          />
          <input
            className="invoice-edit-text invoice-billto-line"
            value={billAbn}
            onChange={(e) => setBillAbn(e.target.value)}
            placeholder="ABN"
            aria-label="Bill-to ABN"
          />
          <textarea
            className="invoice-edit-text invoice-billto-line"
            value={billAddress}
            onChange={(e) => setBillAddress(e.target.value)}
            placeholder="Address"
            aria-label="Bill-to address"
            rows={2}
          />
          <input
            className="invoice-edit-text invoice-billto-line"
            value={billEmail}
            onChange={(e) => setBillEmail(e.target.value)}
            placeholder="Email"
            aria-label="Bill-to email"
          />
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

        <label className="invoice-payment">
          <span className="invoice-label">Payment</span>
          <textarea
            className="invoice-edit-text"
            value={bizPayment}
            onChange={(e) => setBizPayment(e.target.value)}
            placeholder="Bank details / payment instructions"
            aria-label="Payment details"
            rows={2}
          />
        </label>

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
