import { useEffect, useMemo, useState } from 'react';
import type { Client, Project, Settings, TimeEntry } from '../types';
import { billedMinutes, entryAmount, formatMoney, isRetainer, resolveRate } from '../lib/money';
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
  onClose: () => void;
}

interface LineItem {
  projectName: string;
  /** Billed (rounded) minutes for billable work only. */
  billedMin: number;
  rate: number;
  amount: number;
}

interface ClientSection {
  clientId: string;
  clientName: string;
  /** Retainer clients are billed one fixed line instead of hourly items. */
  retainer: boolean;
  lines: LineItem[];
  amount: number;
}

/** Hours shown on an invoice are decimal (2.50h), the billing convention. */
function hours(min: number): string {
  return (min / 60).toFixed(2);
}

/**
 * A print-friendly invoice built from the current Reports filters. Only
 * billable entries are billed. Use the browser's print dialog to save a PDF —
 * no PDF dependency, fully local.
 */
export function Invoice({
  settings,
  entries,
  projectById,
  clientById,
  from,
  to,
  onClose,
}: InvoiceProps) {
  const [businessName, setBusinessName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sections = useMemo<ClientSection[]>(() => {
    const byClient = new Map<string, ClientSection>();
    const ensure = (clientId: string, name: string, retainer: boolean): ClientSection => {
      let section = byClient.get(clientId);
      if (!section) {
        section = { clientId, clientName: name, retainer, lines: [], amount: 0 };
        byClient.set(clientId, section);
      }
      return section;
    };
    for (const e of entries) {
      const project = projectById.get(e.projectId);
      const client = project ? clientById.get(project.clientId) : undefined;
      const clientId = client?.id ?? 'unknown';

      // Retainer clients: one fixed line of the monthly amount, billed once,
      // regardless of how many entries fall in the range.
      if (isRetainer(client)) {
        const section = ensure(clientId, client?.name ?? 'Unknown client', true);
        if (section.lines.length === 0) {
          const amount = client?.retainerAmount ?? 0;
          section.lines.push({ projectName: 'Monthly retainer', billedMin: 0, rate: 0, amount });
          section.amount = amount;
        }
        continue;
      }

      // Hourly clients: bill billable entries by the hour.
      if (!e.billable) continue;
      const amount = entryAmount(e, resolveRate(project, client), settings);
      if (amount <= 0) continue;
      const section = ensure(clientId, client?.name ?? 'Unknown client', false);
      const name = project?.name ?? 'Unknown project';
      let line = section.lines.find((l) => l.projectName === name);
      if (!line) {
        line = { projectName: name, billedMin: 0, rate: resolveRate(project, client), amount: 0 };
        section.lines.push(line);
      }
      line.billedMin += billedMinutes(e, settings);
      line.amount += amount;
      section.amount += amount;
    }
    const list = [...byClient.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));
    for (const s of list) {
      if (!s.retainer) s.lines.sort((a, b) => a.projectName.localeCompare(b.projectName));
    }
    return list;
  }, [entries, projectById, clientById, settings]);

  const grandTotal = sections.reduce((sum, s) => sum + s.amount, 0);
  const issueDate = new Date().toISOString().slice(0, 10);
  const invoiceNumber = `INV-${issueDate.replace(/-/g, '')}`;
  const billTo =
    sections.length === 1 ? sections[0].clientName : `${sections.length} clients`;

  return (
    <div className="invoice-overlay">
      <div className="invoice-actions">
        <button className="btn" onClick={onClose} type="button">
          <Icon name="x" size={15} /> Close
        </button>
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
            <input
              className="invoice-business"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Your business name"
              aria-label="Your business name"
            />
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
          <span className="invoice-client">{billTo}</span>
        </div>

        {sections.length === 0 ? (
          <p className="muted">No billable entries in this range. Adjust the filters and try again.</p>
        ) : (
          sections.map((s) => (
            <section key={s.clientId} className="invoice-section">
              {sections.length > 1 && <h2 className="invoice-section-title">{s.clientName}</h2>}
              {s.retainer ? (
                <table className="invoice-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Monthly retainer</td>
                      <td className="num">{formatMoney(s.amount, settings.currency)}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <table className="invoice-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th className="num">Hours</th>
                      <th className="num">Rate</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.lines.map((l) => (
                      <tr key={l.projectName}>
                        <td>{l.projectName}</td>
                        <td className="num">{hours(l.billedMin)}</td>
                        <td className="num">{formatMoney(l.rate, settings.currency)}</td>
                        <td className="num">{formatMoney(l.amount, settings.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {sections.length > 1 && (
                    <tfoot>
                      <tr>
                        <td colSpan={3}>Subtotal — {s.clientName}</td>
                        <td className="num">{formatMoney(s.amount, settings.currency)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </section>
          ))
        )}

        {sections.length > 0 && (
          <div className="invoice-total">
            <span>Total due</span>
            <span className="invoice-total-amount">{formatMoney(grandTotal, settings.currency)}</span>
          </div>
        )}

        <label className="invoice-notes">
          <span className="invoice-label">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Payment terms, bank details, thank-you note… (optional)"
            rows={3}
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
