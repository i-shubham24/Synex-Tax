'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CheckCheck, CircleAlert, FileCheck2, Inbox, KeyRound, Upload, UserCheck } from 'lucide-react';
import { useWorkspace } from '../../../workspace/WorkspaceContext';
import type { NotificationCategory } from '../../../workspace/types';
import { iconButtonClass, panelClass, usePopover } from './usePopover';

const CATS: Array<{ id: NotificationCategory | 'ALL'; label: string; phase2?: boolean }> = [
  { id: 'ALL', label: 'All' },
  { id: 'TOKEN', label: 'Tokens' },
  { id: 'APPROVAL', label: 'Approvals' },
  { id: 'IMS', label: 'IMS' },
  { id: 'FVU', label: 'FVU jobs' },
  { id: 'UPLOAD', label: 'Uploads', phase2: true },
];

const ICON: Record<NotificationCategory, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  TOKEN: { icon: KeyRound, tone: 'bg-pos-red/15 text-pos-red' },
  APPROVAL: { icon: UserCheck, tone: 'bg-pos-accent/15 text-pos-accent' },
  IMS: { icon: Inbox, tone: 'bg-[#f2b53a]/15 text-[#b9800f]' },
  FVU: { icon: FileCheck2, tone: 'bg-pos-green/15 text-pos-green' },
  UPLOAD: { icon: Upload, tone: 'bg-pos-muted text-pos-ink/60' },
};

function ago(iso: string) {
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/** Categorised alert bell: token revocations, FVU jobs, maker-checker approvals, pre-14th IMS, client uploads (Phase 2). */
export function NotificationCenter() {
  const router = useRouter();
  const { snapshot, setActiveClient } = useWorkspace();
  const pop = usePopover();
  const [cat, setCat] = useState<NotificationCategory | 'ALL'>('ALL');
  const [read, setRead] = useState<Set<string>>(() => new Set(['n4']));

  const unread = snapshot.notifications.filter((n) => !read.has(n.id)).length;
  const list = useMemo(() => snapshot.notifications.filter((n) => cat === 'ALL' || n.category === cat), [snapshot.notifications, cat]);

  return (
    <div ref={pop.ref} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={pop.open}
        onClick={() => pop.setOpen((o) => !o)}
        className={iconButtonClass}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pos-red px-1 text-[12px] font-semibold text-white ring-2 ring-[#eef4fd] dark:ring-[#1d2430]">
            {unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {pop.open && (
          <motion.div
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className={`${panelClass} right-0 w-[390px] origin-top-right`}
          >
            <div className="flex items-center justify-between px-4 pb-2 pt-3">
              <p className="text-[15px] font-semibold text-pos-ink">Notifications</p>
              <button
                type="button"
                onClick={() => setRead(new Set(snapshot.notifications.map((n) => n.id)))}
                disabled={unread === 0}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-medium text-pos-accent hover:bg-pos-tint disabled:opacity-40"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all as read
              </button>
            </div>
            <div className="flex gap-1 overflow-x-auto border-b border-pos-line px-3 pb-2.5" role="tablist">
              {CATS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={cat === c.id}
                  onClick={() => setCat(c.id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                    cat === c.id ? 'bg-pos-ink text-pos-surface' : 'text-pos-ink/60 hover:bg-pos-muted'
                  }`}
                >
                  {c.label}
                  {c.phase2 && <span className="ml-1 text-[12px] opacity-60">P2</span>}
                </button>
              ))}
            </div>
            <ul className="max-h-[380px] overflow-y-auto py-1">
              {list.map((n) => {
                const meta = ICON[n.category];
                const Icon = meta.icon;
                const isUnread = !read.has(n.id);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setRead((s) => new Set(s).add(n.id));
                        if (n.entityId) setActiveClient({ entityId: n.entityId, gstin: snapshot.entities.find((e) => e.id === n.entityId)?.gstins[0]?.gstin });
                        pop.setOpen(false);
                        if (n.href.includes('view=')) {
                          const v = new URLSearchParams(n.href.split('?')[1]).get('view');
                          if (v && typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('synextax:switch-view', { detail: v }));
                          }
                        }
                        router.push(n.href);
                      }}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-pos-muted"
                    >
                      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.tone}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`text-[13.5px] ${isUnread ? 'font-semibold text-pos-ink' : 'font-medium text-pos-ink/80'}`}>{n.title}</span>
                          {isUnread && <span className="h-2 w-2 rounded-full bg-pos-accent" aria-label="Unread" />}
                        </span>
                        <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-pos-ink/60">{n.body}</span>
                        <span className="mt-1 block text-[12.5px] text-pos-ink/60">{ago(n.at)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {list.length === 0 && (
                <li className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[13px] text-pos-ink/55">
                  <CircleAlert className="h-5 w-5 opacity-50" />
                  {cat === 'UPLOAD' ? 'Client portal uploads arrive with the client portal (Phase 2).' : 'Nothing here right now.'}
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
