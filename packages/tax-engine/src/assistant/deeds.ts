/**
 * Deeds, agreements, letters and board resolutions from fixed templates. No model is used: the
 * fields fill the template as typed. Every output is a template for the CA to review and adapt;
 * stamp duty, registration and the facts of the case are for the CA and the parties to settle.
 */

export type DeedFieldType = 'text' | 'date' | 'number' | 'textarea';

export interface DeedField {
  key: string;
  label: string;
  type: DeedFieldType;
  required?: boolean;
  hint?: string;
}

export interface DeedTemplate {
  id: string;
  title: string;
  group: 'Partnership and LLP' | 'Property and employment' | 'Board resolutions';
  fields: DeedField[];
  render: (v: Record<string, string>) => string[];
}

export const DEED_REVIEW_NOTE = 'Template for review by the CA before use. It is not legal advice; adapt it to the facts, and check stamp duty and registration in the State where it is signed.';

const f = (key: string, label: string, type: DeedFieldType = 'text', required = true, hint?: string): DeedField => ({ key, label, type, required, hint });

const PARTNERS = f('partners', 'Partners, one per line: name, parent’s name, address, share %', 'textarea', true, 'Asha Rao, S. Rao, 12 MG Road Pune, 50');

export interface PartnerLine {
  name: string;
  parent: string;
  address: string;
  share: string;
}

export function parsePartners(text: string): PartnerLine[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(',').map((p) => p.trim());
      const share = parts.length > 3 ? parts[parts.length - 1].replace('%', '') : '';
      return { name: parts[0] ?? '', parent: parts[1] ?? '', address: parts.slice(2, parts.length > 3 ? -1 : undefined).join(', '), share };
    });
}

const partiesText = (v: Record<string, string>) =>
  parsePartners(v.partners).map((p, i) => `${i + 1}. ${p.name}${p.parent ? `, child of ${p.parent}` : ''}${p.address ? `, residing at ${p.address}` : ''} (hereinafter "Partner ${i + 1}")`);
const sharesText = (v: Record<string, string>) => parsePartners(v.partners).map((p) => `${p.name}: ${p.share || '__'}%`).join('; ');
const val = (v: Record<string, string>, k: string) => (v[k] ?? '').trim() || `[${k}]`;

