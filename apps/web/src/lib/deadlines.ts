/**
 * The next GST or TDS due date from a given day, for a monthly GST filer:
 *   7th   TDS deposit for the month before (30 April for March)
 *   11th  GSTR-1
 *   14th  IMS actions before 2B is generated
 *   20th  GSTR-3B
 *   31 Jul, 31 Oct, 31 Jan, 31 May   TDS statements for the quarter before
 * Dates only; notified extensions are not applied.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface NextDue {
  /** e.g. "GSTR-1 for November" */
  what: string;
  /** e.g. "Fri 11 Dec" */
  due: string;
  days: number;
}

const QUARTER_FOR: Record<number, string> = { 6: 'April to June', 9: 'July to September', 0: 'October to December', 4: 'January to March' };

function candidates(year: number, month: number): Array<{ date: Date; what: string }> {
  const prev = MONTHS[(month + 11) % 12];
  const out = [
    { date: new Date(year, month, 11), what: `GSTR-1 for ${prev}` },
    { date: new Date(year, month, 14), what: `IMS actions for ${prev}` },
    { date: new Date(year, month, 20), what: `GSTR-3B for ${prev}` },
  ];
  // TDS deposit: the 7th, except March's tax, which is due on 30 April.
  if (month === 3) out.push({ date: new Date(year, 3, 30), what: 'TDS deposit for March' });
  else out.push({ date: new Date(year, month, 7), what: `TDS deposit for ${prev}` });
  // Quarterly TDS statements.
  if (month in QUARTER_FOR) out.push({ date: new Date(year, month + 1, 0), what: `TDS statements for ${QUARTER_FOR[month]}` });
  return out;
}

export function nextDue(today: Date): NextDue {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const all = [...candidates(start.getFullYear(), start.getMonth()), ...candidates(start.getFullYear(), start.getMonth() + 1)]
    .filter((c) => c.date >= start)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const n = all[0];
  return {
    what: n.what,
    due: `${DAYS[n.date.getDay()]} ${n.date.getDate()} ${MONTHS[n.date.getMonth()].slice(0, 3)}`,
    days: Math.round((n.date.getTime() - start.getTime()) / 86_400_000),
  };
}
