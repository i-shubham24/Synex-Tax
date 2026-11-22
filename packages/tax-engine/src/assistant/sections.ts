/**
 * Section mapping between the Income-tax Act, 2025 and the Income-tax Act, 1961, and the GST
 * sections the assistant may cite. The assistant shows a section only when it is in these tables;
 * anything else in a model answer is removed and listed (see checkCitations).
 *
 * Sources, by the `src` key on each row:
 *   ITD   Income Tax Department, section pages of the Income-tax Act, 2025 on incometaxindia.gov.in
 *         (headings of sections 392 to 428 read on 22 November 2026); the 1961 section is the one
 *         with the same heading in the 1961 Act.
 *   F140  Protean, Form 140 (26Q) file format, Annexure 2 (see tds/form140Codes.ts) for the 2025
 *         section and table entry; the 1961 section is the one for the same nature of payment in
 *         Protean's 1961 Act 26Q annexure (tds/form1961Codes.ts).
 *   MAP   Published section maps that agree on the row: eztax.in "Compare old and new section
 *         codes" (citing the gazette of 21 August 2025, updated 30 April 2026), taxheal.com "Income
 *         Tax Act 1961 vs 2025 section wise table" and taxonation.com "Section mapping guide" (13 May
 *         2026). Check against the Department's section mapping utility before relying on a row.
 *   CGST  Central Goods and Services Tax Act, 2017; IGST: Integrated Goods and Services Tax Act,
 *         2017 (indiacode.nic.in). Section headings only.
 */

export type SectionSource = 'ITD' | 'F140' | 'MAP' | 'CGST' | 'IGST';

export interface SectionRow {
  /** Section of the Income-tax Act, 2025 (with sub-section or table entry where the source gives one). */
  act2025: string;
  /** Section of the Income-tax Act, 1961 for the same provision. */
  act1961: string;
  topic: string;
  src: SectionSource;
}

const row = (act2025: string, act1961: string, topic: string, src: SectionSource): SectionRow => ({ act2025, act1961, topic, src });