export const DEED_TEMPLATES: readonly DeedTemplate[] = [
  {
    id: 'partnership-deed',
    title: 'Partnership deed',
    group: 'Partnership and LLP',
    fields: [f('firmName', 'Name of the firm'), f('business', 'Business of the firm'), f('place', 'Principal place of business'), f('date', 'Date of the deed', 'date'), f('commencement', 'Date the partnership starts', 'date'), PARTNERS, f('capital', 'Capital to be brought in (Rs)', 'number', false), f('interestOnCapital', 'Interest on capital (% a year, up to 12)', 'number', false), f('bank', 'Bank operation (who signs)', 'text', false), f('city', 'Place of signing')],
    render: (v) => [
      `This deed of partnership is made at ${val(v, 'city')} on ${val(v, 'date')} between:`,
      ...partiesText(v),
      `The partners have agreed to carry on business in partnership on the following terms.`,
      `1. Name and business. The business shall be carried on in the name and style of ${val(v, 'firmName')}, and shall be ${val(v, 'business')}, and any other business the partners agree upon.`,
      `2. Place of business. The principal place of business shall be ${val(v, 'place')}, or any other place the partners agree upon.`,
      `3. Commencement and duration. The partnership commences on ${val(v, 'commencement')} and shall be at will.`,
      `4. Capital. The capital shall be ${v.capital ? `Rs ${v.capital}` : 'as the partners contribute from time to time'}, brought in by the partners as they agree.`,
      `5. Profit and loss. Net profit or loss, after remuneration and interest to partners, shall be shared as follows: ${sharesText(v)}.`,
      `6. Interest on capital. Interest at ${v.interestOnCapital || '__'}% a year shall be allowed on capital, within the limit allowed under the Income-tax Act in force.`,
      `7. Remuneration. Working partners may be paid remuneration as the partners decide in writing, within the limits allowed under the Income-tax Act in force.`,
      `8. Bank accounts. Bank accounts shall be opened in the name of the firm and operated by ${v.bank || 'any partner'}.`,
      `9. Books of account. Proper books shall be kept at the principal place of business and closed on 31 March each year; every partner may inspect them.`,
      `10. Retirement and admission. A partner may retire by giving ___ months' written notice. A new partner may be admitted with the consent of all partners.`,
      `11. Death. The death or retirement of a partner shall not dissolve the firm; the remaining partners may continue the business and settle the account of the outgoing partner.`,
      `12. Disputes. Disputes between the partners shall be referred to arbitration under the Arbitration and Conciliation Act, 1996.`,
      `13. Other matters. Matters not provided for shall be governed by the Indian Partnership Act, 1932.`,
      `In witness whereof the partners have signed this deed on the date first written above.`,
      ...parsePartners(v.partners).map((p) => `Signature: ____________ (${p.name})`),
      `Witnesses: 1. ____________ 2. ____________`,
    ],
  },
  {
    id: 'llp-agreement',
    title: 'LLP agreement',
    group: 'Partnership and LLP',
    fields: [f('llpName', 'Name of the LLP'), f('llpin', 'LLPIN (if incorporated)', 'text', false), f('business', 'Business of the LLP'), f('office', 'Registered office'), f('date', 'Date of the agreement', 'date'), PARTNERS, f('designated', 'Designated partners (names)'), f('contribution', 'Total contribution (Rs)', 'number'), f('city', 'Place of signing')],
    render: (v) => [
      `This limited liability partnership agreement is made at ${val(v, 'city')} on ${val(v, 'date')} between:`,
      ...partiesText(v),
      `1. Name. The LLP is ${val(v, 'llpName')}${v.llpin ? ` (LLPIN ${v.llpin})` : ''}, under the Limited Liability Partnership Act, 2008.`,
      `2. Registered office. ${val(v, 'office')}, or any other place the partners decide and notify to the Registrar.`,
      `3. Business. ${val(v, 'business')}.`,
      `4. Contribution. The total contribution is Rs ${val(v, 'contribution')}, contributed in the proportion of profit sharing unless the partners agree otherwise.`,
      `5. Profit and loss. Shared as follows: ${sharesText(v)}.`,
      `6. Designated partners. ${val(v, 'designated')} shall be the designated partners, responsible for compliance under the Act, including filing the statement of account and solvency and the annual return.`,
      `7. Meetings and decisions. Decisions shall be taken by a majority of partners, except changes in the business, admission of a partner or changes to this agreement, which need the consent of all partners.`,
      `8. Admission, cessation and transfer. A person may be admitted as a partner with the consent of all partners. A partner may cease by giving ___ days' written notice.`,
      `9. Accounts and audit. Books shall be kept at the registered office and closed on 31 March each year, and audited where the Act requires.`,
      `10. Indemnity. The LLP shall indemnify each partner for payments and liabilities incurred in the ordinary and proper conduct of its business.`,
      `11. Disputes. Disputes shall be referred to arbitration under the Arbitration and Conciliation Act, 1996.`,
      `12. Filing. This agreement shall be filed with the Registrar in the form and time the Act requires.`,
      ...parsePartners(v.partners).map((p) => `Signature: ____________ (${p.name})`),
      `Witnesses: 1. ____________ 2. ____________`,
    ],
  },
  {
    id: 'retirement-deed',
    title: 'Deed of retirement of a partner',
    group: 'Partnership and LLP',
    fields: [f('firmName', 'Name of the firm'), f('originalDeedDate', 'Date of the existing deed', 'date'), f('retiring', 'Retiring partner (name, parent’s name, address)'), f('retirementDate', 'Retirement effective from', 'date'), PARTNERS, f('settlement', 'Amount settled with the retiring partner (Rs)', 'number'), f('date', 'Date of this deed', 'date'), f('city', 'Place of signing')],
    render: (v) => [
      `This deed of retirement is made at ${val(v, 'city')} on ${val(v, 'date')} in respect of ${val(v, 'firmName')}, constituted under the deed dated ${val(v, 'originalDeedDate')}.`,
      `Retiring partner: ${val(v, 'retiring')}.`,
      `Continuing partners:`,
      ...partiesText(v),
      `1. The retiring partner retires from the firm with effect from ${val(v, 'retirementDate')}.`,
      `2. The retiring partner's account, including capital, current account and share of goodwill, is settled at Rs ${val(v, 'settlement')}, which the continuing partners shall pay as agreed between them. On payment the retiring partner shall have no further claim on the firm.`,
      `3. The continuing partners shall carry on the business in the same name and shall share profit and loss as follows: ${sharesText(v)}.`,
      `4. The continuing partners shall be liable for the debts of the firm from the date of retirement and shall indemnify the retiring partner against them. Public notice of retirement shall be given.`,
      `5. All other terms of the existing deed continue.`,
      `Signature of the retiring partner: ____________`,
      ...parsePartners(v.partners).map((p) => `Signature: ____________ (${p.name})`),
      `Witnesses: 1. ____________ 2. ____________`,
    ],
  },
  {
    id: 'admission-deed',
    title: 'Deed of admission of a partner',
    group: 'Partnership and LLP',
    fields: [f('firmName', 'Name of the firm'), f('originalDeedDate', 'Date of the existing deed', 'date'), f('incoming', 'Incoming partner (name, parent’s name, address)'), f('admissionDate', 'Admission effective from', 'date'), f('capital', 'Capital brought in by the incoming partner (Rs)', 'number'), PARTNERS, f('date', 'Date of this deed', 'date'), f('city', 'Place of signing')],
    render: (v) => [
      `This deed of admission is made at ${val(v, 'city')} on ${val(v, 'date')} in respect of ${val(v, 'firmName')}, constituted under the deed dated ${val(v, 'originalDeedDate')}.`,
      `Incoming partner: ${val(v, 'incoming')}.`,
      `Partners after admission:`,
      ...partiesText(v),
      `1. The incoming partner is admitted as a partner with effect from ${val(v, 'admissionDate')}, with the consent of all existing partners.`,
      `2. The incoming partner shall bring in capital of Rs ${val(v, 'capital')}.`,
      `3. From the date of admission profit and loss shall be shared as follows: ${sharesText(v)}.`,
      `4. The incoming partner shall not be liable for acts of the firm before admission.`,
      `5. All other terms of the existing deed apply to the incoming partner.`,
      ...parsePartners(v.partners).map((p) => `Signature: ____________ (${p.name})`),
      `Witnesses: 1. ____________ 2. ____________`,
    ],
  },
  {
    id: 'dissolution-deed',
    title: 'Deed of dissolution of a partnership',
    group: 'Partnership and LLP',
    fields: [f('firmName', 'Name of the firm'), f('originalDeedDate', 'Date of the partnership deed', 'date'), f('dissolutionDate', 'Dissolved with effect from', 'date'), PARTNERS, f('assetsTo', 'Who takes over the assets and liabilities', 'text', false), f('date', 'Date of this deed', 'date'), f('city', 'Place of signing')],
    render: (v) => [
      `This deed of dissolution is made at ${val(v, 'city')} on ${val(v, 'date')} between the partners of ${val(v, 'firmName')}, constituted under the deed dated ${val(v, 'originalDeedDate')}:`,
      ...partiesText(v),
      `1. The partners have agreed to dissolve the firm with effect from ${val(v, 'dissolutionDate')}.`,
      `2. Accounts shall be drawn up to that date. Assets shall be realised and liabilities paid${v.assetsTo ? `, or taken over by ${v.assetsTo} at book value` : ''}, and the balance shared in the profit sharing ratio: ${sharesText(v)}.`,
      `3. No partner shall carry on business in the firm's name after dissolution. Each partner shall sign the papers needed to close bank accounts, registrations and the firm's tax accounts.`,
      `4. Public notice of the dissolution shall be given.`,
      ...parsePartners(v.partners).map((p) => `Signature: ____________ (${p.name})`),
      `Witnesses: 1. ____________ 2. ____________`,
    ],
  },
  {
    id: 'rent-agreement',
    title: 'Rent agreement',
    group: 'Property and employment',
    fields: [f('landlord', 'Landlord (name, address)'), f('tenant', 'Tenant (name, address)'), f('premises', 'Premises let out'), f('use', 'Use (residential or commercial)'), f('start', 'Starting on', 'date'), f('months', 'Term in months', 'number'), f('rent', 'Monthly rent (Rs)', 'number'), f('deposit', 'Security deposit (Rs)', 'number'), f('escalation', 'Yearly increase (%)', 'number', false), f('notice', 'Notice period (months)', 'number'), f('date', 'Date of the agreement', 'date'), f('city', 'Place of signing')],
    render: (v) => [
      `This rent agreement is made at ${val(v, 'city')} on ${val(v, 'date')} between ${val(v, 'landlord')} ("the Landlord") and ${val(v, 'tenant')} ("the Tenant").`,
      `1. Premises. The Landlord lets the premises at ${val(v, 'premises')} to the Tenant for ${val(v, 'use')} use only.`,
      `2. Term. ${val(v, 'months')} months from ${val(v, 'start')}, renewable by mutual written consent.`,
      `3. Rent. Rs ${val(v, 'rent')} a month, payable in advance by the 7th of each month${v.escalation ? `, increased by ${v.escalation}% on each renewal` : ''}. Where the law requires tax to be deducted from rent, the Tenant shall deduct it and give the Landlord the certificate.`,
      `4. Deposit. The Tenant has paid a refundable, interest-free security deposit of Rs ${val(v, 'deposit')}, to be refunded on vacating, less any dues or damage.`,
      `5. Charges. Electricity, water and maintenance charges for the period of occupation shall be paid by the Tenant; property tax by the Landlord.`,
      `6. Use and repairs. The Tenant shall keep the premises in good condition, shall not sublet, and shall make no structural change without the Landlord's written consent. Major repairs are for the Landlord.`,
      `7. Notice. Either party may end this agreement by giving ${val(v, 'notice')} months' written notice.`,
      `8. Inspection. The Landlord may inspect the premises at a reasonable time with prior notice.`,
      `Signature of the Landlord: ____________   Signature of the Tenant: ____________`,
      `Witnesses: 1. ____________ 2. ____________`,
    ],
  },
  {
    id: 'employment-agreement',
    title: 'Employment agreement',
    group: 'Property and employment',
    fields: [f('employer', 'Employer (name, address)'), f('employee', 'Employee (name, address)'), f('designation', 'Designation'), f('start', 'Joining date', 'date'), f('ctc', 'Annual cost to company (Rs)', 'number'), f('probation', 'Probation (months)', 'number', false), f('notice', 'Notice period (months)', 'number'), f('location', 'Place of work'), f('date', 'Date of the agreement', 'date')],
    render: (v) => [
      `This employment agreement is made on ${val(v, 'date')} between ${val(v, 'employer')} ("the Employer") and ${val(v, 'employee')} ("the Employee").`,
      `1. Appointment. The Employee is appointed as ${val(v, 'designation')} from ${val(v, 'start')}, at ${val(v, 'location')}.`,
      `2. Probation. ${v.probation ? `${v.probation} months, which the Employer may extend in writing.` : 'None.'}`,
      `3. Remuneration. Annual cost to company of Rs ${val(v, 'ctc')}, as in the salary annexure, subject to deduction of tax and statutory contributions.`,
      `4. Duties. The Employee shall perform the duties assigned, follow the Employer's policies and devote full working time to the Employer.`,
      `5. Confidentiality. The Employee shall keep the Employer's and its clients' information confidential during and after employment.`,
      `6. Leave and holidays. As in the Employer's leave policy and the law that applies.`,
      `7. Termination. Either party may end the employment by giving ${val(v, 'notice')} months' written notice or salary in lieu. The Employer may end it without notice for misconduct.`,
      `8. Return of property. On leaving, the Employee shall return all property and documents of the Employer.`,
      `9. Governing law. Laws of India; courts at the place of work have jurisdiction.`,
      `For the Employer: ____________   Employee: ____________`,
    ],
  },
  {
    id: 'appointment-letter',
    title: 'Appointment letter',
    group: 'Property and employment',
    fields: [f('employer', 'Employer name'), f('employee', 'Employee name'), f('address', 'Employee address'), f('designation', 'Designation'), f('start', 'Joining date', 'date'), f('ctc', 'Annual cost to company (Rs)', 'number'), f('location', 'Place of work'), f('signatory', 'Signed by (name, designation)'), f('date', 'Date of the letter', 'date')],
    render: (v) => [
      `${val(v, 'employer')}`,
      `Date: ${val(v, 'date')}`,
      `To ${val(v, 'employee')}, ${val(v, 'address')}`,
      `Subject: Letter of appointment`,
      `Dear ${val(v, 'employee')},`,
      `We are pleased to appoint you as ${val(v, 'designation')} at ${val(v, 'location')} from ${val(v, 'start')}, on an annual cost to company of Rs ${val(v, 'ctc')}, as in the salary annexure.`,
      `Your employment is governed by the Employer's policies and the employment agreement you will sign. Please bring proof of identity, address and qualifications on the joining date.`,
      `Please sign and return a copy of this letter to accept the appointment.`,
      `Yours sincerely, ${val(v, 'signatory')}`,
      `Accepted: ____________ (${val(v, 'employee')})`,
    ],
  },
  ...(
    [
      {
        id: 'board-appoint-director',
        title: 'Board resolution: appointment of an additional director',
        fields: [f('director', 'Name of the director'), f('din', 'DIN'), f('appointedFrom', 'Appointed from', 'date')],
        body: (v: Record<string, string>) => [
          `RESOLVED THAT pursuant to section 161(1) of the Companies Act, 2013 and the articles of association of the Company, ${val(v, 'director')} (DIN ${val(v, 'din')}), who has given consent to act as a director and a declaration that they are not disqualified, be and is hereby appointed as an additional director of the Company with effect from ${val(v, 'appointedFrom')}, to hold office up to the date of the next annual general meeting.`,
          `RESOLVED FURTHER THAT any director or the company secretary be and is hereby authorised to file the required forms with the Registrar of Companies and to do all acts needed to give effect to this resolution.`,
        ],
      },
      {
        id: 'board-bank-account',
        title: 'Board resolution: opening a bank account',
        fields: [f('bank', 'Bank and branch'), f('accountType', 'Type of account'), f('signatories', 'Authorised signatories and mode of operation')],
        body: (v: Record<string, string>) => [
          `RESOLVED THAT a ${val(v, 'accountType')} account be opened in the name of the Company with ${val(v, 'bank')}, and that the bank be instructed to honour cheques, instructions and electronic transfers signed or authorised by ${val(v, 'signatories')}.`,
          `RESOLVED FURTHER THAT the bank's standard form of resolution be adopted, and that a certified copy of this resolution be given to the bank.`,
        ],
      },
      {
        id: 'board-borrowing',
        title: 'Board resolution: borrowing powers',
        fields: [f('limit', 'Borrowing limit (Rs)', 'number'), f('lender', 'Lender (if known)', 'text', false)],
        body: (v: Record<string, string>) => [
          `RESOLVED THAT the Board be and is hereby authorised to borrow money${v.lender ? ` from ${v.lender}` : ''}, from time to time, on such terms as it thinks fit, provided that the total outstanding at any time, apart from temporary loans from the Company's bankers in the ordinary course of business, shall not exceed Rs ${val(v, 'limit')}.`,
          `RESOLVED FURTHER THAT where the borrowing together with existing borrowings would exceed the aggregate of the paid-up share capital, free reserves and securities premium, it shall be made only after the members approve it by special resolution under section 180(1)(c) of the Companies Act, 2013.`,
          `RESOLVED FURTHER THAT any director be and is hereby authorised to sign the loan documents and to do all acts needed to give effect to this resolution.`,
        ],
      },
      {
        id: 'board-allotment',
        title: 'Board resolution: allotment of shares',
        fields: [f('shares', 'Number of equity shares', 'number'), f('faceValue', 'Face value per share (Rs)', 'number'), f('premium', 'Premium per share (Rs)', 'number', false), f('allottees', 'Allottees and shares to each'), f('basis', 'Basis of the issue (rights, private placement and so on)')],
        body: (v: Record<string, string>) => [
          `RESOLVED THAT pursuant to the applicable provisions of the Companies Act, 2013 and the rules made under it, and the ${val(v, 'basis')} approved earlier, ${val(v, 'shares')} equity shares of Rs ${val(v, 'faceValue')} each${v.premium ? ` at a premium of Rs ${v.premium} each` : ''}, fully paid, be and are hereby allotted as follows: ${val(v, 'allottees')}.`,
          `RESOLVED FURTHER THAT share certificates be issued or the shares credited in dematerialised form, the register of members be updated, and the return of allotment be filed with the Registrar of Companies within the time allowed.`,
        ],
      },
    ] as Array<{ id: string; title: string; fields: DeedField[]; body: (v: Record<string, string>) => string[] }>
  ).map((r) => ({
    id: r.id,
    title: r.title,
    group: 'Board resolutions' as const,
    fields: [f('company', 'Name of the company'), f('cin', 'CIN', 'text', false), f('meetingDate', 'Date of the board meeting', 'date'), f('place', 'Place of the meeting'), ...r.fields, f('signatory', 'Certified by (name, designation, DIN)')],
    render: (v: Record<string, string>) => [
      `Certified true copy of the resolution passed by the Board of Directors of ${val(v, 'company')}${v.cin ? ` (CIN ${v.cin})` : ''} at its meeting held on ${val(v, 'meetingDate')} at ${val(v, 'place')}.`,
      ...r.body(v),
      `For ${val(v, 'company')}`,
      `____________ ${val(v, 'signatory')}`,
    ],
  })),
];

