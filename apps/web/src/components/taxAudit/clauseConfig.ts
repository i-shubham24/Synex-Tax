import {
  CLAUSE12_SECTIONS, CLAUSE16B_DESCRIPTIONS, CLAUSE19_SECTIONS, CLAUSE20B_FUNDS, CLAUSE26_SECTIONS, CLAUSE31_MODES, CLAUSE34_FORMS, CLAUSE34_SECTIONS,
  ICDS_CODES, TAX_AUDIT_BLOCKS, TAX_AUDIT_STATES,
} from '@synextax/tax-engine';
import { addressCols, type Col } from './fields';

type Opt = ReadonlyArray<readonly [string, string]>;
const pairs = (r: Readonly<Record<string, string>>, withCode = true): Opt => Object.entries(r).map(([k, v]) => [k, withCode ? `${k} ${v}` : v] as const);
const same = (xs: readonly string[]): Opt => xs.map((x) => [x, x] as const);

export const STATES: Opt = pairs(TAX_AUDIT_STATES);
const addr = (p: string) => addressCols(p, STATES);
const YN: Opt = [['N', 'No'], ['Y', 'Yes']];

/** Clause labels follow the text of Form 3CD as shown in the Department's utility (version 1.5). */
export const UNBUILT_LABELS: Record<string, string> = {
  '15': 'Capital asset converted into stock-in-trade',
  '23': 'Payments to persons specified in section 40A(2)(b)',
  '24': 'Amounts deemed to be profits under section 32AC, 32AD, 33AB, 33ABA or 33AC',
  '25': 'Profit chargeable to tax under section 41',
  '27': 'CENVAT or input tax credit, and prior period items (answered No)',
  '29A': 'Income under section 56(2)(ix) (answered No)',
  '29B': 'Income under section 56(2)(x) (answered No)',
  '30': 'Hundi borrowings or repayments, section 69D (answered No)',
  '30A': 'Primary adjustment to transfer price, section 92CE (answered No)',
  '30B': 'Interest above ₹1 crore, section 94B (answered No)',
  '30C': 'Impermissible avoidance arrangement, section 96 (answered No)',
  '32': 'Losses brought forward, section 79 and speculation losses (answered not applicable or No)',
  '33': 'Deductions under Chapter VI-A or Chapter III (answered No)',
  '35': 'Quantitative details of goods',
  '36A': 'Dividend under section 2(22)(e) (answered No)',
  '36B': 'Buyback of shares under section 2(22)(f) (answered No)',
  '41': 'Demand or refund under other tax laws',
  '42': 'Statement in Form 61, 61A or 61B (answered No)',
  '43': 'Report under section 286(2) (answered No)',
};

export const BUILT_LABELS: Record<string, string> = {
  '9': 'Clause 9: partners or members and their shares',
  '10': 'Clause 10: nature of business or profession',
  '11': 'Clause 11: books of account',
  '12': 'Clause 12: presumptive income in the profit and loss account',
  '13': 'Clause 13: method of accounting and ICDS',
  '14': 'Clause 14: valuation of closing stock',
  '16': 'Clause 16: amounts not credited to the profit and loss account',
  '17': 'Clause 17: land or building transferred below stamp value',
  '18': 'Clause 18: depreciation',
  '19': 'Clause 19: amounts admissible under sections 32AC to 35E',
  '20': 'Clause 20: bonus and employees’ contributions',
  '21': 'Clause 21: amounts debited and inadmissible',
  '22': 'Clause 22: MSMED Act interest and payments',
  '26': 'Clause 26: section 43B',
  '31': 'Clause 31: loans, deposits and receipts (sections 269SS, 269ST, 269T)',
  '34': 'Clause 34: TDS and TCS compliance',
  '37': 'Clause 37: cost audit',
  '38': 'Clause 38: audit under the Central Excise Act',
  '39': 'Clause 39: audit under section 72A of the Finance Act, 1994',
  '40': 'Clause 40: turnover, gross profit and other ratios',
  '44': 'Clause 44: expenditure by GST registration of the supplier',
};

