import type { PoolClient } from 'pg';
import { db } from '../../db/pool.js';
import { deliverReminder, loadReminderTarget, recordReminder, reminderSenders, type ReminderChannel, type ReminderSenders, type ReminderTarget } from './reminders.js';

/**
 * Reminders that send themselves. Each open checklist with something outstanding is counted from
 * the day it first went to the client (the firm's first reminder or upload link). On the firm's
 * client days (default day 1 and day 5) the client gets the reminder by the firm's channels; on
 * the firm-note day (default day 10) the firm gets a note in SynexTax to call the client. Each
 * step is claimed in a log before anything is sent, so a rerun on the same day sends nothing.
 */
export interface AutomationSettings {
  clientDays: number[];
  firmNoteDay: number | null;
  channels: ReminderChannel[];
  paused: boolean;
}

export const DEFAULT_SETTINGS: AutomationSettings = { clientDays: [1, 5], firmNoteDay: 10, channels: ['EMAIL', 'WHATSAPP'], paused: false };

/** A missed run is caught up for this many days; older client steps are skipped, not sent late. */
export const CATCH_UP_DAYS = 3;

export const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
export const istDate = (d: Date | string) => new Date(new Date(d).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const isoDate = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export interface StepLog {
  kind: 'CLIENT' | 'FIRM';
  stepDay: number;
  outcome: string;
  runOn: string;
}

/**
 * Which steps are due today. Only the latest client step that has come round is sent (an earlier
 * one it supersedes is skipped), at most one client message a day, and none more than
 * CATCH_UP_DAYS late. A failed step is tried again on a later day.
 */
export function dueSteps(input: { sentOn: string; today: string; settings: AutomationSettings; log: StepLog[] }): { client: number | null; firm: number | null } {
  const { sentOn, today, settings, log } = input;
  const age = daysBetween(sentOn, today);
  const done = (kind: StepLog['kind'], day: number) => log.some((l) => l.kind === kind && l.stepDay === day && l.outcome !== 'FAILED');
  const triedToday = (kind: StepLog['kind']) => log.some((l) => l.kind === kind && l.runOn === today);
  let client: number | null = null;
  if (settings.channels.length) {
    const reached = settings.clientDays.filter((d) => d <= age);
    const latest = reached.length ? Math.max(...reached) : null;
    if (latest !== null && !done('CLIENT', latest) && age - latest <= CATCH_UP_DAYS && !triedToday('CLIENT')) client = latest;
  }
  let firm: number | null = null;
  if (settings.firmNoteDay !== null && age >= settings.firmNoteDay && !done('FIRM', settings.firmNoteDay) && !triedToday('FIRM')) firm = settings.firmNoteDay;
  return { client, firm };
}

/** The next step a checklist is waiting for, for the settings screen. */
export function nextStep(input: { sentOn: string | null; today: string; settings: AutomationSettings; log: StepLog[] }): { kind: 'CLIENT' | 'FIRM'; day: number; on: string } | null {
  if (!input.sentOn) return null;
  const { sentOn, today, settings, log } = input;
  const age = daysBetween(sentOn, today);
  const due = dueSteps({ sentOn, today, settings, log });
  const options: Array<{ kind: 'CLIENT' | 'FIRM'; day: number; on: string }> = [];
  if (due.client !== null) options.push({ kind: 'CLIENT', day: due.client, on: today });
  else if (settings.channels.length) {
    const later = settings.clientDays.filter((d) => d > age);
    if (later.length) options.push({ kind: 'CLIENT', day: Math.min(...later), on: addDays(sentOn, Math.min(...later)) });
  }
  if (due.firm !== null) options.push({ kind: 'FIRM', day: due.firm, on: today });
  else if (settings.firmNoteDay !== null && settings.firmNoteDay > age) options.push({ kind: 'FIRM', day: settings.firmNoteDay, on: addDays(sentOn, settings.firmNoteDay) });
  return options.sort((x, y) => x.on.localeCompare(y.on) || (x.kind === 'CLIENT' ? -1 : 1))[0] ?? null;
}

export async function readSettings(c: PoolClient): Promise<{ settings: AutomationSettings; updatedAt: Date | null }> {
  const r = (
    await c.query<{ client_days: number[]; firm_note_day: number | null; channels: string[]; paused: boolean; updated_at: Date }>(
      `SELECT client_days, firm_note_day, channels, paused, updated_at FROM public.practice_automation_settings WHERE firm_id = app.current_firm_id()`,
    )
  ).rows[0];
  if (!r) return { settings: { ...DEFAULT_SETTINGS }, updatedAt: null };
  return {
    settings: { clientDays: [...r.client_days].map(Number).sort((a, b) => a - b), firmNoteDay: r.firm_note_day === null ? null : Number(r.firm_note_day), channels: r.channels as ReminderChannel[], paused: r.paused },
    updatedAt: r.updated_at,
  };
}

export interface OpenChecklist {
  id: string;
  entityId: string;
  clientName: string;
  service: string;
  periodLabel: string;
  dueDate: string;
  outstanding: number;
  sentOn: string | null;
  storedSentOn: boolean;
  paused: boolean;
  rowUpdatedAt: Date | null;
  log: Array<StepLog & { channels: string[]; detail: string | null }>;
}

/** Open checklists with something outstanding, with their schedule state and step log. */
export async function loadOpenChecklists(c: PoolClient): Promise<OpenChecklist[]> {
  const rows = (
    await c.query(
      `SELECT k.id, k.entity_id, e.legal_name, k.service, k.period_label, k.due_date, a.sent_on, a.paused, a.updated_at AS row_updated_at,
              (SELECT count(*) FROM public.doc_checklist_items i WHERE i.checklist_id = k.id AND i.status IN ('MISSING','REJECTED'))::int AS outstanding,
              LEAST((SELECT min(r.sent_at) FROM public.doc_reminders r WHERE r.checklist_id = k.id AND r.sent_by IS NOT NULL),
                    (SELECT min(l.created_at) FROM public.doc_upload_links l WHERE l.checklist_id = k.id)) AS first_sent
       FROM public.doc_checklists k
       JOIN public.entities e ON e.id = k.entity_id
       LEFT JOIN public.practice_checklist_automation a ON a.checklist_id = k.id
       WHERE k.status = 'OPEN'
       ORDER BY k.due_date, e.legal_name
       LIMIT 2000`,
    )
  ).rows.filter((r) => r.outstanding > 0);
  if (!rows.length) return [];
  const logs = (
    await c.query(
      `SELECT checklist_id, kind, step_day, outcome, run_on, channels, detail FROM public.practice_automation_log WHERE checklist_id = ANY($1::uuid[]) ORDER BY step_day`,
      [rows.map((r) => r.id)],
    )
  ).rows;
  return rows.map((r) => ({
    id: r.id,
    entityId: r.entity_id,
    clientName: r.legal_name,
    service: r.service,
    periodLabel: r.period_label,
    dueDate: isoDate(r.due_date),
    outstanding: r.outstanding,
    sentOn: r.sent_on ? isoDate(r.sent_on) : r.first_sent ? istDate(r.first_sent) : null,
    storedSentOn: Boolean(r.sent_on),
    paused: Boolean(r.paused),
    rowUpdatedAt: r.row_updated_at ?? null,
    log: logs
      .filter((l) => l.checklist_id === r.id)
      .map((l) => ({ kind: l.kind, stepDay: Number(l.step_day), outcome: l.outcome, runOn: isoDate(l.run_on), channels: l.channels ?? [], detail: l.detail })),
  }));
}

export interface FirmRunSummary {
  paused: boolean;
  checked: number;
  sent: number;
  noted: number;
  notSent: number;
  failed: number;
}

interface Claim {
  logId: string;
  target: ReminderTarget;
}

/** Runs the day's steps for one firm, as a signed system job for that firm. */
export async function runFirm(firmId: string, today: string = istToday(), senders: ReminderSenders = reminderSenders()): Promise<FirmRunSummary> {
  const summary: FirmRunSummary = { paused: false, checked: 0, sent: 0, noted: 0, notSent: 0, failed: 0 };
  const claims = await db.withSystemTransaction(firmId, async (c) => {
    const { settings } = await readSettings(c);
    if (settings.paused) {
      summary.paused = true;
      return [] as Claim[];
    }
    const lists = await loadOpenChecklists(c);
    const out: Claim[] = [];
    for (const k of lists) {
      if (!k.sentOn) continue;
      summary.checked++;
      // The schedule's first day is kept, so later reminders from the firm do not move it.
      if (!k.storedSentOn) {
        await c.query(
          `INSERT INTO public.practice_checklist_automation (firm_id, entity_id, checklist_id, sent_on) VALUES (app.current_firm_id(), $1, $2, $3)
           ON CONFLICT (firm_id, checklist_id) DO UPDATE SET sent_on = EXCLUDED.sent_on WHERE public.practice_checklist_automation.sent_on IS NULL`,
          [k.entityId, k.id, k.sentOn],
        );
      }
      if (k.paused) continue;
      const due = dueSteps({ sentOn: k.sentOn, today, settings, log: k.log });
      if (due.firm !== null) {
        const claimed = await claim(c, k, 'FIRM', due.firm, today, 'NOTED', `${k.outstanding} document${k.outstanding === 1 ? '' : 's'} still outstanding ${daysBetween(k.sentOn, today)} days after the checklist went to the client.`);
        if (claimed) summary.noted++;
      }
      if (due.client !== null) {
        const logId = await claim(c, k, 'CLIENT', due.client, today, 'PENDING', null);
        if (!logId) continue;
        const target = await loadReminderTarget(c, k.id);
        if (target) out.push({ logId, target: { ...target } });
      }
    }
    // Channels are kept with the claims so the sending below needs no second read.
    return out.map((cl) => ({ ...cl, channels: settings.channels })) as Array<Claim & { channels: ReminderChannel[] }>;
  });

  // Messages go out after the claims are committed: a crash after this point leaves a PENDING
  // step, which is not sent again.
  for (const cl of claims as Array<Claim & { channels: ReminderChannel[] }>) {
    const sentBy: ReminderChannel[] = [];
    const problems: string[] = [];
    let missing = 0;
    let notSetUp = 0;
    for (const ch of cl.channels) {
      try {
        const r = await deliverReminder(cl.target, ch, senders);
        if (r.sent) sentBy.push(ch);
        else if (r.notSetUp) notSetUp++;
        else if (r.missingContact) missing++;
      } catch (err) {
        problems.push(`${ch === 'EMAIL' ? 'Email' : 'WhatsApp'}: ${String((err as Error).message).slice(0, 120)}`);
      }
    }
    const outcome = sentBy.length ? 'SENT' : problems.length ? 'FAILED' : missing && !notSetUp ? 'NO_CONTACT' : 'NOT_SET_UP';
    const detail = sentBy.length
      ? problems.join(' ') || null
      : problems.length
        ? problems.join(' ')
        : outcome === 'NO_CONTACT'
          ? 'The client has no email or mobile for the chosen channels.'
          : 'Email and WhatsApp sending are not set up, so nothing was sent.';
    if (outcome === 'SENT') summary.sent++;
    else if (outcome === 'FAILED') summary.failed++;
    else summary.notSent++;
    await db.withSystemTransaction(firmId, async (c) => {
      await c.query(`UPDATE public.practice_automation_log SET outcome = $2, channels = $3, detail = $4 WHERE id = $1`, [cl.logId, outcome, sentBy, detail?.slice(0, 300) ?? null]);
      for (const ch of sentBy) await recordReminder(c, cl.target, ch, null);
    });
  }
  return summary;
}

/** Inserts the step, or takes over a step that failed on an earlier day; returns its id when claimed. */
async function claim(c: PoolClient, k: OpenChecklist, kind: 'CLIENT' | 'FIRM', day: number, today: string, outcome: string, detail: string | null): Promise<string | null> {
  const r = await c.query<{ id: string }>(
    `INSERT INTO public.practice_automation_log (firm_id, entity_id, checklist_id, kind, step_day, run_on, outcome, detail, outstanding)
     VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (firm_id, checklist_id, kind, step_day) DO UPDATE SET run_on = EXCLUDED.run_on, outcome = EXCLUDED.outcome, detail = EXCLUDED.detail, outstanding = EXCLUDED.outstanding
       WHERE public.practice_automation_log.outcome = 'FAILED' AND public.practice_automation_log.run_on < EXCLUDED.run_on
     RETURNING id`,
    [k.entityId, k.id, kind, day, today, outcome, detail, k.outstanding],
  );
  return r.rows[0]?.id ?? null;
}

/** Every active firm, one after another. A firm that fails does not stop the others. */
export async function runAllFirms(today: string = istToday(), onError?: (firmId: string, err: unknown) => void): Promise<{ firms: number; failedFirms: number } & Omit<FirmRunSummary, 'paused'> & { pausedFirms: number }> {
  const ids = await db.withAnonymousTransaction(async (c) => (await c.query<{ id: string }>('SELECT app.automation_firm_ids() AS id')).rows.map((r) => r.id));
  const total = { firms: ids.length, failedFirms: 0, pausedFirms: 0, checked: 0, sent: 0, noted: 0, notSent: 0, failed: 0 };
  const senders = reminderSenders();
  for (const id of ids) {
    try {
      const s = await runFirm(id, today, senders);
      if (s.paused) total.pausedFirms++;
      total.checked += s.checked;
      total.sent += s.sent;
      total.noted += s.noted;
      total.notSent += s.notSent;
      total.failed += s.failed;
    } catch (err) {
      total.failedFirms++;
      onError?.(id, err);
    }
  }
  return total;
}
