'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Building,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Receipt,
  Percent,
  Usb,
  Edit2,
  MoreVertical,
} from 'lucide-react';
import { maskPan } from '@synextax/tax-engine';
import { useAuth } from '../../../context/AuthContext';

interface ClientItem {
  id: string;
  groupName: string;
  entityName: string;
  pan: string;
  constitution: string;
  primaryContact: string;
  contactMobile: string;
  gstin?: string;
  tan?: string;
  accountingSoftware: string;
  status: 'ACTIVE' | 'WARNING' | 'RECONCILED';
  statusLabel: string;
}

const CLIENTS_LIST: ClientItem[] = [
  {
    id: 'cl-1',
    groupName: 'Amritsar Textiles Conglomerate',
    entityName: 'Amritsar Silk Mills & Weaving Pvt Ltd',
    pan: 'AAACA1294F',
    constitution: 'Private Limited Company',
    primaryContact: 'Harpreet Singh (Director)',
    contactMobile: '98140 12345',
    gstin: '03AAACA1294F1Z3',
    tan: 'PTLA12345B',
    accountingSoftware: 'TallyPrime TDL',
    status: 'WARNING',
    statusLabel: 'IMS Warning: 1 Mismatch',
  },
  {
    id: 'cl-2',
    groupName: 'Majha Healthcare Group',
    entityName: 'Golden City Healthcare & Surgical Supplies',
    pan: 'ASRA01492B',
    constitution: 'Partnership Firm',
    primaryContact: 'Dr. Manjit Singh',
    contactMobile: '98720 54321',
    tan: 'ASRA01492B',
    accountingSoftware: 'Excel CSV Auto',
    status: 'RECONCILED',
    statusLabel: 'TY 2026-27 Form 140 Ready',
  },
  {
    id: 'cl-3',
    groupName: 'Punjab Heavy Engineering',
    entityName: 'Jalandhar Forgings Ltd',
    pan: 'ABBBB9999B',
    constitution: 'Public Limited',
    primaryContact: 'Rajesh Sharma',
    contactMobile: '98150 99887',
    gstin: '03BBBBB9999B1Z1',
    accountingSoftware: 'SAP S/4HANA',
    status: 'ACTIVE',
    statusLabel: 'GSTR-1 Filed',
  },
  {
    id: 'cl-4',
    groupName: 'Majha Agro Foods',
    entityName: 'Majha Agro Mills (HUF)',
    pan: 'CCCPM8891B',
    constitution: 'Hindu Undivided Family',
    primaryContact: 'Gurinder Gill',
    contactMobile: '98760 11223',
    gstin: '03CCCPM8891B1Z2',
    accountingSoftware: 'Busy Accounting',
    status: 'ACTIVE',
    statusLabel: 'Rule 86B Exempt',
  },
];