export const C9_PARTNERS: Col[] = [{ key: 'name', label: 'Partner or member', span: 2 }, { key: 'share', label: 'Profit share %', kind: 'decimal' }];
export const C9_CHANGES: Col[] = [
  { key: 'date', label: 'Date of change', kind: 'date' }, { key: 'name', label: 'Partner or member' },
  { key: 'type', label: 'Type', kind: 'select', options: [['ADD', 'Admission'], ['DEL', 'Retirement'], ['CHANGE', 'Change in share']] },
  { key: 'oldShare', label: 'Old share %', kind: 'decimal' }, { key: 'newShare', label: 'New share %', kind: 'decimal' }, { key: 'remarks', label: 'Remarks', span: 3 },
];
export const C10_CODES: Col[] = [{ key: 'code', label: 'Business code', listId: 'ta-business-codes', mono: true, span: 2 }];
export const C10_CHANGES: Col[] = [{ key: 'change', label: 'Change', kind: 'select', options: [['Added', 'Added'], ['Discontinued', 'Discontinued']] }, { key: 'code', label: 'Business code', listId: 'ta-business-codes', mono: true }];
export const TEXT_ROW: Col[] = [{ key: 'text', label: 'Books or documents', span: 3 }];
export const C11_MAINTAINED: Col[] = [{ key: 'books', label: 'Books maintained', span: 2 }, ...addr('address')];
export const C12: Col[] = [{ key: 'section', label: 'Section', kind: 'select', options: same(CLAUSE12_SECTIONS) }, { key: 'otherSection', label: 'Other section' }, { key: 'amount', label: 'Amount', kind: 'signed' }];
export const EFFECT: Col[] = [{ key: 'particulars', label: 'Particulars', span: 2 }, { key: 'increase', label: 'Increase in profit', kind: 'amount' }, { key: 'decrease', label: 'Decrease in profit', kind: 'amount' }];
export const C13_ICDS: Col[] = [{ key: 'icds', label: 'ICDS', kind: 'select', options: same(ICDS_CODES) }, { key: 'increase', label: 'Increase in profit', kind: 'amount' }, { key: 'decrease', label: 'Decrease in profit', kind: 'amount' }];
export const C13_DISCLOSURE: Col[] = [{ key: 'icds', label: 'ICDS', kind: 'select', options: same(ICDS_CODES) }, { key: 'text', label: 'Disclosure', span: 3 }];
export const DESCRIBED: Col[] = [{ key: 'description', label: 'Description', span: 3 }, { key: 'amount', label: 'Amount', kind: 'signed' }];
export const C16_CREDITS: Col[] = [{ key: 'code', label: 'Description', kind: 'select', options: pairs(CLAUSE16B_DESCRIPTIONS, false), span: 2 }, { key: 'other', label: 'If others' }, { key: 'amount', label: 'Amount', kind: 'signed' }];
export const C17: Col[] = [{ key: 'details', label: 'Details of property', span: 2 }, { key: 'consideration', label: 'Consideration', kind: 'amount' }, { key: 'valuation', label: 'Stamp duty value', kind: 'amount' }, ...addr('address'), { key: 'provisoApplies', label: 'Second proviso to 43CA(1) or fourth proviso to 56(2)(x) applies', kind: 'bool', span: 3 }];
export const C18_BLOCK: Col[] = [
  { key: 'block', label: 'Block of assets', kind: 'select', options: pairs(TAX_AUDIT_BLOCKS, false), span: 2 }, { key: 'rate', label: 'Rate %', kind: 'decimal' },
  { key: 'method', label: 'Method', kind: 'select', options: [['WDV', 'Written down value'], ['SLM', 'Straight line']] },
  { key: 'openingWdv', label: 'Opening WDV', kind: 'amount' }, { key: 'goodwillAdjustment', label: 'Goodwill adjustment', kind: 'signed' },
  { key: 'otherAdjustments', label: 'Other adjustments', kind: 'signed' }, { key: 'depreciationAllowable', label: 'Depreciation (blank to work out)', kind: 'amount' },
];
export const C18_ADD: Col[] = [
  { key: 'purchaseDate', label: 'Date of purchase', kind: 'date' }, { key: 'putToUseDate', label: 'Date put to use', kind: 'date' }, { key: 'value', label: 'Purchase value', kind: 'amount' },
  { key: 'cenvat', label: 'CENVAT', kind: 'signed' }, { key: 'exchangeRate', label: 'Exchange rate change', kind: 'signed' }, { key: 'subsidy', label: 'Subsidy or grant', kind: 'signed' },
  { key: 'lessThan180Days', label: 'Put to use for less than 180 days', kind: 'bool', span: 2 },
];
export const C18_DED: Col[] = [{ key: 'saleDate', label: 'Date of sale', kind: 'date' }, { key: 'amount', label: 'Amount', kind: 'amount' }, { key: 'outOfLessThan180DayAdditions', label: 'Out of additions used less than 180 days', kind: 'bool', span: 2 }];
export const C19: Col[] = [{ key: 'section', label: 'Section', kind: 'select', options: same(CLAUSE19_SECTIONS) }, { key: 'other', label: 'Other section' }, { key: 'debited', label: 'Debited to profit and loss', kind: 'amount' }, { key: 'admissible', label: 'Admissible', kind: 'amount' }];
export const C20_PF: Col[] = [
  { key: 'fund', label: 'Nature of fund', kind: 'select', options: pairs(CLAUSE20B_FUNDS, false) }, { key: 'received', label: 'Received from employees', kind: 'amount' },
  { key: 'dueDate', label: 'Due date', kind: 'date' }, { key: 'paid', label: 'Amount paid', kind: 'amount' }, { key: 'paidOn', label: 'Date paid', kind: 'date' },
];
export const C21_DEBITED: Col[] = [
  { key: 'type', label: 'Nature', kind: 'select', options: [['CAPITAL', 'Capital expenditure'], ['PERSONAL', 'Personal expenditure'], ['ADVERTISMNT', 'Advertisement in a political party publication'], ['CLUBFEE', 'Club entrance fees and subscriptions'], ['CLUBSERVICE', 'Club services and facilities'], ['PENALTY', 'Offence or penalty for violation of law'], ['OTHERPENALTY', 'Any other penalty or fine'], ['UNDERLAW', 'To compound an offence'], ['OFFENCE', 'Benefit or perquisite in violation of law'], ['SETTLE', 'To settle proceedings under a notified law']], span: 2 },
  { key: 'particulars', label: 'Particulars' }, { key: 'amount', label: 'Amount', kind: 'amount' },
];
export const payeeCols = (opts: { tax?: boolean; deposited?: boolean }): Col[] => [
  { key: 'date', label: 'Date of payment', kind: 'date' }, { key: 'amount', label: 'Amount', kind: 'amount' }, { key: 'nature', label: 'Nature of payment' }, { key: 'name', label: 'Payee' },
  { key: 'pan', label: 'Payee PAN', mono: true }, ...addr('address'),
  ...(opts.tax ? [{ key: 'taxDeducted', label: 'Tax deducted', kind: 'amount' as const }] : []), ...(opts.deposited ? [{ key: 'taxDeposited', label: 'Tax deposited', kind: 'amount' as const }] : []),
];
export const C21_40B: Col[] = [
  { key: 'particulars', label: 'Particulars', kind: 'select', options: same(['Interest', 'Salary', 'Bonus', 'Commission', 'Remuneration']) }, { key: 'section', label: 'Section', kind: 'select', options: [['40b', '40(b)'], ['40ba', '40(ba)']] },
  { key: 'debited', label: 'Debited', kind: 'amount' }, { key: 'admissible', label: 'Admissible', kind: 'amount' }, { key: 'inadmissible', label: 'Inadmissible', kind: 'amount' }, { key: 'remarks', label: 'Remarks', span: 3 },
];
export const C21_40A3: Col[] = [{ key: 'date', label: 'Date', kind: 'date' }, { key: 'nature', label: 'Nature of payment' }, { key: 'amount', label: 'Amount', kind: 'amount' }, { key: 'name', label: 'Payee' }, { key: 'pan', label: 'Payee PAN', mono: true }];
export const C26: Col[] = [{ key: 'section', label: 'Section', kind: 'select', options: pairs(CLAUSE26_SECTIONS, false), span: 2 }, { key: 'nature', label: 'Nature of liability' }, { key: 'amount', label: 'Amount', kind: 'amount' }];
const MODES = pairs(CLAUSE31_MODES, false);
const party: Col[] = [{ key: 'name', label: 'Name' }, { key: 'address', label: 'Address', span: 2 }, { key: 'pan', label: 'PAN', mono: true }];
const chequeType: Col = { key: 'chequeType', label: 'If by cheque or draft', kind: 'select', options: [['', 'Not by cheque or draft'], ['APC', 'Account payee cheque'], ['APBD', 'Account payee bank draft'], ['OM', 'Other mode']] };
export const C31 = {
  loans269SS: [...party, { key: 'amount', label: 'Amount', kind: 'amount' }, { key: 'squaredUp', label: 'Squared up in the year', kind: 'select', options: YN }, { key: 'maxOutstanding', label: 'Maximum outstanding', kind: 'amount' }, { key: 'mode', label: 'Mode', kind: 'select', options: MODES }, chequeType] as Col[],
  specifiedSums269SS: [...party, { key: 'amount', label: 'Amount', kind: 'amount' }, { key: 'mode', label: 'Mode', kind: 'select', options: MODES }, chequeType] as Col[],
  receipts269STCash: [...party, { key: 'nature', label: 'Nature of transaction' }, { key: 'amount', label: 'Amount', kind: 'amount' }, { key: 'date', label: 'Date', kind: 'date' }] as Col[],
  receipts269STCheque: [...party, { key: 'amount', label: 'Amount', kind: 'amount' }] as Col[],
  payments269STCash: [...party, { key: 'nature', label: 'Nature of transaction' }, { key: 'amount', label: 'Amount', kind: 'amount' }, { key: 'date', label: 'Date', kind: 'date' }] as Col[],
  payments269STCheque: [...party, { key: 'amount', label: 'Amount', kind: 'amount' }] as Col[],
  repayments269T: [...party, { key: 'amount', label: 'Amount repaid', kind: 'amount' }, { key: 'maxOutstanding', label: 'Maximum outstanding', kind: 'amount' }, { key: 'mode', label: 'Mode', kind: 'select', options: MODES }, chequeType] as Col[],
  repaymentsReceivedCash: [...party, { key: 'amount', label: 'Amount', kind: 'amount' }] as Col[],
  repaymentsReceivedCheque: [...party, { key: 'amount', label: 'Amount', kind: 'amount' }] as Col[],
};
export const C31_TITLES: Record<keyof typeof C31, string> = {
  loans269SS: '(a) Loans or deposits taken above the section 269SS limit',
  specifiedSums269SS: '(b) Specified sums taken above the section 269SS limit',
  receipts269STCash: '(ba) Receipts above the section 269ST limit, not by cheque, draft or electronic means',
  receipts269STCheque: '(bb) Receipts above the section 269ST limit by non account payee cheque or draft',
  payments269STCash: '(bc) Payments above the section 269ST limit, not by cheque, draft or electronic means',
  payments269STCheque: '(bd) Payments above the section 269ST limit by non account payee cheque or draft',
  repayments269T: '(c) Repayments above the section 269T limit',
  repaymentsReceivedCash: '(d) Repayments received, not by cheque, draft or electronic means',
  repaymentsReceivedCheque: '(e) Repayments received by non account payee cheque or draft',
};
export const C34A: Col[] = [
  { key: 'tan', label: 'TAN', mono: true }, { key: 'section', label: 'Section', kind: 'select', options: same(CLAUSE34_SECTIONS) }, { key: 'nature', label: 'Nature of payment', span: 2 },
  { key: 'totalAmount', label: '(4) Total payments', kind: 'amount' }, { key: 'requiredAmount', label: '(5) Tax required on', kind: 'amount' },
  { key: 'specifiedRateAmount', label: '(6) At specified rate on', kind: 'amount' }, { key: 'specifiedRateTax', label: '(7) Tax at specified rate', kind: 'amount' },
  { key: 'lowerRateAmount', label: '(8) At lower rate on', kind: 'amount' }, { key: 'lowerRateTax', label: '(9) Tax at lower rate', kind: 'amount' }, { key: 'notDeposited', label: '(10) Not deposited', kind: 'amount' },
];
export const C34B: Col[] = [
  { key: 'tan', label: 'TAN', mono: true }, { key: 'form', label: 'Form', kind: 'select', options: same(CLAUSE34_FORMS) }, { key: 'dueDate', label: 'Due date', kind: 'date' }, { key: 'filedOn', label: 'Date furnished', kind: 'date' },
  { key: 'allReported', label: 'All transactions reported', kind: 'bool' }, { key: 'notReported', label: 'If not, list them', span: 3 },
];
export const C34C: Col[] = [{ key: 'tan', label: 'TAN', mono: true }, { key: 'interestPayable', label: 'Interest payable', kind: 'amount' }, { key: 'interestPaid', label: 'Interest paid', kind: 'amount' }, { key: 'paidOn', label: 'Date paid', kind: 'date' }];
export const RATIO: Col[] = [
  { key: 'turnover', label: 'Total turnover', kind: 'amount' }, { key: 'grossProfit', label: 'Gross profit', kind: 'signed' }, { key: 'netProfit', label: 'Net profit', kind: 'signed' },
  { key: 'stockInTrade', label: 'Stock-in-trade', kind: 'amount' }, { key: 'materialConsumed', label: 'Material consumed', kind: 'amount' }, { key: 'finishedGoodsProduced', label: 'Finished goods produced', kind: 'amount' },
];
export const C44: Col[] = [
  { key: 'total', label: 'Total expenditure', kind: 'amount' }, { key: 'exempt', label: 'Registered: exempt goods or services', kind: 'amount' }, { key: 'composition', label: 'Registered: composition dealers', kind: 'amount' },
  { key: 'otherRegistered', label: 'Other registered entities', kind: 'amount' }, { key: 'unregistered', label: 'Entities not registered', kind: 'amount' },
];
export const C22: Col[] = [
  { key: 'interestInadmissible', label: '(i) Interest inadmissible, section 23 MSMED Act', kind: 'amount', span: 2 }, { key: 'payableToMicroSmall', label: '(ii) Payable to micro or small enterprises', kind: 'amount', span: 2 },
  { key: 'paidInTime', label: '(iii)(a) Paid in time', kind: 'amount' }, { key: 'notPaidInTime', label: '(iii)(b) Not paid in time', kind: 'amount' },
];
export const AUDIT_STATUS: Opt = [['X', 'Not applicable'], ['N', 'No'], ['Y', 'Yes']];