export const SECTION_MAP: readonly SectionRow[] = [
  row('2', '2', 'Definitions', 'MAP'),
  row('3', '3', 'Tax year (in place of previous year)', 'MAP'),
  row('67', '45', 'Capital gains, charge', 'MAP'),
  row('123', '80C', 'Deduction for life insurance, provident fund and similar payments', 'MAP'),
  row('156', '87A', 'Rebate for resident individuals', 'MAP'),
  row('196', '111A', 'Short-term capital gains on listed equity (STT paid)', 'MAP'),
  row('197', '112', 'Long-term capital gains, other', 'MAP'),
  row('198', '112A', 'Long-term capital gains on listed equity (STT paid)', 'MAP'),
  row('202', '115BAC', 'New tax regime for individuals and HUFs', 'MAP'),
  row('263', '139', 'Return of income', 'MAP'),
  row('279', '147', 'Income escaping assessment', 'MAP'),
  row('392', '192', 'TDS on salary', 'ITD'),
  row('392(7)', '192A', 'TDS on accumulated provident fund balance', 'F140'),
  row('393', '193 to 196D', 'Tax to be deducted at source on other payments', 'ITD'),
  row('393(1) Table 1(i)', '194D', 'Insurance commission', 'F140'),
  row('393(1) Table 1(ii)', '194H', 'Commission or brokerage', 'F140'),
  row('393(1) Table 2(ii)', '194-I', 'Rent', 'F140'),
  row('393(1) Table 3(ii)', '194-IC', 'Joint development agreement consideration', 'F140'),
  row('393(1) Table 3(iii)', '194LA', 'Compensation on compulsory acquisition', 'F140'),
  row('393(1) Table 4(i)', '194K', 'Income from mutual fund units', 'F140'),
  row('393(1) Table 4(ii)', '194LBA', 'Business trust income to unit holders', 'F140'),
  row('393(1) Table 4(iii)', '194LBB', 'Investment fund income to unit holders', 'F140'),
  row('393(1) Table 4(iv)', '194LBC', 'Securitisation trust income', 'F140'),
  row('393(1) Table 5(i)', '193', 'Interest on securities', 'F140'),
  row('393(1) Table 5(ii)', '194A', 'Interest other than on securities (banks, co-operative banks, post office)', 'F140'),
  row('393(1) Table 5(iii)', '194A', 'Interest other than on securities (others)', 'F140'),
  row('393(1) Table 6(i)', '194C', 'Payments to contractors', 'F140'),
  row('393(1) Table 6(iii)', '194J', 'Fees for professional or technical services, royalty, director fees', 'F140'),
  row('393(1) Table 7', '194', 'Dividends', 'F140'),
  row('393(1) Table 8(i)', '194DA', 'Life insurance policy payout', 'F140'),
  row('393(1) Table 8(ii)', '194Q', 'Purchase of goods', 'F140'),
  row('393(1) Table 8(iv)', '194R', 'Business perquisites', 'F140'),
  row('393(1) Table 8(v)', '194-O', 'E-commerce operator to participant', 'F140'),
  row('393(1) Table 8(vi)', '194S', 'Transfer of a virtual digital asset', 'F140'),
  row('393(3) Table 1', '194B', 'Lottery, crossword, card game and other winnings', 'F140'),
  row('393(3) Table 2', '194BA', 'Online game winnings', 'F140'),
  row('393(3) Table 3', '194BB', 'Horse race winnings', 'F140'),
  row('393(3) Table 4', '194G', 'Commission on lottery tickets', 'F140'),
  row('393(3) Table 5', '194N', 'Cash withdrawals', 'F140'),
  row('393(3) Table 6', '194EE', 'National Savings Scheme withdrawals', 'F140'),
  row('393(3) Table 7', '194T', 'Payments by a firm to its partners', 'F140'),
  row('394', '206C', 'Collection of tax at source', 'ITD'),
  row('403', '207', 'Liability for payment of advance tax', 'ITD'),
  row('404', '208', 'Conditions of liability to pay advance tax', 'ITD'),
  row('405', '209', 'Computation of advance tax', 'ITD'),
  row('408', '211', 'Instalments of advance tax and due dates', 'ITD'),
  row('410', '219', 'Credit for advance tax', 'ITD'),
  row('423', '234A', 'Interest for defaults in furnishing return of income', 'ITD'),
  row('424', '234B', 'Interest for defaults in payment of advance tax', 'ITD'),
  row('425', '234C', 'Interest for deferment of advance tax', 'ITD'),
  row('426', '234D', 'Interest on excess refund', 'ITD'),
  row('427', '234E', 'Fee for default in furnishing statements', 'ITD'),
  row('428', '234F', 'Fee for default in furnishing return of income', 'ITD'),
];

export interface GstSectionRow {
  act: 'CGST' | 'IGST';
  section: string;
  topic: string;
}

const g = (act: 'CGST' | 'IGST', section: string, topic: string): GstSectionRow => ({ act, section, topic });

