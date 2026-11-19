'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SAMPLE_SNAPSHOT } from './sample-data';
import { NO_FILTERS, type Filters } from './selectors';
import type { DataSource, Entity, WorkspaceSnapshot } from './types';

/**
 * Workspace state shared by every authenticated screen:
 * the data snapshot (and where it came from), the active client pinned across GST/TDS/DSC,
 * Control Tower filters, and a short error log the support widget attaches to tickets.
 */

export interface ActiveClient {
  entityId: string;
  gstin?: string;
  tan?: string;
}

export interface CapturedError {
  at: string;
  source: string;
  message: string;
}

interface WorkspaceValue {
  snapshot: WorkspaceSnapshot;
  source: DataSource;
  sourceNote: string | null;
  activeClient: ActiveClient | null;
  activeEntity: Entity | null;
  setActiveClient: (c: ActiveClient | null) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  errors: CapturedError[];
  captureError: (source: string, message: string) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' ? '' : 'http://localhost:4000');
const WANT_API = process.env.NEXT_PUBLIC_DATA_SOURCE === 'api';
const ACTIVE_KEY = 'synextax_active_client';

/**
 * Live adapter: maps /api/v1/client-master/tree onto the snapshot. Only entities, GSTINs and
 * TANs exist on the API today, so the rest of the snapshot stays sample until those endpoints land.
 */
async function loadFromApi(token: string): Promise<WorkspaceSnapshot> {
  const res = await fetch(`${API_BASE}/api/v1/client-master/tree`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Client master returned ${res.status}`);
  const tree = (await res.json()) as {
    groups: Array<{ id: string; name: string; entities: Array<{ id: string; legalName: string; pan: string; constitution: string; gstRegistrations: Array<{ gstin: string; stateCode?: string }>; tanRegistrations: Array<{ tan: string }> }> }>;
  };
  const entities: Entity[] = tree.groups.flatMap((g) =>
    g.entities.map((e) => ({
      id: e.id,
      groupId: g.id,
      legalName: e.legalName,
      pan: e.pan,
      constitution: (e.constitution as Entity['constitution']) ?? 'PRIVATE_LIMITED',
      assignedTo: SAMPLE_SNAPSHOT.staff[2].id,
      gstins: e.gstRegistrations.map((r) => ({
        gstin: r.gstin,
        stateCode: r.stateCode ?? r.gstin.slice(0, 2),
        type: 'REGULAR' as const,
        filingCategory: 'REGULAR_MONTHLY' as const,
        portalStatus: 'ACTIVE' as const,
        token: { state: 'NOT_ENABLED' as const, expiresAt: null },
      })),
      tans: e.tanRegistrations.map((t) => ({ tan: t.tan, branch: '', lastFiledQuarter: '', lastToken: '' })),
      dscs: [],
      itcReconciled: 0,
      pendingMismatch: 0,
    })),
  );
  return { ...SAMPLE_SNAPSHOT, groups: tree.groups.map((g) => ({ id: g.id, name: g.name })), entities };
}

export function WorkspaceProvider({ token, children }: { token: string | null; children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(SAMPLE_SNAPSHOT);
  const [source, setSource] = useState<DataSource>('sample');
  const [sourceNote, setSourceNote] = useState<string | null>(WANT_API ? 'Connecting to the API' : null);
  const [activeClient, setActiveClientState] = useState<ActiveClient | null>(() => {
    try {
      const raw = sessionStorage.getItem(ACTIVE_KEY);
      return raw ? (JSON.parse(raw) as ActiveClient) : null;
    } catch {
      return null;
    }
  });
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [errors, setErrors] = useState<CapturedError[]>([]);

  const captureError = useCallback((src: string, message: string) => {
    setErrors((e) => [{ at: new Date().toISOString(), source: src, message }, ...e].slice(0, 10));
  }, []);

  useEffect(() => {
    if (!WANT_API) return;
    // A real session token is a JWT (three dot-separated parts); demo sessions are not.
    if (!token || token.split('.').length !== 3) {
      setSourceNote('Sign in with an API account to load live data');
      return;
    }
    let cancelled = false;
    loadFromApi(token)
      .then((s) => {
        if (cancelled) return;
        setSnapshot(s);
        setSource('api');
        setSourceNote(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setSourceNote(`API unavailable: ${err.message}`);
        captureError('workspace-load', err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, captureError]);

  const setActiveClient = useCallback((c: ActiveClient | null) => {
    setActiveClientState(c);
    try {
      if (c) sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(c));
      else sessionStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const activeEntity = useMemo(
    () => (activeClient ? snapshot.entities.find((e) => e.id === activeClient.entityId) ?? null : null),
    [activeClient, snapshot.entities],
  );

  const value = useMemo<WorkspaceValue>(
    () => ({ snapshot, source, sourceNote, activeClient, activeEntity, setActiveClient, filters, setFilters, errors, captureError }),
    [snapshot, source, sourceNote, activeClient, activeEntity, setActiveClient, filters, errors, captureError],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const v = useContext(WorkspaceContext);
  if (!v) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return v;
}
