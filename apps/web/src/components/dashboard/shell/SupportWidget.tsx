'use client';

import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, LifeBuoy, X } from 'lucide-react';
import { useWorkspace } from '../../../workspace/WorkspaceContext';

/**
 * Rush-day support: captures the current screen, the active client id (identifiers only,
 * never passwords, PINs or tokens) and the latest captured error into one ticket draft.
 */
export function SupportWidget() {
  const pathname = usePathname();
  const { activeClient, errors, source } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const context = useMemo(
    () => ({
      screen: pathname,
      client: activeClient?.entityId ?? 'none',
      gstin: activeClient?.gstin,
      tan: activeClient?.tan,
      lastError: errors[0] ? `${errors[0].source}: ${errors[0].message}` : 'none',
      at: new Date().toISOString(),
    }),
    [pathname, activeClient, errors],
  );

  const summary = Object.entries(context)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-40 flex h-12 items-center gap-2 rounded-full bg-[#141416] pl-4 pr-5 text-[13.5px] font-medium text-white shadow-[0_14px_30px_-12px_rgba(20,20,22,0.8)] transition-transform hover:-translate-y-0.5"
      >
        <LifeBuoy className="h-4 w-4 text-[#5fe88a]" /> Help
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Contact support"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 right-5 z-40 w-[360px] overflow-hidden rounded-[22px] bg-pos-surface text-pos-ink shadow-[0_0_0_1px_rgb(var(--pos-line)),0_30px_70px_-24px_rgba(10,20,40,0.5)]"
          >
            <div className="flex items-start justify-between border-b border-pos-line p-4">
              <div>
                <p className="text-[15px] font-semibold">Support desk</p>
                <p className="text-[12px] text-pos-ink/55">9 AM to 10 PM IST on deadline days</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close support" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-pos-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            {sent ? (
              <div className="p-5 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-pos-green/15 text-pos-green">
                  <Check className="h-5 w-5" />
                </span>
                <p className="mt-3 text-[14.5px] font-semibold">Ticket {sent} drafted</p>
                <p className="mt-1 text-[12.5px] leading-[1.5] text-pos-ink/60">
                  {source === 'sample'
                    ? 'Sample mode: the ticket is kept in this browser and not sent yet. The support desk connects with the live API.'
                    : 'Our Amritsar desk will reply on this screen and by email.'}
                </p>
                <button type="button" onClick={() => { setSent(null); setMessage(''); }} className="mt-4 text-[13px] font-medium text-pos-accent">
                  Write another
                </button>
              </div>
            ) : (
              <form
                className="space-y-3 p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!message.trim()) return;
                  const id = `SX-${Date.now().toString(36).slice(-5).toUpperCase()}`;
                  try {
                    const all = JSON.parse(localStorage.getItem('synextax_support_drafts') || '[]');
                    all.unshift({ id, message, context });
                    localStorage.setItem('synextax_support_drafts', JSON.stringify(all.slice(0, 20)));
                  } catch {
                    /* storage unavailable */
                  }
                  setSent(id);
                }}
              >
                <label htmlFor="support-msg" className="block text-[12.5px] font-medium text-pos-ink/70">
                  What went wrong?
                </label>
                <textarea
                  id="support-msg"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="e.g. GSTR-3B save fails for this client with an OTP error"
                  className="w-full resize-none rounded-[16px] border border-pos-line bg-pos-muted p-3 text-[13px] outline-none focus:border-pos-accent"
                />
                <div className="rounded-[14px] bg-pos-muted p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11.5px] font-medium text-pos-ink/55">Attached automatically</p>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(summary);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        } catch {
                          /* clipboard unavailable */
                        }
                      }}
                      className="flex items-center gap-1 text-[11.5px] font-medium text-pos-accent"
                    >
                      <Copy className="h-3 w-3" /> {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="ident mt-1.5 whitespace-pre-wrap break-all font-mono text-[11px] leading-[1.5] text-pos-ink/70">{summary}</pre>
                </div>
                <button type="submit" disabled={!message.trim()} className="h-10 w-full rounded-full bg-pos-head text-[13px] font-medium text-white disabled:opacity-40">
                  Create ticket
                </button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
