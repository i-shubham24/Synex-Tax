'use client';

import React, { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'NOT_APPLICABLE';
export interface PracticeTask {
  id: string;
  entity_id: string;
  client: string;
  kind: string;
  reference: string | null;
  title: string;
  period_label: string;
  due_date: string;
  status: TaskStatus;
  assignee: string | null;
  overdue: boolean;
  updated_at?: string;
}

export const COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: 'OPEN', label: 'Open' },
  { status: 'IN_PROGRESS', label: 'In progress' },
  { status: 'DONE', label: 'Done' },
  { status: 'NOT_APPLICABLE', label: 'Not needed' },
];

const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Tasks in columns by status. Move a card with its arrow buttons, or focus it and press the left or
 * right arrow key. Each move sends the version the board showed (If-Match), so a task someone else
 * changed meanwhile is not overwritten.
 */
export function TaskBoard({ tasks, onMove, busyId, focusId }: { tasks: PracticeTask[]; onMove: (task: PracticeTask, to: TaskStatus) => void; busyId: string | null; focusId: string | null }) {
  const root = useRef<HTMLDivElement>(null);
  // After a move the card lands in another column; keep the keyboard on it.
  useEffect(() => {
    if (!focusId) return;
    root.current?.querySelector<HTMLElement>(`[data-task-id="${focusId}"]`)?.focus();
  }, [focusId, tasks]);

  const move = (t: PracticeTask, step: -1 | 1) => {
    const i = COLUMNS.findIndex((c) => c.status === t.status) + step;
    if (i >= 0 && i < COLUMNS.length) onMove(t, COLUMNS[i].status);
  };

  return (
    <div ref={root} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <p className="sr-only" id="board-help">Focus a task and press the left or right arrow key to move it to the previous or next column.</p>
      {COLUMNS.map((col, ci) => {
        const items = tasks.filter((t) => t.status === col.status);
        return (
          <section key={col.status} aria-label={`${col.label}, ${items.length} task${items.length === 1 ? '' : 's'}`} className="pos-card flex min-h-[160px] flex-col p-3">
            <h3 className="mb-2 flex items-center justify-between px-1 text-[13.5px] font-semibold text-pos-ink">
              {col.label} <span className="font-normal tabular-nums text-pos-ink/60">{items.length}</span>
            </h3>
            <ul className="flex-1 space-y-2 overflow-y-auto pr-0.5 [max-height:65vh]">
              {items.map((t) => (
                <li
                  key={t.id}
                  data-task-id={t.id}
                  tabIndex={0}
                  aria-describedby="board-help"
                  aria-busy={busyId === t.id}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') { e.preventDefault(); move(t, -1); }
                    if (e.key === 'ArrowRight') { e.preventDefault(); move(t, 1); }
                  }}
                  className={`rounded-[10px] border border-pos-line bg-pos-surface p-2.5 text-[12.5px] outline-none focus:border-pos-accent focus:ring-2 focus:ring-pos-accent/25 ${busyId === t.id ? 'opacity-60' : ''}`}
                >
                  <p className="font-medium text-pos-ink">{t.title}</p>
                  <p className="text-pos-ink/65">{t.client}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px]">
                    <span className={t.overdue ? 'font-medium text-[#dc2626]' : 'text-pos-ink/60'}>Due {nice(t.due_date)}{t.overdue ? ', overdue' : ''}</span>
                    {t.reference && <span className="font-mono text-[12.5px] text-pos-ink/60">{t.reference}</span>}
                  </p>
                  {t.assignee && <p className="text-[12px] text-pos-ink/55">{t.assignee}</p>}
                  <div className="mt-1.5 flex justify-between">
                    <button type="button" disabled={ci === 0 || busyId === t.id} onClick={() => move(t, -1)} aria-label={`Move ${t.title} for ${t.client} to ${COLUMNS[ci - 1]?.label ?? ''}`} className="rounded-full p-1 text-pos-ink/55 hover:bg-pos-tint disabled:invisible"><ChevronLeft className="h-4 w-4" /></button>
                    <button type="button" disabled={ci === COLUMNS.length - 1 || busyId === t.id} onClick={() => move(t, 1)} aria-label={`Move ${t.title} for ${t.client} to ${COLUMNS[ci + 1]?.label ?? ''}`} className="rounded-full p-1 text-pos-ink/55 hover:bg-pos-tint disabled:invisible"><ChevronRight className="h-4 w-4" /></button>
                  </div>
                </li>
              ))}
              {!items.length && <li className="px-1 text-[12px] text-pos-ink/60">Nothing here.</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
