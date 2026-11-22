import Decimal from 'decimal.js';
import { tdsDepositDueDate } from '../compliance/interest.js';

/**
 * Links deductee rows to challans when a firm keeps payments and challans as separate lists.
 * Tax deducted in a month is paid by a challan dated after that month began and no later than its
 * due date (7th of the next month; 30 April for March), or late after that. For each month:
 *   1. a challan paid on time whose amount equals the month's tax takes all of the month's rows;
 *   2. otherwise rows fill the month's challans in date order, each row whole, while a challan has room.
 * Rows that fit nowhere are reported, never forced onto a challan that cannot cover them.
 */

export interface LinkRow {
  key: string;
  deductedOn: string; // ISO
  tax: string;
}

export interface LinkChallan {
  key: string;
  depositedOn: string; // ISO
  tax: string; // tax portion of the challan available for these rows
}

export interface LinkResult {
  links: Record<string, string>; // row key -> challan key
  unlinked: Array<{ key: string; reason: string }>;
  challanBalance: Record<string, string>; // what is left on each challan
}

export function linkRowsToChallans(rows: LinkRow[], challans: LinkChallan[]): LinkResult {
  const room = new Map(challans.map((c) => [c.key, new Decimal(c.tax || 0)]));
  const links: Record<string, string> = {};
  const unlinked: LinkResult['unlinked'] = [];
  const byMonth = new Map<string, LinkRow[]>();
  for (const r of [...rows].sort((a, b) => a.deductedOn.localeCompare(b.deductedOn))) {
    const m = r.deductedOn.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), r]);
  }
  const sorted = [...challans].sort((a, b) => a.depositedOn.localeCompare(b.depositedOn) || a.key.localeCompare(b.key));
  for (const [month, list] of [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const due = tdsDepositDueDate(`${month}-01`);
    // Challans that can pay this month: deposited on or after the month began (on time first, then late).
    const candidates = sorted.filter((c) => c.depositedOn >= `${month}-01`).sort((a, b) => Number(a.depositedOn > due) - Number(b.depositedOn > due) || a.depositedOn.localeCompare(b.depositedOn));
    const total = list.reduce((s, r) => s.add(r.tax || 0), new Decimal(0));
    // An exact total counts only on a challan paid on time; a late one is used only after those.
    const exact = candidates.find((c) => c.depositedOn <= due && room.get(c.key)!.eq(total));
    if (exact) {
      for (const r of list) links[r.key] = exact.key;
      room.set(exact.key, new Decimal(0));
      continue;
    }
    for (const r of list) {
      const tax = new Decimal(r.tax || 0);
      const c = candidates.find((x) => room.get(x.key)!.gte(tax));
      if (!c) {
        unlinked.push({ key: r.key, reason: candidates.length ? `No challan from ${month} onwards has Rs ${tax.toFixed(2)} left.` : `No challan dated in or after ${month}.` });
        continue;
      }
      links[r.key] = c.key;
      room.set(c.key, room.get(c.key)!.sub(tax));
    }
  }
  return { links, unlinked, challanBalance: Object.fromEntries([...room.entries()].map(([k, v]) => [k, v.toFixed(2)])) };
}
