import Decimal from 'decimal.js';

/**
 * Lower or nil deduction certificates (section 395(1); section 197 before). A row marked with
 * reason flag A must point to a certificate the payee holds, for that section, dated within the
 * certificate's validity, at no less than its rate, and within its amount once earlier payments
 * under it are counted. Past the limit, the normal rate applies again.
 */

export interface Certificate {
  id: string;
  certificateNo: string;
  pan: string;
  sectionCode: string;
  ratePercent: string;
  amountLimit: string;
  validFrom: string;
  validTo: string;
}

export interface CertifiedRow {
  id: string;
  pan: string;
  name: string;
  sectionCode: string;
  paidOn: string;
  amountPaid: string;
  taxDeducted: string;
  reasonCode?: string | null;
  certificateNo?: string | null;
}

export interface CertificateFinding {
  rowId: string;
  name: string;
  pan: string;
  certificateNo: string;
  message: string;
}

export interface CertificateUse {
  certificateId: string;
  certificateNo: string;
  used: string;
  remaining: string;
  rows: number;
}

export function checkCertificates(rows: CertifiedRow[], certs: Certificate[]): { findings: CertificateFinding[]; usage: CertificateUse[] } {
  const findings: CertificateFinding[] = [];
  const used = new Map<string, Decimal>();
  const count = new Map<string, number>();
  const flagged = rows.filter((r) => (r.reasonCode ?? '').toUpperCase() === 'A').sort((a, b) => a.paidOn.localeCompare(b.paidOn));
  for (const r of flagged) {
    const no = (r.certificateNo ?? '').toUpperCase();
    const base = { rowId: r.id, name: r.name, pan: r.pan, certificateNo: no };
    const cert = certs.find((c) => c.certificateNo.toUpperCase() === no);
    if (!cert) {
      findings.push({ ...base, message: no ? `Certificate ${no} is not in the register.` : 'Flag A without a certificate number.' });
      continue;
    }
    if (cert.pan.toUpperCase() !== r.pan.toUpperCase()) findings.push({ ...base, message: `Certificate ${no} was issued to another PAN.` });
    if (cert.sectionCode !== r.sectionCode) findings.push({ ...base, message: `Certificate ${no} covers code ${cert.sectionCode}, not ${r.sectionCode}.` });
    if (r.paidOn < cert.validFrom || r.paidOn > cert.validTo) findings.push({ ...base, message: `Paid on ${r.paidOn}, outside the certificate’s validity (${cert.validFrom} to ${cert.validTo}).` });
    const paid = new Decimal(r.amountPaid || 0);
    const before = used.get(cert.id) ?? new Decimal(0);
    const after = before.add(paid);
    used.set(cert.id, after);
    count.set(cert.id, (count.get(cert.id) ?? 0) + 1);
    if (after.gt(cert.amountLimit)) {
      const over = Decimal.min(paid, after.sub(cert.amountLimit));
      findings.push({ ...base, message: `Rs ${over.toFixed(0)} of this payment is beyond the certificate’s limit of Rs ${new Decimal(cert.amountLimit).toFixed(0)}; the normal rate applies to it.` });
    }
    const minTax = paid.mul(cert.ratePercent).div(100);
    if (new Decimal(r.taxDeducted || 0).lt(minTax.sub(1))) findings.push({ ...base, message: `Deducted below the certificate rate of ${new Decimal(cert.ratePercent).toFixed(2)}%.` });
  }
  const usage = certs.map((c) => {
    const u = used.get(c.id) ?? new Decimal(0);
    return { certificateId: c.id, certificateNo: c.certificateNo, used: u.toFixed(2), remaining: Decimal.max(0, new Decimal(c.amountLimit).sub(u)).toFixed(2), rows: count.get(c.id) ?? 0 };
  });
  return { findings, usage };
}
