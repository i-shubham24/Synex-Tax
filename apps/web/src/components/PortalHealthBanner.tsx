'use client';

import React, { useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';

interface PortalStatus {
  name: string;
  status: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE';
  latencyMs: number;
}

export function PortalHealthBanner() {
  const [portals] = useState<PortalStatus[]>([
    { name: 'GSTN Portal', status: 'OPERATIONAL', latencyMs: 142 },
    { name: 'NIC e-Invoice IRP', status: 'OPERATIONAL', latencyMs: 88 },
    { name: 'TRACES TDS', status: 'OPERATIONAL', latencyMs: 310 },
    { name: 'Income Tax e-Filing', status: 'OPERATIONAL', latencyMs: 195 },
  ]);

  const [lastUpdated, setLastUpdated] = useState<string>('Just now');

  return (
    <aside
      aria-label="Government Portal Status Banner"
      className="w-full bg-[#0E0F10] border-b border-[#24272B] text-xs py-1.5 px-4 text-slate-300"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium">
          <Activity className="w-3.5 h-3.5 text-[#52E888] animate-pulse" />
          <span className="text-slate-400 font-mono text-[11px] font-semibold tracking-wider uppercase">
            Govt Portal Telemetry:
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {portals.map((p) => {
            const dotColor =
              p.status === 'OPERATIONAL'
                ? 'bg-[#52E888] ring-[#52E888]/20'
                : p.status === 'DEGRADED'
                ? 'bg-[#F59E0B] ring-[#F59E0B]/20'
                : 'bg-[#EF4444] ring-[#EF4444]/20';

            return (
              <div key={p.name} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ring-2 ${dotColor}`} />
                <span className="text-slate-200 text-xs font-medium">{p.name}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#17191C] text-[#52E888] border border-[#24272B] tabular-nums">
                  {p.latencyMs}ms
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-slate-400 text-xs font-mono">
          <span>Synced: {lastUpdated}</span>
          <button
            onClick={() => setLastUpdated('Just now')}
            className="hover:text-white transition-colors p-0.5"
            title="Refresh portal latency telemetry"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>
    </aside>
  );
}
