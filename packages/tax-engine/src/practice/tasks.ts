import { gstDueDate, makeDate, tdsStatementDueDate, type IsoDate, type TdsForm } from '../compliance/calendar.js';
import { tdsDepositDueDate } from '../compliance/interest.js';
import { cmp08DueDate } from '../gst/composition.js';

/**
 * Compliance tasks for each client, generated from its registrations and the statutory calendar.
 * Each task has a stable key, so generating again for an overlapping window adds only what is new.
 */

export type TaskKind = 'GSTR1' | 'IFF' | 'GSTR3B' | 'PMT06' | 'CMP08' | 'GSTR4' | 'TDS_DEPOSIT' | 'TDS_STATEMENT';

export interface TaskClient {
  entityId: string;
  name: string;
  gstins: Array<{ gstin: string; category: string }>; // filing_category from gst_registrations
  tans: Array<{ tan: string; forms: TdsForm[] }>;
}

export interface GeneratedTask {
  key: string;
  entityId: string;
  clientName: string;
  kind: TaskKind;
  reference: string; // GSTIN or TAN
  periodLabel: string;
  dueDate: IsoDate;
  title: string;
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (y: number, m: number) => `${MONTH[m - 1]} ${y}`;
const fyLabel = (fy: number) => `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;
const fyOf = (y: number, m: number) => (m >= 4 ? y : y - 1);
const quarterOf = (m: number) => (m >= 4 ? Math.ceil((m - 3) / 3) : 4) as 1 | 2 | 3 | 4;
const isQuarterEnd = (m: number) => m % 3 === 0;

/** Every tax period (month) whose returns fall due between `from` and `to`, inclusive. */
function monthsCovering(from: IsoDate, to: IsoDate): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  // Periods start up to 13 months before the window (GSTR-4 for March falls due in April).
  let y = Number(from.slice(0, 4)) - 1;
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push([y, m]);
    m += 1;
    if (m === 13) { m = 1; y += 1; }
  }
  return out;
}

export function generateTasks(clients: TaskClient[], from: IsoDate, to: IsoDate): GeneratedTask[] {
  const out: GeneratedTask[] = [];
  const push = (c: TaskClient, kind: TaskKind, reference: string, periodKey: string, periodLabel: string, dueDate: IsoDate, title: string) => {
    if (dueDate < from || dueDate > to) return;
    out.push({ key: `${kind}:${reference}:${periodKey}`, entityId: c.entityId, clientName: c.name, kind, reference, periodLabel, dueDate, title });
  };

  for (const c of clients) {
    for (const [y, m] of monthsCovering(from, to)) {
      const period = `${y}-${String(m).padStart(2, '0')}`;
      const label = monthLabel(y, m);
      const fy = fyOf(y, m);
      const q = quarterOf(m);
      for (const g of c.gstins) {
        const state = g.gstin.slice(0, 2);
        if (g.category === 'REGULAR_MONTHLY') {
          push(c, 'GSTR1', g.gstin, period, label, gstDueDate('GSTR1', period, 'MONTHLY', state), `GSTR-1 for ${label}`);
          push(c, 'GSTR3B', g.gstin, period, label, gstDueDate('GSTR3B', period, 'MONTHLY', state), `GSTR-3B for ${label}`);
        } else if (g.category === 'QRMP') {
          if (isQuarterEnd(m)) {
            const ql = `Q${q} ${fyLabel(fy)}`;
            push(c, 'GSTR1', g.gstin, `${fy}Q${q}`, ql, gstDueDate('GSTR1', period, 'QRMP', state), `GSTR-1 for ${ql}`);
            push(c, 'GSTR3B', g.gstin, `${fy}Q${q}`, ql, gstDueDate('GSTR3B', period, 'QRMP', state), `GSTR-3B for ${ql}`);
          } else {
            push(c, 'IFF', g.gstin, period, label, gstDueDate('IFF', period, 'QRMP', state), `IFF (optional) for ${label}`);
            push(c, 'PMT06', g.gstin, period, label, makeDate(y, m + 1, 25), `PMT-06 tax payment for ${label}`);
          }
        } else if (g.category === 'COMPOSITION_10_1' || g.category === 'COMPOSITION_10_2A') {
          if (isQuarterEnd(m)) {
            const ql = `Q${q} ${fyLabel(fy)}`;
            push(c, 'CMP08', g.gstin, `${fy}Q${q}`, ql, cmp08DueDate(fy, q), `CMP-08 for ${ql}`);
          }
          if (m === 3) push(c, 'GSTR4', g.gstin, `${fy}`, fyLabel(fy), `${fy + 1}-04-30`, `GSTR-4 for ${fyLabel(fy)}`);
        }
      }
      for (const t of c.tans) {
        push(c, 'TDS_DEPOSIT', t.tan, period, label, tdsDepositDueDate(`${period}-01`), `Deposit TDS deducted in ${label}`);
        if (isQuarterEnd(m)) {
          for (const form of t.forms) {
            const ql = `Q${q} ${fyLabel(fy)}`;
            push(c, 'TDS_STATEMENT', t.tan, `${form}:${fy}Q${q}`, `Form ${form} ${ql}`, tdsStatementDueDate(form, fy, q), `Form ${form} statement for ${ql}`);
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.clientName.localeCompare(b.clientName) || a.title.localeCompare(b.title));
}