export default function ClientsMasterPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedClientId, setSelectedClientId] = useState<string>('cl-1');
  const [filterGroup, setFilterGroup] = useState<string>('ALL');

  const selectedClient = CLIENTS_LIST.find((c) => c.id === selectedClientId) || CLIENTS_LIST[0];

  const filteredClients = CLIENTS_LIST.filter((cl) => {
    if (filterGroup === 'TEXTILE' && !cl.groupName.includes('Textile')) return false;
    if (filterGroup === 'HEALTHCARE' && !cl.groupName.includes('Healthcare')) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        cl.entityName.toLowerCase().includes(q) ||
        cl.pan.toLowerCase().includes(q) ||
        (cl.gstin && cl.gstin.toLowerCase().includes(q)) ||
        cl.primaryContact.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto font-sans">
      
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#0E0F10] dark:text-white">
            Client Master Directory
          </h2>
          <p className="text-xs text-[#646A73] dark:text-[#9BA1AA]">
            Unified 4-tier practice hierarchy: Client Groups, Legal Entities, GSTINs, and TANs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/gst"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2F8AE0] hover:bg-[#1F73C4] text-white font-mono text-xs font-semibold transition-colors shadow-sm"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Open Invoices Register</span>
          </Link>

          <Link
            href="/clients/import"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white font-mono text-xs font-semibold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add or import clients</span>
          </Link>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-[#17191C] p-3 sm:p-4 rounded-2xl border border-[#E5E7EB] dark:border-[#24272B] shadow-sm">
        
        <div className="flex items-center gap-2 overflow-x-auto text-xs">
          {[
            { id: 'ALL', label: 'All Groups (4)' },
            { id: 'TEXTILE', label: 'Textiles Group' },
            { id: 'HEALTHCARE', label: 'Healthcare Group' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterGroup(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                filterGroup === tab.id
                  ? 'bg-[#2F8AE0] text-white shadow-sm'
                  : 'text-[#646A73] dark:text-[#9BA1AA] hover:bg-[#FAFAFB] dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 flex-1 max-w-sm justify-end">
          <div className="relative w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Entity name, PAN, GSTIN, or contact..."
              className="w-full bg-[#FAFAFB] dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] rounded-full pl-3.5 pr-8 py-1.5 text-xs font-sans text-[#0E0F10] dark:text-white focus:outline-none focus:border-[#2F8AE0]"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E5E7EB] dark:border-[#24272B] bg-white dark:bg-[#17191C] text-xs font-mono text-[#0E0F10] dark:text-white"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filter</span>
          </button>
        </div>

      </div>

      {/* Main 72% Table + 28% Floating Summary Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Client Table (8 cols) */}
        <div className="lg:col-span-8 bg-white dark:bg-[#17191C] rounded-2xl border border-[#E5E7EB] dark:border-[#24272B] overflow-hidden shadow-sm flex flex-col">
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              
              {/* Solid Obsidian Header */}
              <thead>
                <tr className="bg-[#141619] text-white text-[11px] tracking-wider">
                  <th className="py-3 px-4 rounded-tl-xl">Entity Name & Group</th>
                  <th className="py-3 px-3">PAN & Constitution</th>
                  <th className="py-3 px-3">Primary Contact</th>
                  <th className="py-3 px-3">Registration Codes</th>
                  <th className="py-3 px-4 text-center rounded-tr-xl">Compliance Radar</th>
                </tr>
              </thead>

              {/* Table Rows */}
              <tbody className="divide-y divide-[#E5E7EB] dark:divide-[#24272B]">
                {filteredClients.map((cl, idx) => {
                  const isSelected = cl.id === selectedClientId;
                  const zebraBg = idx % 2 === 0 ? 'bg-white dark:bg-[#17191C]' : 'bg-[#F9FAFB] dark:bg-[#121417]';
                  const rowBg = isSelected ? 'bg-[#ECF4FD] dark:bg-[#2F8AE0]/15' : zebraBg;

                  let statusPill = 'bg-[#DCFCE7] text-[#15803D]';
                  if (cl.status === 'WARNING') statusPill = 'bg-[#FEF3C7] text-[#B45309]';
                  if (cl.status === 'RECONCILED') statusPill = 'bg-[#ECF4FD] text-[#2F8AE0]';

                  return (
                    <tr
                      key={cl.id}
                      onClick={() => setSelectedClientId(cl.id)}
                      className={`cursor-pointer transition-colors h-14 ${rowBg} hover:bg-[#ECF4FD]/70`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-xs text-[#0E0F10] dark:text-white leading-tight">
                          {cl.entityName}
                        </div>
                        <div className="text-[10px] text-[#646A73] dark:text-[#9BA1AA] mt-0.5">
                          {cl.groupName}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className=" font-semibold text-[#0E0F10] dark:text-white">{maskPan(cl.pan)}</div>
                        <div className="text-[10px] text-[#646A73] dark:text-[#9BA1AA]">{cl.constitution}</div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="text-[#0E0F10] dark:text-white font-medium">{cl.primaryContact}</div>
                        <div className="text-[10px] text-[#646A73] dark:text-[#9BA1AA]">
                          {cl.contactMobile}
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono text-[11px]">
                        {cl.gstin && (
                          <div className="text-[#2F8AE0] font-semibold">GSTIN: {cl.gstin}</div>
                        )}
                        {cl.tan && (
                          <div className="text-[#13A83C] font-semibold">TAN: {cl.tan}</div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold ${statusPill}`}>
                          {cl.statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-white dark:bg-[#17191C] border-t border-[#E5E7EB] dark:border-[#24272B] text-xs text-[#646A73] dark:text-[#9BA1AA] flex justify-between items-center">
            <span>4 Client Entities registered under Verma & Associates CA</span>
            <span className="text-[#16A34A] font-semibold">DPDP Consent Artifacts Verified</span>
          </div>

        </div>

        {/* Right Floating Client Inspector (4 cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-[#17191C] rounded-2xl border border-[#E5E7EB] dark:border-[#24272B] shadow-sm overflow-hidden space-y-4">
          
          {/* Header Bar */}
          <div className="bg-[#2F8AE0] text-white p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold text-white/80 block">Selected client</span>
              <span className="text-sm font-semibold text-white">{selectedClient.entityName}</span>
            </div>
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white">
              <Building className="w-4 h-4" />
            </div>
          </div>

          <div className="p-4 space-y-4">
            
            {/* Quick Details Box */}
            <div className="p-3 rounded-xl bg-[#FAFAFB] dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] space-y-1.5 text-xs">
              <div className="flex justify-between text-[#646A73] dark:text-[#9BA1AA]">
                <span>Constitution:</span>
                <span className="text-[#0E0F10] dark:text-white font-semibold">{selectedClient.constitution}</span>
              </div>
              <div className="flex justify-between text-[#646A73] dark:text-[#9BA1AA]">
                <span>Permanent PAN:</span>
                <span className="text-[#0E0F10] dark:text-white font-semibold">{maskPan(selectedClient.pan)}</span>
              </div>
              <div className="flex justify-between text-[#646A73] dark:text-[#9BA1AA]">
                <span>Accounting Stack:</span>
                <span className="text-[#2F8AE0] font-semibold">{selectedClient.accountingSoftware}</span>
              </div>
              <div className="flex justify-between text-[#646A73] dark:text-[#9BA1AA]">
                <span>Filing Frequency:</span>
                <span className="text-[#16A34A] font-semibold">Monthly GSTR-1 & 3B</span>
              </div>
            </div>

            {/* Quick Action Navigation Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Link
                href="/gst"
                className="p-2.5 rounded-xl bg-[#FAFAFB] dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] hover:border-[#2F8AE0] transition-colors flex items-center justify-between"
              >
                <span>Sales Invoices</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#2F8AE0]" />
              </Link>

              <Link
                href="/gst/recon-2b"
                className="p-2.5 rounded-xl bg-[#FAFAFB] dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] hover:border-[#2F8AE0] transition-colors flex items-center justify-between"
              >
                <span>2B Recon & IMS</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#2F8AE0]" />
              </Link>

              <Link
                href="/tds"
                className="p-2.5 rounded-xl bg-[#FAFAFB] dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] hover:border-[#2F8AE0] transition-colors flex items-center justify-between"
              >
                <span>Dual-Act TDS</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#2F8AE0]" />
              </Link>

              <Link
                href="/audit"
                className="p-2.5 rounded-xl bg-[#FAFAFB] dark:bg-[#0E0F10] border border-[#E5E7EB] dark:border-[#24272B] hover:border-[#2F8AE0] transition-colors flex items-center justify-between"
              >
                <span>MCA Rule 3 Log</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#2F8AE0]" />
              </Link>
            </div>

            {/* Bottom Actions */}
            <div className="pt-2">
              <Link
                href="/gst"
                className="w-full py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-mono font-semibold transition-colors shadow-md flex items-center justify-center gap-2"
              >
                <span>Open Active GSTR-3B Workspace</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
