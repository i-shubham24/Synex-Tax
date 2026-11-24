import { dmy, stateName } from './shared';

/* Printable tax invoice, credit note or debit note carrying the particulars of rule 46 of the CGST
   Rules (credit and debit notes: rule 53(1A)): supplier name, address and GSTIN; serial number and
   date; recipient name, address and GSTIN, or state for an unregistered recipient; HSN, description,
   quantity and unit; value, discount and taxable value; rate and amount of each tax; place of supply
   with the state name; whether tax is payable on reverse charge; and the supplier's signature. */

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const money = (v: string | number) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TITLE: Record<string, string> = { INV: 'Tax invoice', CRN: 'Credit note', DBN: 'Debit note' };

export interface PrintableDoc {
  docType: string;
  docNo: string;
  docDate: string;
  buyer: { legalName: string; tradeName?: string | null; gstin: string | null; stateCode: string; address1: string; address2?: string | null; place: string; pincode?: string | null };
  placeOfSupply: string;
  reverseCharge: boolean;
  interState: boolean;
  originalDocNo: string | null;
  originalDocDate: string | null;
  notes: string | null;
  status: string;
  irn: string | null;
  ackNo: string | null;
  ackDate: string | null;
  ewbNo: string | null;
  lines: Array<{ lineNo: number; description: string; hsn: string; isService: boolean; unit: string; quantity: string; unitPrice: string; gross: string; discount: string; taxable: string; gstRate: number; igst: string; cgst: string; sgst: string; cess: string; total: string }>;
  totals: { taxable: string; igst: string; cgst: string; sgst: string; cess: string; tax: string; roundOff: string; invoiceValue: string; amountPayable: string };
}

export interface PrintableSeller {
  gstin: string;
  legalName: string;
  tradeName?: string | null;
  address1: string;
  address2?: string | null;
  place: string;
  pincode: string;
  phone?: string | null;
  email?: string | null;
  bankDetails?: string | null;
  terms?: string | null;
}