export const GST_SECTIONS: readonly GstSectionRow[] = [
  g('CGST', '2', 'Definitions'),
  g('CGST', '7', 'Scope of supply'),
  g('CGST', '9', 'Levy and collection'),
  g('CGST', '10', 'Composition levy'),
  g('CGST', '12', 'Time of supply of goods'),
  g('CGST', '13', 'Time of supply of services'),
  g('CGST', '15', 'Value of taxable supply'),
  g('CGST', '16', 'Eligibility and conditions for input tax credit'),
  g('CGST', '17', 'Apportionment of credit and blocked credits'),
  g('CGST', '18', 'Availability of credit in special circumstances'),
  g('CGST', '22', 'Persons liable for registration'),
  g('CGST', '24', 'Compulsory registration'),
  g('CGST', '29', 'Cancellation or suspension of registration'),
  g('CGST', '31', 'Tax invoice'),
  g('CGST', '34', 'Credit and debit notes'),
  g('CGST', '35', 'Accounts and other records'),
  g('CGST', '37', 'Furnishing details of outward supplies'),
  g('CGST', '39', 'Furnishing of returns'),
  g('CGST', '44', 'Annual return'),
  g('CGST', '47', 'Levy of late fee'),
  g('CGST', '49', 'Payment of tax, interest, penalty and other amounts'),
  g('CGST', '50', 'Interest on delayed payment of tax'),
  g('CGST', '54', 'Refund of tax'),
  g('CGST', '61', 'Scrutiny of returns'),
  g('CGST', '73', 'Determination of tax, other than fraud (periods up to 2023-24)'),
  g('CGST', '74', 'Determination of tax, fraud or suppression (periods up to 2023-24)'),
  g('CGST', '74A', 'Determination of tax from 2024-25'),
  g('CGST', '75', 'General provisions relating to determination of tax'),
  g('CGST', '107', 'Appeals to Appellate Authority'),
  g('CGST', '122', 'Penalty for certain offences'),
  g('CGST', '128A', 'Waiver of interest or penalty for certain periods'),
  g('CGST', '129', 'Detention, seizure and release of goods in transit'),
  g('CGST', '130', 'Confiscation of goods or conveyances'),
  g('IGST', '5', 'Levy and collection of integrated tax'),
  g('IGST', '7', 'Inter-State supply'),
  g('IGST', '8', 'Intra-State supply'),
  g('IGST', '10', 'Place of supply of goods'),
  g('IGST', '12', 'Place of supply of services, supplier and recipient in India'),
  g('IGST', '13', 'Place of supply of services, supplier or recipient outside India'),
  g('IGST', '16', 'Zero rated supply'),
];

const norm = (s: string) => s.toUpperCase().replace(/\s+/g, '').replace(/-/g, '');
/** The bare section number, for example 393 from "393(1) Table 6(i)" or 194C from "194C(1)". */
export const baseSection = (s: string) => norm(s).match(/^\d+[A-Z]*/)?.[0] ?? norm(s);

const BASE_2025 = new Set(SECTION_MAP.map((r) => baseSection(r.act2025)));
const BASE_1961 = new Set(SECTION_MAP.flatMap((r) => (r.act1961.includes(' to ') ? [] : [baseSection(r.act1961)])));
const GST_KEYS = new Set(GST_SECTIONS.map((r) => `${r.act}:${norm(r.section)}`));

/** The 1961 sections a 2025 section stands in for (one row per table entry). */
export function rowsFor2025(section: string): SectionRow[] {
  const b = baseSection(section);
  const exact = SECTION_MAP.filter((r) => norm(r.act2025) === norm(section));
  return exact.length ? exact : SECTION_MAP.filter((r) => baseSection(r.act2025) === b);
}

/** The most specific row whose 2025 reference starts the given one (for example 393(1) Table 6(i) for 393(1) Table 6(i)(a)). */
export function bestRowFor2025(section: string): SectionRow | undefined {
  const n = norm(section);
  return SECTION_MAP.filter((r) => n.startsWith(norm(r.act2025))).sort((a, b) => norm(b.act2025).length - norm(a.act2025).length)[0];
}

export function rowsFor1961(section: string): SectionRow[] {
  const b = baseSection(section);
  return SECTION_MAP.filter((r) => !r.act1961.includes(' to ') && baseSection(r.act1961) === b);
}

/** Text for a model prompt: the only sections the model may cite. */
export function mappingForPrompt(): string {
  const it = SECTION_MAP.map((r) => `${r.act2025} (2025) = ${r.act1961} (1961): ${r.topic}`).join('\n');
  const gst = GST_SECTIONS.map((r) => `${r.act} ${r.section}: ${r.topic}`).join('\n');
  return `Income-tax sections:\n${it}\n\nGST sections:\n${gst}`;
}

export type CitationAct = '2025' | '1961' | 'CGST' | 'IGST' | 'UNSPECIFIED';

export interface Citation {
  text: string;
  section: string;
  act: CitationAct;
  /** For an income-tax citation, the row(s) from the table, so both numbers can be shown. */
  rows?: SectionRow[];
  gst?: GstSectionRow;
}

