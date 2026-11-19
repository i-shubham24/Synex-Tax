'use client';

import React, { useState } from 'react';
import {
  Building2,
  Users,
  FileText,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shield,
  X,
  CreditCard,
  Building,
  KeyRound,
} from 'lucide-react';
import { validateGstin, validatePan } from '@synextax/tax-engine';

interface Entity {
  id: string;
  pan: string;
  legalName: string;
  tradeName?: string;
  constitution: string;
  msmeUdyamNumber?: string;
  accountingSoftware: string;
  gstins: Array<{
    gstin: string;
    stateCode: string;
    stateName: string;
    filingFrequency: string;
    status: string;
  }>;
  tans: Array<{
    tan: string;
    deductorType: string;
    status: string;
  }>;
}

interface ClientGroup {
  id: string;
  name: string;
  contactName: string;
  mobile: string;
  entities: Entity[];
}

export function ClientMasterBrowser() {
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number>(0);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('ent-1');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Form states for live validation modal
  const [formPan, setFormPan] = useState<string>('');
  const [formLegalName, setFormLegalName] = useState<string>('');
  const [formGstin, setFormGstin] = useState<string>('');

  // Sample seed data representing active Amritsar CA firm client base
  const [groups, setGroups] = useState<ClientGroup[]>([
    {
      id: 'grp-1',
      name: 'Amritsar Textiles Group',
      contactName: 'Harpreet Singh',
      mobile: '98140-12345',
      entities: [
        {
          id: 'ent-1',
          pan: 'AABCA1234F',
          legalName: 'Amritsar Textiles Private Limited',
          tradeName: 'Golden Thread Fabrics',
          constitution: 'PRIVATE_LIMITED',
          msmeUdyamNumber: 'UDYAM-PB-02-0012345',
          accountingSoftware: 'TALLY_PRIME',
          gstins: [
            {
              gstin: '03AABCA1234F1Z5',
              stateCode: '03',
              stateName: 'Punjab (Amritsar)',
              filingFrequency: 'MONTHLY',
              status: 'ACTIVE_SESSION',
            },
            {
              gstin: '07AABCA1234F1Z3',
              stateCode: '07',
              stateName: 'Delhi (Depot)',
              filingFrequency: 'MONTHLY',
              status: 'ACTIVE_SESSION',
            },
          ],
          tans: [
            {
              tan: 'PTLA12345B',
              deductorType: 'COMPANY',
              status: 'VALID',
            },
          ],
        },
        {
          id: 'ent-2',
          pan: 'AABCG5678F',
          legalName: 'Golden Spindles LLP',
          tradeName: 'Golden Yarn Export',
          constitution: 'LLP',
          accountingSoftware: 'TALLY_PRIME',
          gstins: [
            {
              gstin: '03AABCG5678F1Z8',
              stateCode: '03',
              stateName: 'Punjab (Ludhiana)',
              filingFrequency: 'MONTHLY',
              status: 'ACTIVE_SESSION',
            },
          ],
          tans: [],
        },
      ],
    },
    {
      id: 'grp-2',
      name: 'Majha Agro Foods',
      contactName: 'Gurinder Gill',
      mobile: '98720-54321',
      entities: [
        {
          id: 'ent-3',
          pan: 'ABCPA5678F',
          legalName: 'Gurinder Gill (HUF)',
          tradeName: 'Majha Agro Mills',
          constitution: 'HUF',
          msmeUdyamNumber: 'UDYAM-PB-02-0098765',
          accountingSoftware: 'BUSY',
          gstins: [
            {
              gstin: '03ABCPA5678F1Z9',
              stateCode: '03',
              stateName: 'Punjab (Tarn Taran)',
              filingFrequency: 'QRMP',
              status: 'ACTIVE_SESSION',
            },
          ],
          tans: [],
        },
      ],
    },
  ]);

  const currentGroup = groups[selectedGroupIndex] || groups[0];
  const currentEntity = currentGroup.entities.find((e) => e.id === selectedEntityId) || currentGroup.entities[0];

  // Dynamic real-time statutory validations
  const panValidation = formPan ? validatePan(formPan) : null;
  const gstinValidation = formGstin ? validateGstin(formGstin) : null;

  const handleAddEntity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!panValidation?.isValid) return;

    const newEntity: Entity = {
      id: `ent-${Date.now()}`,
      pan: formPan.toUpperCase(),
      legalName: formLegalName,
      constitution: panValidation.constitution || 'PRIVATE_LIMITED',
      accountingSoftware: 'TALLY_PRIME',
      gstins: gstinValidation?.isValid
        ? [
            {
              gstin: formGstin.toUpperCase(),
              stateCode: gstinValidation.stateCode || '03',
              stateName: gstinValidation.stateName || 'Punjab',
              filingFrequency: 'MONTHLY',
              status: 'ACTIVE_SESSION',
            },
          ]
        : [],
      tans: [],
    };

    const updatedGroups = [...groups];
    updatedGroups[selectedGroupIndex].entities.push(newEntity);
    setGroups(updatedGroups);
    setSelectedEntityId(newEntity.id);
    setIsModalOpen(false);
    setFormPan('');
    setFormLegalName('');
    setFormGstin('');
  };

  return (
    <div id="client-master" className="py-12 bg-slate-950 text-slate-100 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Top Control Header: POS Style */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Unified Client Master</h2>
              <p className="text-xs text-slate-400">Firm: Verma & Associates CA (Amritsar)</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search Client Group or PAN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Onboard Entity</span>
            </button>
          </div>
        </div>

        {/* 3-Column POS-Style High Information Density Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Column 1: Client Groups List (3 cols) */}
          <div className="lg:col-span-3 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Client Groups</span>
              <span className="text-[11px] font-mono text-emerald-400">{groups.length} Groups</span>
            </div>

            <div className="space-y-2">
              {groups.map((grp, idx) => (
                <button
                  key={grp.id}
                  onClick={() => {
                    setSelectedGroupIndex(idx);
                    if (grp.entities.length > 0) {
                      setSelectedEntityId(grp.entities[0].id);
                    }
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                    idx === selectedGroupIndex
                      ? 'bg-slate-900 border-emerald-500/50 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white truncate">{grp.name}</h4>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      {grp.entities.length} PANs
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 truncate">{grp.contactName} ({grp.mobile})</p>
                </button>
              ))}
            </div>
          </div>

          {/* Column 2: Legal Entities (PAN level) (4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Legal Entities</span>
              <span className="text-[11px] font-mono text-emerald-400">{currentGroup.entities.length} Entities</span>
            </div>

            <div className="space-y-2.5">
              {currentGroup.entities.map((entity) => (
                <div
                  key={entity.id}
                  onClick={() => setSelectedEntityId(entity.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    entity.id === currentEntity?.id
                      ? 'bg-slate-900 border-emerald-500/50 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-950/60 border-slate-800 hover:bg-slate-900/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white leading-snug">{entity.legalName}</h4>
                      {entity.tradeName && (
                        <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{entity.tradeName}</p>
                      )}
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-400 shrink-0">
                      {entity.pan}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-800/60 text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-medium">
                      {entity.constitution}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400 text-[10px] font-mono">{entity.gstins.length} GSTINs</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400 text-[10px] font-mono">{entity.tans.length} TANs</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 3: Registrations & Statutory Workstation (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {currentEntity ? (
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
                
                {/* Active Entity Header */}
                <div className="border-b border-slate-800 pb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wide">Selected PAN Details</span>
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-emerald-950 border border-emerald-500/30 text-emerald-300">
                      {currentEntity.pan}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-2">{currentEntity.legalName}</h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    <span>Constitution: {currentEntity.constitution}</span>
                    <span>•</span>
                    <span>Accounting: {currentEntity.accountingSoftware}</span>
                  </div>
                </div>

                {/* GST Registrations List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Active GSTIN Registrations</span>
                    </span>
                    <span className="text-[11px] text-slate-500">Period: 2026-11</span>
                  </div>

                  {currentEntity.gstins.map((gst) => (
                    <div
                      key={gst.gstin}
                      className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-white">{gst.gstin}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                            {gst.stateName}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">Filing Frequency: {gst.filingFrequency}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => alert(`Launching GSTR-1 / 3B Workstation for ${gst.gstin}`)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold transition-all"
                        >
                          Workstation
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* TAN Registrations List */}
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                    <span>TDS/TCS TAN Registrations</span>
                  </span>

                  {currentEntity.tans.length > 0 ? (
                    currentEntity.tans.map((tan) => (
                      <div
                        key={tan.tan}
                        className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                      >
                        <div>
                          <span className="text-xs font-mono font-bold text-white">{tan.tan}</span>
                          <p className="text-[11px] text-slate-400 mt-0.5">Deductor: {tan.deductorType}</p>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-1 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                          TRACES {tan.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 italic p-3 bg-slate-950/40 rounded-lg border border-slate-800/60">
                      No TAN registered under this legal entity yet.
                    </p>
                  )}
                </div>

              </div>
            ) : (
              <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center text-slate-500 text-sm">
                Select an entity from the list to view registrations and launch workstations.
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Live Validation Onboarding Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative space-y-5">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-lg font-bold text-white">Onboard Legal Entity</h3>
              <p className="text-xs text-slate-400 mt-1">Real-time statutory validation powered by SynexTax tax engine</p>
            </div>

            <form onSubmit={handleAddEntity} className="space-y-4 text-xs">
              
              {/* PAN Input with Live Constitution Detection */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Permanent Account Number (PAN) *</label>
                <input
                  type="text"
                  maxLength={10}
                  placeholder="e.g. AABCA1234F"
                  value={formPan}
                  onChange={(e) => setFormPan(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500 uppercase"
                  required
                />

                {panValidation && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                    {panValidation.isValid ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-emerald-400">
                          Valid PAN (Constitution: <strong>{panValidation.constitution}</strong>)
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span className="text-rose-400">{panValidation.error}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Legal Name */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Legal Name of Entity *</label>
                <input
                  type="text"
                  placeholder="e.g. Punjab Solar Energy Systems Private Limited"
                  value={formLegalName}
                  onChange={(e) => setFormLegalName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              {/* GSTIN Input with Live Mod-36 Checksum Verification */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Primary GSTIN (Optional)</label>
                <input
                  type="text"
                  maxLength={15}
                  placeholder="e.g. 03AABCA1234F1Z5"
                  value={formGstin}
                  onChange={(e) => setFormGstin(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500 uppercase"
                />

                {gstinValidation && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                    {gstinValidation.isValid ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-emerald-400">
                          Valid Mod-36 Checksum (State: <strong>{gstinValidation.stateName}</strong>)
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span className="text-rose-400">{gstinValidation.error}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">Shortcut: [Enter] to save</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!panValidation?.isValid}
                    className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold transition-all shadow-md shadow-emerald-500/20"
                  >
                    Save Entity
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
