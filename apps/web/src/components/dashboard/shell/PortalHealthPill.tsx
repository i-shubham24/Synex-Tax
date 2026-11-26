'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { panelClass, usePopover } from './usePopover';

interface PortalStatus {
  name: string;
  code: string;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  latencyMs: number;
}

export function PortalHealthPill() {
  const [portals, setPortals] = useState<PortalStatus[]>([
    { name: 'GSTN Portal', code: 'GSTN', status: 'ONLINE', latencyMs: 142 },
    { name: 'NIC e-Invoice IRP', code: 'NIC_IRP', status: 'ONLINE', latencyMs: 88 },
    { name: 'TRACES Portal', code: 'TRACES', status: 'ONLINE', latencyMs: 210 },
    { name: 'ITD e-Filing', code: 'ITD', status: 'ONLINE', latencyMs: 165 },
  ]);
  const [loading, setLoading] = useState(false);
  const pop = usePopover();

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/compliance/portal-health');
      if (res.ok) {
        const data = await res.json();
        if (data.portals) {
          setPortals(data.portals);
        }
      }
    } catch {
      // Keep state on failure
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  const hasOffline = portals.some((p) => p.status === 'OFFLINE');
  const hasDegraded = portals.some((p) => p.status === 'DEGRADED');

  const dotColor = hasOffline ? 'bg-red-500' : hasDegraded ? 'bg-amber-500' : 'bg-emerald-500';
  const labelText = hasOffline ? 'Portals Degraded' : hasDegraded ? 'Portals Slow' : 'Portals Live';

  return (
    <div ref={pop.ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => pop.setOpen((o) => !o)}
        aria-expanded={pop.open}
        aria-label="Government portal health status"
        className="flex h-10 items-center gap-2 rounded-full border border-pos-line bg-pos-surface/70 px-3 text-[12px] font-medium text-pos-ink/80 hover:bg-pos-muted transition-colors"
      >
        <span className={`h-2 w-2 rounded-full ${dotColor} animate-pulse`} />
        <span>{labelText}</span>
      </button>

      <AnimatePresence>
        {pop.open && (
          <motion.div
            role="dialog"
            aria-label="Statutory Portal Status"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className={`${panelClass} fixed right-3 top-16 sm:absolute sm:right-0 sm:top-[calc(100%+10px)] w-[calc(100vw-24px)] sm:w-[320px] max-w-[320px] p-4 text-pos-ink origin-top-right`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-pos-line">
              <span className="text-[13px] font-semibold">Statutory Portal Health</span>
              <button
                type="button"
                onClick={fetchHealth}
                aria-label="Refresh portal health"
                className="text-pos-ink/60 hover:text-pos-ink"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {portals.map((p) => (
                <div key={p.code} className="flex items-center justify-between rounded-lg bg-pos-muted/50 p-2 text-[12px]">
                  <div className="flex items-center gap-2">
                    {p.status === 'ONLINE' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : p.status === 'DEGRADED' ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="font-medium text-pos-ink">{p.name}</span>
                  </div>
                  <span className="font-mono text-[11px] text-pos-ink/60 tabular-nums">{p.latencyMs}ms</span>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[11px] text-pos-ink/50 text-center">
              Health checked every 60 seconds from ap-south-1.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
