/**
 * Document checklists: what a client sends the firm for each service, which items are still
 * outstanding across clients, and the reminder that goes to the client.
 */

export type ChecklistService = 'GST_MONTHLY' | 'GST_QRMP_QUARTER' | 'TDS_QUARTER' | 'ITR_INDIVIDUAL' | 'ITR_BUSINESS';

export const SERVICE_LABEL: Record<ChecklistService, string> = {
  GST_MONTHLY: 'GST, monthly',
  GST_QRMP_QUARTER: 'GST, QRMP quarter',
  TDS_QUARTER: 'TDS, quarter',
  ITR_INDIVIDUAL: 'Income tax return, individual',
  ITR_BUSINESS: 'Income tax return, business',
};

/** How a service reads inside a sentence to the client. */
export const SERVICE_PHRASE: Record<ChecklistService, string> = {
  GST_MONTHLY: 'monthly GST return',
  GST_QRMP_QUARTER: 'quarterly GST return',
  TDS_QUARTER: 'quarterly TDS statement',
  ITR_INDIVIDUAL: 'income tax return',
  ITR_BUSINESS: 'income tax return',
};

export const CHECKLIST_TEMPLATES: Record<ChecklistService, string[]> = {
  GST_MONTHLY: [
    'Sales invoices or sales register',
    'Purchase invoices or purchase register',
    'Credit and debit notes issued and received',
    'Bank statement for the month',
    'E-way bills and e-invoices, if any',
    'Expenses with GST (rent, freight, professional fees)',
  ],
  GST_QRMP_QUARTER: [
    'Sales invoices for the quarter',
    'Purchase invoices for the quarter',
    'Credit and debit notes',
    'Bank statements for the quarter',
    'PMT-06 challans paid in the first two months',
  ],
  TDS_QUARTER: [
    'Payments to contractors, professionals, landlords and others, with PAN',
    'Challans paid for tax deducted',
    'PAN of new payees',
    'Form 121 declarations from payees (no-deduction requests)',
    'Lower or nil deduction certificates received',
    'Salary details, if Form 138 is filed',
  ],
  ITR_INDIVIDUAL: [
    'Form 130 (Form 16) from each employer',
    'Bank interest certificates',
    'Investment proofs for deductions (insurance, PPF, ELSS, health insurance)',
    'Capital gains statements from brokers and mutual funds',
    'Rent receipts and landlord PAN, if HRA is claimed',
    'Home loan interest certificate',
  ],
  ITR_BUSINESS: [
    'Books of account or Tally backup for the year',
    'Bank statements for every account',
    'Loan statements and interest certificates',
    'Fixed asset purchases and sales',
    'GST returns filed for the year',
    'TDS certificates received (Form 131)',
  ],
};

export type ItemStatus = 'MISSING' | 'RECEIVED' | 'ACCEPTED' | 'REJECTED' | 'NOT_NEEDED';
export const OUTSTANDING: ReadonlySet<ItemStatus> = new Set<ItemStatus>(['MISSING', 'REJECTED']);

export interface GapChecklist {
  id: string;
  entityId: string;
  clientName: string;
  service: ChecklistService | 'CUSTOM';
  periodLabel: string;
  dueDate: string; // ISO
  items: Array<{ id: string; label: string; status: ItemStatus }>;
}

export type GapBucket = 'OVERDUE' | 'THIS_WEEK' | 'LATER';

export interface GapRow extends GapChecklist {
  bucket: GapBucket;
  outstanding: string[];
  done: number;
  total: number;
}

/** Checklists that still need something from the client, grouped by how urgent they are. */
export function documentGaps(checklists: GapChecklist[], today: string): Record<GapBucket, GapRow[]> {
  const weekEnd = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const out: Record<GapBucket, GapRow[]> = { OVERDUE: [], THIS_WEEK: [], LATER: [] };
  for (const c of checklists) {
    const needed = c.items.filter((i) => i.status !== 'NOT_NEEDED');
    const outstanding = needed.filter((i) => OUTSTANDING.has(i.status)).map((i) => i.label);
    if (!outstanding.length) continue;
    const bucket: GapBucket = c.dueDate < today ? 'OVERDUE' : c.dueDate <= weekEnd ? 'THIS_WEEK' : 'LATER';
    out[bucket].push({ ...c, bucket, outstanding, done: needed.length - outstanding.length, total: needed.length });
  }
  for (const b of Object.keys(out) as GapBucket[]) out[b].sort((x, y) => x.dueDate.localeCompare(y.dueDate) || x.clientName.localeCompare(y.clientName));
  return out;
}

/** The reminder sent to the client (plain text for WhatsApp, SMS or email). */
export function reminderMessage(input: { clientName: string; firmName: string; periodLabel: string; serviceLabel: string; dueDate: string; outstanding: string[] }): string {
  const due = new Date(`${input.dueDate}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return [
    `Namaste ${input.clientName},`,
    '',
    `For your ${input.serviceLabel} for ${input.periodLabel}, we still need:`,
    ...input.outstanding.map((o) => `- ${o}`),
    '',
    `Please send these by ${due} so we can file on time.`,
    '',
    input.firmName,
  ].join('\n');
}

/** wa.me link that opens WhatsApp with the message ready; nothing is sent until the user presses send. */
export function whatsappLink(mobileE164: string, message: string): string | null {
  const digits = mobileE164.replace(/\D/g, '');
  if (!/^91[6-9]\d{9}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
