import { Decimal } from 'decimal.js';
import { validateGstin, validateInvoiceNumberRule46 } from '@synextax/tax-engine';

export interface TallyParsedInvoice {
  rawVoucherNumber: string;
  sanitizedInvoiceNum: string;
  invoiceDate: string; // YYYY-MM-DD
  voucherType: 'Sales' | 'Purchase' | 'Credit Note' | 'Debit Note' | 'Other';
  partyName: string;
  partyGstin?: string;
  posStateCode: string;
  taxableValue: string;
  igstAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  cessAmount: string;
  totalAmount: string;
  isRule46Valid: boolean;
  isGstinValid: boolean;
  warnings: string[];
}

/**
 * Generates an incremental TDL XML request envelope for Tally HTTP listener (Port 9000).
 * Uses timestamped incremental polling to avoid full database exports during peak hours.
 */
export function buildTallyVoucherExportXml(
  companyName: string,
  fromDate: string, // YYYYMMDD
  toDate: string,   // YYYYMMDD
  voucherType: 'Sales' | 'Purchase' = 'Sales'
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Voucher Register</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>
          <SVFROMDATE>${fromDate}</SVFROMDATE>
          <SVTODATE>${toDate}</SVTODATE>
          <VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/**
 * Pure deterministic parser for Tally XML response vouchers.
 * Handles TDL structure variations across Tally.ERP 9 and TallyPrime 4.x/5.x.
 */
export function parseTallyXmlVouchers(xmlString: string): TallyParsedInvoice[] {
  if (!xmlString || typeof xmlString !== 'string') return [];

  const results: TallyParsedInvoice[] = [];

  // Match all <VOUCHER ...> ... </VOUCHER> blocks
  const voucherRegex = /<VOUCHER[^>]*>([\s\S]*?)<\/VOUCHER>/gi;
  let match: RegExpExecArray | null;

  while ((match = voucherRegex.exec(xmlString)) !== null) {
    const voucherBlock = match[1];

    // Helper for single tag extraction
    const extractTag = (tag: string): string => {
      const r = new RegExp(`<${tag}[^>]*>([^<]*?)<\\/${tag}>`, 'i');
      const m = r.exec(voucherBlock);
      return m ? m[1].trim() : '';
    };

    const voucherNumber = extractTag('VOUCHERNUMBER');
    const dateRaw = extractTag('DATE'); // Tally format: YYYYMMDD
    const voucherTypeRaw = extractTag('VOUCHERTYPENAME');
    const partyName = extractTag('PARTYNAME') || extractTag('PARTYLEDGERNAME');
    const partyGstin = extractTag('PARTYGSTIN') || extractTag('GSTIN');
    const statename = extractTag('STATENAME');

    if (!voucherNumber && !dateRaw) continue;

    // Convert date YYYYMMDD -> YYYY-MM-DD
    let invoiceDate = dateRaw;
    if (dateRaw.length === 8) {
      invoiceDate = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
    }

    let voucherType: TallyParsedInvoice['voucherType'] = 'Other';
    if (/sales/i.test(voucherTypeRaw)) voucherType = 'Sales';
    else if (/purchase/i.test(voucherTypeRaw)) voucherType = 'Purchase';
    else if (/credit/i.test(voucherTypeRaw)) voucherType = 'Credit Note';
    else if (/debit/i.test(voucherTypeRaw)) voucherType = 'Debit Note';

    // Parse ledger entries to separate taxable items and tax ledger lines
    let taxableDec = new Decimal(0);
    let igstDec = new Decimal(0);
    let cgstDec = new Decimal(0);
    let sgstDec = new Decimal(0);
    let cessDec = new Decimal(0);

    const ledgerListRegex = /<ALLLEDGERENTRIES\.LIST>([\s\S]*?)<\/ALLLEDGERENTRIES\.LIST>/gi;
    let ledgerMatch: RegExpExecArray | null;

    while ((ledgerMatch = ledgerListRegex.exec(voucherBlock)) !== null) {
      const ledgerBlock = ledgerMatch[1];
      const ledgerName = (/<LEDGERNAME>([^<]*?)<\/LEDGERNAME>/i.exec(ledgerBlock)?.[1] || '').trim().toUpperCase();
      const rawAmt = (/<AMOUNT>([^<]*?)<\/AMOUNT>/i.exec(ledgerBlock)?.[1] || '0').trim();

      // In Tally XML, debit is positive/negative depending on voucher context; take abs
      const amt = new Decimal(rawAmt || 0).abs();

      if (ledgerName.includes('OUTPUT IGST') || ledgerName.includes('INPUT IGST') || ledgerName.endsWith('IGST')) {
        igstDec = igstDec.plus(amt);
      } else if (ledgerName.includes('OUTPUT CGST') || ledgerName.includes('INPUT CGST') || ledgerName.endsWith('CGST')) {
        cgstDec = cgstDec.plus(amt);
      } else if (ledgerName.includes('OUTPUT SGST') || ledgerName.includes('INPUT SGST') || ledgerName.endsWith('SGST')) {
        sgstDec = sgstDec.plus(amt);
      } else if (ledgerName.includes('CESS')) {
        cessDec = cessDec.plus(amt);
      } else if (!ledgerName.includes(partyName.toUpperCase())) {
        // Sales/Purchase revenue or expense ledger -> represents taxable value
        taxableDec = taxableDec.plus(amt);
      }
    }

    // Default POS state code from party GSTIN if available, or Punjab '03' default
    let posStateCode = '03';
    if (partyGstin && partyGstin.length >= 2) {
      posStateCode = partyGstin.slice(0, 2);
    }

    const totalDec = taxableDec.plus(igstDec).plus(cgstDec).plus(sgstDec).plus(cessDec);

    // Statutory validations
    const warnings: string[] = [];
    const rule46 = validateInvoiceNumberRule46(voucherNumber);
    if (!rule46.isValid) {
      warnings.push(`Rule 46(b) Notice: ${rule46.error}`);
    }

    let isGstinValid = true;
    if (partyGstin) {
      const gstinVal = validateGstin(partyGstin);
      isGstinValid = gstinVal.isValid;
      if (!gstinVal.isValid) {
        warnings.push(`GSTIN Validation: ${gstinVal.error}`);
      }
    }

    results.push({
      rawVoucherNumber: voucherNumber,
      sanitizedInvoiceNum: rule46.sanitizedInvoiceNumber || voucherNumber,
      invoiceDate,
      voucherType,
      partyName,
      partyGstin: partyGstin || undefined,
      posStateCode,
      taxableValue: taxableDec.toFixed(2),
      igstAmount: igstDec.toFixed(2),
      cgstAmount: cgstDec.toFixed(2),
      sgstAmount: sgstDec.toFixed(2),
      cessAmount: cessDec.toFixed(2),
      totalAmount: totalDec.toFixed(2),
      isRule46Valid: rule46.isValid,
      isGstinValid,
      warnings,
    });
  }

  return results;
}

/**
 * Concurrency guard for local Tally HTTP queries.
 * Prevents port 9000 thread exhaustion by serializing queries through an async mutex.
 */
export class TallyConnectionGuard {
  private static instance: TallyConnectionGuard;
  private queue: Array<() => Promise<any>> = [];
  private isProcessing = false;

  public static getInstance(): TallyConnectionGuard {
    if (!TallyConnectionGuard.instance) {
      TallyConnectionGuard.instance = new TallyConnectionGuard();
    }
    return TallyConnectionGuard.instance;
  }

  public async schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await task();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        try {
          await nextTask();
        } catch (e) {
          // Individual task error handled by task promise
        }
      }
    }

    this.isProcessing = false;
  }
}
