'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { CustomersPanel } from '../../../components/billing/CustomersPanel';
import { DocumentsPanel } from '../../../components/billing/DocumentsPanel';
import { Gstr1Panel } from '../../../components/billing/Gstr1Panel';
import { InvoiceEntry } from '../../../components/billing/InvoiceEntry';
import { ItemsPanel } from '../../../components/billing/ItemsPanel';
import { SettingsPanel } from '../../../components/billing/SettingsPanel';
import { StockPanel } from '../../../components/billing/StockPanel';
import { type Customer, inputCls, type Item, Notice, type Series } from '../../../components/billing/shared';

interface Registration {
  gstin: string;
  name: string;
  einvoiceApplicable: boolean;
  sellerReady: boolean;
}

const TABS = [
  ['new', 'New invoice or note'],
  ['documents', 'Invoices and notes'],
  ['items', 'Items'],
  ['customers', 'Customers'],
  ['stock', 'Stock register'],
  ['gstr1', 'GSTR-1'],
  ['settings', 'Settings'],
] as const;
type Tab = (typeof TABS)[number][0];

/** Billing for a client's GSTIN: invoices with e-invoice and e-way bill JSON, stock, and GSTR-1 from the invoices. */
export default function BillingPage() {
  const { authFetch } = useAuth();
  const [regs, setRegs] = useState<Registration[]>([]);
  const [gstin, setGstin] = useState('');
  const [tab, setTab] = useState<Tab>('documents');
  const [items, setItems] = useState<Item[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRegs = useCallback(async () => {
    const r = await authFetch('/api/v1/billing/registrations');
    if (!r.ok) return setError('Could not load the clients’ GSTINs.');
    const list: Registration[] = (await r.json()).registrations;
    setRegs(list);
    setGstin((g) => g || list[0]?.gstin || '');
  }, [authFetch]);
  useEffect(() => {
    void loadRegs();
  }, [loadRegs]);

  const loadMasters = useCallback(async () => {
    if (!gstin) return;
    const [i, c, s] = await Promise.all([
      authFetch(`/api/v1/billing/items?gstin=${gstin}`),
      authFetch(`/api/v1/billing/customers?gstin=${gstin}`),
      authFetch(`/api/v1/billing/series?gstin=${gstin}`),
    ]);
    if (i.ok) setItems((await i.json()).items);
    if (c.ok) setCustomers((await c.json()).customers);
    if (s.ok) setSeries((await s.json()).series);
  }, [authFetch, gstin]);
  useEffect(() => {
    setOpenId(null);
    void loadMasters();
  }, [loadMasters]);

  const reg = regs.find((r) => r.gstin === gstin);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-pos-ink">Billing</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-pos-ink/60">
          Tax invoices, credit notes and debit notes for a client&apos;s GSTIN, with the particulars of rule 46, the e-invoice JSON for the IRP and the e-way bill JSON for the e-way bill portal. Stock moves with purchases and sales, and GSTR-1 is built from the invoices.
        </p>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-[12px] font-medium text-pos-ink/70">
          Client GSTIN
          <select value={gstin} onChange={(e) => setGstin(e.target.value)} className={`${inputCls} mt-1 w-full sm:min-w-[320px] max-w-md`}>
            {regs.map((r) => <option key={r.gstin} value={r.gstin}>{r.name} ({r.gstin})</option>)}
          </select>
        </label>
        {reg && <span className="pb-2 text-[12px] text-pos-ink/70">E-invoicing {reg.einvoiceApplicable ? 'applies' : 'not marked as applicable'} in Client Master.</span>}
      </div>
      {!regs.length && !error && <Notice tone="info">No regular GSTINs are visible to you. Add the client&apos;s GSTIN in Client Master first.</Notice>}
      {reg && !reg.sellerReady && <Notice tone="info">Enter the client&apos;s address under Settings and add a number series before raising invoices.</Notice>}

      {gstin && (
        <>
          <div role="tablist" className="flex flex-wrap gap-1 border-b border-pos-line">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                type="button"
                onClick={() => setTab(k)}
                className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${tab === k ? 'border-pos-accent text-pos-ink' : 'border-transparent text-pos-ink/60 hover:text-pos-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'new' && (
            <InvoiceEntry
              gstin={gstin}
              items={items}
              customers={customers}
              series={series}
              onSaved={(id) => {
                setOpenId(id);
                setTab('documents');
                void loadMasters();
              }}
            />
          )}
          {tab === 'documents' && <DocumentsPanel gstin={gstin} openId={openId} onChanged={loadMasters} />}
          {tab === 'items' && <ItemsPanel gstin={gstin} items={items} reload={loadMasters} />}
          {tab === 'customers' && <CustomersPanel gstin={gstin} customers={customers} reload={loadMasters} />}
          {tab === 'stock' && <StockPanel gstin={gstin} items={items} />}
          {tab === 'gstr1' && <Gstr1Panel gstin={gstin} />}
          {tab === 'settings' && (
            <SettingsPanel
              gstin={gstin}
              onChanged={() => {
                void loadRegs();
                void loadMasters();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