export function deedTemplate(id: string): DeedTemplate | undefined {
  return DEED_TEMPLATES.find((t) => t.id === id);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Missing required fields, by label. */
export function missingDeedFields(t: DeedTemplate, v: Record<string, string>): string[] {
  return t.fields.filter((x) => x.required && !(v[x.key] ?? '').trim()).map((x) => x.label);
}

/**
 * A printable HTML document. Word opens it when saved as .doc (the `word` option adds the Office
 * namespaces Word looks for).
 */
export function renderDeedHtml(t: DeedTemplate, v: Record<string, string>, opts: { word?: boolean } = {}): string {
  const paras = t.render(v).map((p) => `<p>${esc(p)}</p>`).join('\n');
  const ns = opts.word ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"' : '';
  return `<!doctype html>
<html${ns}><head><meta charset="utf-8"><title>${esc(t.title)}</title>
<style>body{font-family:"Times New Roman",serif;font-size:12pt;line-height:1.5;margin:2.5cm;color:#111}h1{font-size:15pt;text-align:center;font-weight:600}p{margin:0 0 10pt;text-align:justify}.note{border:1px solid #999;padding:6pt 8pt;font-size:10pt;color:#333}@media print{.note{border-color:#666}}</style>
</head><body>
<p class="note">${esc(DEED_REVIEW_NOTE)}</p>
<h1>${esc(t.title)}</h1>
${paras}
</body></html>`;
}