export function invoiceHtml(d: PrintableDoc, s: PrintableSeller): string {
  const taxCols = d.interState ? ['IGST'] : ['CGST', 'SGST or UTGST'];
  const hasCess = Number(d.totals.cess) !== 0;
  const rows = d.lines
    .map((l) => {
      const tax = d.interState
        ? `<td class="n">${l.gstRate}%</td><td class="n">${money(l.igst)}</td>`
        : `<td class="n">${l.gstRate / 2}%</td><td class="n">${money(l.cgst)}</td><td class="n">${l.gstRate / 2}%</td><td class="n">${money(l.sgst)}</td>`;
      return `<tr><td>${l.lineNo}</td><td>${esc(l.description)}</td><td class="m">${esc(l.hsn)}</td><td class="n">${esc(Number(l.quantity))} ${l.isService ? '' : esc(l.unit)}</td><td class="n">${money(l.unitPrice)}</td><td class="n">${money(l.gross)}</td><td class="n">${money(l.discount)}</td><td class="n">${money(l.taxable)}</td>${tax}${hasCess ? `<td class="n">${money(l.cess)}</td>` : ''}<td class="n">${money(l.total)}</td></tr>`;
    })
    .join('');
  const taxHead = d.interState ? '<th>IGST rate</th><th>IGST</th>' : '<th>CGST rate</th><th>CGST</th><th>SGST rate</th><th>SGST or UTGST</th>';
  const addr = (a: string, b: string | null | undefined, place: string, pin: string | null | undefined) => [a, b, `${place}${pin ? ` ${pin}` : ''}`].filter(Boolean).map(esc).join('<br>');
  const totalLine = (label: string, v: string) => `<tr><td>${label}</td><td class="n">${money(v)}</td></tr>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(TITLE[d.docType])} ${esc(d.docNo)}</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:24px;font-size:12px}
h1{font-size:18px;font-weight:600;margin:0}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.box{border:1px solid #999;padding:8px;border-radius:4px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #999;padding:4px 6px;vertical-align:top}
th{background:#f2f2f2;font-weight:600;text-align:left}
.n{text-align:right;font-family:ui-monospace,Consolas,monospace;white-space:nowrap}
.m{font-family:ui-monospace,Consolas,monospace}
.totals{width:320px;margin-left:auto;margin-top:8px}
.muted{color:#444}
.cancel{color:#b91c1c;font-weight:600;font-size:14px}
.sign{margin-top:40px;text-align:right}
@media print{body{margin:10mm}.noprint{display:none}}
</style></head><body>
<div class="top"><div><h1>${esc(TITLE[d.docType])}</h1><div class="muted">Original for recipient</div>${d.status === 'CANCELLED' ? '<div class="cancel">Cancelled</div>' : ''}</div>
<div class="box"><div><b>No.</b> <span class="m">${esc(d.docNo)}</span></div><div><b>Date</b> ${esc(dmy(d.docDate))}</div>
${d.originalDocNo ? `<div><b>Against invoice</b> <span class="m">${esc(d.originalDocNo)}</span> dated ${esc(dmy(d.originalDocDate))}</div>` : ''}</div></div>
<div class="grid">
<div class="box"><b>Supplier</b><br>${esc(s.legalName)}${s.tradeName && s.tradeName !== s.legalName ? `<br>${esc(s.tradeName)}` : ''}<br>${addr(s.address1, s.address2, s.place, s.pincode)}<br>State: ${esc(stateName(s.gstin.slice(0, 2)))} (${esc(s.gstin.slice(0, 2))})<br>GSTIN: <span class="m">${esc(s.gstin)}</span>${s.phone ? `<br>Phone: ${esc(s.phone)}` : ''}${s.email ? `<br>Email: ${esc(s.email)}` : ''}</div>
<div class="box"><b>Recipient</b><br>${esc(d.buyer.legalName)}${d.buyer.tradeName ? `<br>${esc(d.buyer.tradeName)}` : ''}<br>${addr(d.buyer.address1, d.buyer.address2, d.buyer.place, d.buyer.pincode)}<br>State: ${esc(stateName(d.buyer.stateCode))} (${esc(d.buyer.stateCode)})<br>GSTIN: ${d.buyer.gstin ? `<span class="m">${esc(d.buyer.gstin)}</span>` : 'Unregistered'}</div>
</div>
<p>Place of supply: ${esc(stateName(d.placeOfSupply))} (${esc(d.placeOfSupply)}). Tax payable on reverse charge: ${d.reverseCharge ? 'Yes' : 'No'}.</p>
${d.irn ? `<p>IRN: <span class="m">${esc(d.irn)}</span><br>Ack no. <span class="m">${esc(d.ackNo)}</span>${d.ackDate ? ` dated ${esc(new Date(d.ackDate).toLocaleString('en-IN'))}` : ''}</p>` : ''}
${d.ewbNo ? `<p>E-way bill no. <span class="m">${esc(d.ewbNo)}</span></p>` : ''}
<table><thead><tr><th>#</th><th>Description</th><th>HSN or SAC</th><th>Quantity</th><th>Rate</th><th>Value</th><th>Discount</th><th>Taxable value</th>${taxHead}${hasCess ? '<th>Cess</th>' : ''}<th>Total</th></tr></thead><tbody>${rows}</tbody></table>
<table class="totals"><tbody>
${totalLine('Taxable value', d.totals.taxable)}
${d.interState ? totalLine('IGST', d.totals.igst) : totalLine('CGST', d.totals.cgst) + totalLine('SGST or UTGST', d.totals.sgst)}
${hasCess ? totalLine('Cess', d.totals.cess) : ''}
${Number(d.totals.roundOff) !== 0 ? totalLine('Round off', d.totals.roundOff) : ''}
${totalLine(`<b>${d.reverseCharge ? 'Amount payable (tax to be paid by the recipient)' : 'Invoice value'}</b>`, d.totals.amountPayable)}
</tbody></table>
<p class="muted">Tax columns: ${taxCols.join(', ')}.${d.reverseCharge ? ` Tax of ${money(d.totals.tax)} is payable by the recipient on reverse charge.` : ''}</p>
${d.notes ? `<p>${esc(d.notes)}</p>` : ''}
${s.bankDetails ? `<p><b>Bank details</b>: ${esc(s.bankDetails)}</p>` : ''}
${s.terms ? `<p><b>Terms</b>: ${esc(s.terms)}</p>` : ''}
<div class="sign">For ${esc(s.legalName)}<br><br><br>Authorised signatory</div>
</body></html>`;
}

/** Opens the document in a new window and starts printing (the page's script policy blocks inline handlers, so print is called from here). */
export function printDocument(html: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.opener = null;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
  return true;
}