export interface CitationCheck {
  text: string;
  verified: Citation[];
  removed: Citation[];
}

// "section 393(1)", "sections 196 and 198", "Sec. 80C", "u/s 143(1)", "s. 87A", "§ 50".
const CITE = /\b(sections?|secs?\.?|u\/s\.?|s\.)\s*((?:\d+[A-Z]{0,4}(?:\s*\([0-9A-Za-z]+\))*)(?:\s*(?:,|and|or|to|&)\s*\d+[A-Z]{0,4}(?:\s*\([0-9A-Za-z]+\))*)*)/gi;
const ONE = /\d+[A-Z]{0,4}(?:\s*\([0-9A-Za-z]+\))*/gi;

function actNear(text: string, start: number, end: number): CitationAct {
  const after = text.slice(end, end + 60);
  const before = text.slice(Math.max(0, start - 20), start);
  // After the number ("section 16 of the CGST Act"), or right before it ("CGST Act section 16").
  const m = /(CGST|IGST|Central Goods and Services Tax|Integrated Goods and Services Tax|1961|2025)/i.exec(after) ?? /(CGST|IGST|1961|2025)(?:\s*Act)?\s*,?\s*$/i.exec(before) ?? /\bGST\b/i.exec(after);
  if (!m) return 'UNSPECIFIED';
  const k = m[1]?.toUpperCase() ?? 'CGST';
  if (k.startsWith('CENTRAL') || k === 'CGST' || k === 'GST') return 'CGST';
  if (k.startsWith('INTEGRATED') || k === 'IGST') return 'IGST';
  return k === '1961' ? '1961' : '2025';
}

function verify(section: string, act: CitationAct): Pick<Citation, 'rows' | 'gst'> | null {
  const b = baseSection(section);
  if (act === 'CGST' || act === 'IGST') {
    if (!GST_KEYS.has(`${act}:${b}`)) return null;
    return { gst: GST_SECTIONS.find((r) => r.act === act && norm(r.section) === b) };
  }
  if (act === '2025') return BASE_2025.has(b) ? { rows: rowsFor2025(section) } : null;
  if (act === '1961') return BASE_1961.has(b) ? { rows: rowsFor1961(section) } : null;
  // No Act named: accept only a number that cannot belong to the other Act. The 1961 Act's
  // numbered sections end at 298, and a letter suffix (87A, 194C) is 1961 numbering.
  const n = Number(b.match(/^\d+/)?.[0]);
  if (BASE_2025.has(b) && n > 298) return { rows: rowsFor2025(section) };
  if (BASE_1961.has(b) && /[A-Z]$/.test(b)) return { rows: rowsFor1961(section) };
  return null;
}

/**
 * Finds section citations in model output, keeps those the tables can verify and removes the
 * rest. A removed citation is replaced with "[section not verified]" so the sentence still reads.
 */
export function checkCitations(text: string): CitationCheck {
  const verified: Citation[] = [];
  const removed: Citation[] = [];
  const out = text.replace(CITE, (whole, _word: string, list: string, offset: number) => {
    const act = actNear(text, offset, offset + whole.length);
    const parts = list.match(ONE) ?? [];
    const kept: string[] = [];
    for (const p of parts) {
      const section = p.replace(/\s+/g, '');
      const ok = verify(section, act);
      const c: Citation = { text: `section ${section}`, section, act, ...(ok ?? {}) };
      if (ok) {
        verified.push(c);
        kept.push(p);
      } else removed.push(c);
    }
    if (kept.length === parts.length) return whole;
    if (kept.length === 0) return '[section not verified]';
    return `${_word} ${kept.join(', ')} [other sections not verified]`;
  });
  return { text: out, verified: dedupe(verified), removed: dedupe(removed) };
}

function dedupe(list: Citation[]): Citation[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(`${c.act}:${c.section}`) ? false : (seen.add(`${c.act}:${c.section}`), true)));
}
