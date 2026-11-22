import type { PoolClient } from 'pg';
import { SERVICE_PHRASE, reminderMessage, whatsappLink, type ChecklistService } from '@synextax/tax-engine';
import { sesMailerFromEnv, type Mailer } from '../../integrations/mail.js';
import { whatsappFromEnv, type WhatsAppSender } from '../../integrations/whatsapp.js';

/**
 * Document reminders to a client: the message text, sending it by email or WhatsApp when an
 * account is set up, and recording it. Used by the reminder a user sends from a checklist
 * (practice.routes.ts) and by the daily automatic reminders (practiceAutomation.routes.ts).
 */
export type ReminderChannel = 'EMAIL' | 'WHATSAPP';

export interface ReminderSenders {
  mailer: Mailer | null;
  whatsapp: WhatsAppSender | null;
}

let override: ReminderSenders | null = null;

/** The configured senders, read from the environment on each call. */
export function reminderSenders(): ReminderSenders {
  return override ?? { mailer: sesMailerFromEnv(), whatsapp: whatsappFromEnv() };
}

/** For tests: replace the senders, or pass null to go back to the environment. */
export function setReminderSenders(s: ReminderSenders | null) {
  override = s;
}

export interface ReminderTarget {
  checklistId: string;
  entityId: string;
  clientName: string;
  firmName: string;
  periodLabel: string;
  service: string;
  dueDate: string;
  email: string | null;
  mobile: string | null;
  outstanding: string[];
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

/** The checklist, its client's primary contact and what is still outstanding; null when not visible. */
export async function loadReminderTarget(c: PoolClient, checklistId: string): Promise<ReminderTarget | null> {
  const k = await c.query(
    `SELECT k.id, k.entity_id, k.service, k.period_label, k.due_date, e.legal_name, COALESCE(f.trade_name, f.legal_name) AS firm_name,
            ct.mobile_e164, ct.email, ct.full_name
     FROM public.doc_checklists k
     JOIN public.entities e ON e.id = k.entity_id
     JOIN public.firms f ON f.id = k.firm_id
     LEFT JOIN LATERAL (SELECT mobile_e164, email, full_name FROM public.entity_contacts x WHERE x.entity_id = k.entity_id ORDER BY x.is_primary DESC, x.created_at LIMIT 1) ct ON true
     WHERE k.id = $1`,
    [checklistId],
  );
  const row = k.rows[0];
  if (!row) return null;
  const outstanding = (
    await c.query<{ label: string }>(`SELECT label FROM public.doc_checklist_items WHERE checklist_id = $1 AND status IN ('MISSING','REJECTED') ORDER BY position`, [checklistId])
  ).rows.map((r) => r.label);
  return {
    checklistId: row.id,
    entityId: row.entity_id,
    clientName: row.full_name || row.legal_name,
    firmName: row.firm_name,
    periodLabel: row.period_label,
    service: row.service,
    dueDate: iso(row.due_date),
    email: row.email ?? null,
    mobile: row.mobile_e164 ?? null,
    outstanding,
  };
}

/** The reminder text and email subject for a checklist. */
export function composeReminder(t: ReminderTarget): { message: string; subject: string } {
  const message = reminderMessage({
    clientName: t.clientName,
    firmName: t.firmName,
    periodLabel: t.periodLabel,
    serviceLabel: SERVICE_PHRASE[t.service as ChecklistService] ?? 'compliance work',
    dueDate: t.dueDate,
    outstanding: t.outstanding,
  });
  return { message, subject: `Documents needed for ${t.periodLabel}` };
}

export interface DeliveryResult {
  message: string;
  /** Sent from SynexTax through the firm's mail or WhatsApp account. */
  sent: boolean;
  /** When not sent: a wa.me or mailto link the user sends themselves. */
  link: string | null;
  /** The client has no email or mobile for this channel. */
  missingContact: boolean;
  /** Mail or WhatsApp sending is not set up for this deployment. */
  notSetUp: boolean;
}

/**
 * Sends the reminder on one channel when the account is set up and the client has a contact;
 * otherwise builds the link. Throws when the provider refuses the message.
 */
export async function deliverReminder(t: ReminderTarget, channel: ReminderChannel, senders: ReminderSenders = reminderSenders()): Promise<DeliveryResult> {
  const { message, subject } = composeReminder(t);
  let sent = false;
  if (channel === 'EMAIL' && t.email && senders.mailer) {
    await senders.mailer.send({ to: t.email, subject, text: message });
    sent = true;
  } else if (channel === 'WHATSAPP' && t.mobile && senders.whatsapp) {
    await senders.whatsapp.sendReminder(t.mobile, [t.clientName, t.periodLabel, t.outstanding.join('; ') || 'none', t.dueDate, t.firmName]);
    sent = true;
  }
  const contact = channel === 'EMAIL' ? t.email : t.mobile;
  const link = sent
    ? null
    : channel === 'WHATSAPP'
      ? t.mobile ? whatsappLink(t.mobile, message) : null
      : t.email ? `mailto:${t.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}` : null;
  const notSetUp = channel === 'EMAIL' ? !senders.mailer : !senders.whatsapp;
  return { message, sent, link, missingContact: !contact, notSetUp };
}

/** Records a reminder against the checklist, so the gap view shows the last chase. sentBy is null for the daily job. */
export async function recordReminder(c: PoolClient, t: Pick<ReminderTarget, 'entityId' | 'checklistId'>, channel: ReminderChannel, sentBy: string | null) {
  await c.query(`INSERT INTO public.doc_reminders (firm_id, entity_id, checklist_id, channel, sent_by) VALUES (app.current_firm_id(), $1, $2, $3, $4)`, [t.entityId, t.checklistId, channel, sentBy]);
}
