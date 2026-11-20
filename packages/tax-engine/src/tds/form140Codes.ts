/**
 * Section codes for Form 140 (non-salary TDS, residents), Income-tax Act 2025, Tax Year 2026-27 on.
 *
 * Source: Protean, "File Format for Non-Salary TDS File - Form Number 140 (26Q) - Q1 to Q4",
 * Annexure 2 "Nature of Payment", file "Form Number 140 - 26Q - Q1 to Q4_22072026.xlsx" from
 * tinpan.proteantech.in/downloads/e-tds (read 20 Nov 2026). Codes are copied verbatim; when Protean
 * publishes a new version, replace this table from the new annexure.
 */
export interface Form140SectionCode {
  code: string;
  section: string;
  nature: string;
}

export const FORM_140_FILE_FORMAT_VERSION = '1.2';

export const FORM_140_SECTION_CODES: readonly Form140SectionCode[] = [
  { code: '1004', section: '392(7)', nature: 'Any payment of accumulated balance due to an employee' },
  { code: '1005', section: '393(1) [Table: Sl. No. 1(i)]', nature: 'Commission or brokerage - insurance' },
  { code: '1006', section: '393(1) [Table: Sl. No. 1(ii)]', nature: 'Commission or Brokerage - others' },
  { code: '1008', section: '393(1) [Table: Sl. No. 2(ii).D(a)]', nature: 'Rent on machinery etc.- specified person' },
  { code: '1009', section: '393(1) [Table: Sl. No. 2(ii).D(b)]', nature: 'Rent other than machinery etc.- specified person' },
  { code: '1011', section: '393(1) [Table: Sl. No. 3(ii)]', nature: 'Payment on any consideration, not being consideration in kind, under the agreement referred to in section 67(14).' },
  { code: '1012', section: '393(1) [Table: Sl. No. 3(iii)]', nature: 'Payment of Compensation on Acquisition of Certain Immovable Property' },
  { code: '1013', section: '393(1) [Table: Sl. No. 4(i)]', nature: 'Income payable to a resident assessee in respect of Units of a specified Mutual Fund specified under Schedule VII (Table: Sl. No. 20 or 21) or units from the Administrator of the specified undertaking or units from specified company' },
  { code: '1014', section: '393(1) [Table: Sl. No. 4(ii)]', nature: 'Certain income in the form of interest from units of a business trust to a resident unit holder' },
  { code: '1015', section: '393(1) [Table: Sl. No. 4(ii)]', nature: 'Certain income in the form of dividend from units of a business trust to a resident unit holder' },
  { code: '1016', section: '393(1) [Table: Sl. No. 4(ii)]', nature: 'Certain income in the form of Renting from units of a business trust being a real estate investment trust to a resident unit holder' },
  { code: '1017', section: '393(1) [Table: Sl. No. 4(iii)]', nature: 'Any income, other than that proportion of income which is exempt under Schedule V [Table: Sl. No. 2], in respect of units of an investment fund specified in section 224, payable to its unitholder.' },
  { code: '1018', section: '393(1) [Table: Sl. No. 4(iv)]', nature: 'Any income, in respect of an investment in a securitisation trust specified in section 221 to an investor.' },
  { code: '1019', section: '393(1) [Table: Sl. No. 5(i)]', nature: 'Any income by way of Interest on securities' },
  { code: '1020', section: '393(1) [Table: Sl. No. 5(ii).D(a)]', nature: 'Any income by way of interest other than interest on securities, in case of deductee/payee is a senior citizen' },
  { code: '1021', section: '393(1) [Table: Sl. No. 5(ii).D(b)]', nature: 'Any income by way of interest other than interest on securities, in case of deductee/payee is other than senior citizen' },
  { code: '1022', section: '393(1) [Table: Sl. No. 5(iii)]', nature: 'Any income being interest other than interest on securities' },
  { code: '1023', section: '393(1) [Table: Sl. No. 6(i).D(a)]', nature: 'Any sum for carrying out any work (including supply of labour for carrying out any work) in pursuance of a contract between the contractor and a designated person – if contractor is individual or Hindu undivided family' },
  { code: '1024', section: '393(1) [Table: Sl. No. 6(i).D(b)]', nature: 'Any sum for carrying out any work (including supply of labour for carrying out any work) in pursuance of a contract between the contractor and a designated person – if contractor is a person other than individual or Hindu undivided family' },
  { code: '1026', section: '393(1) [Table: Sl. No. 6(iii).D(a)]', nature: 'Any sum by way of–– (a) fees for technical services (not being a professional services); or (b) royalty in the nature of consideration for sale, distribution or exhibition of cinematographic films; or (c) payee, engaged only in the business of operation of call centre' },
  { code: '1027', section: '393(1) [Table: Sl. No. 6(iii).D(b)]', nature: 'Any sum by way of–– (a) fees for professional services; or (b) any sum referred to in section 26(2)(h)' },
  { code: '1028', section: '393(1) [Table: Sl. No. 6(iii).D(b)]', nature: 'Any sum by way of remuneration or fees or commission by whatever name called, other than those on which tax is deductible under section 392, to a director of a company' },
  { code: '1029', section: '393(1) [Table: Sl. No. 7]', nature: 'Any dividends (including on preference shares) declared.' },
  { code: '1030', section: '393(1) [Table: Sl. No. 8(i)]', nature: 'Any sum under a life insurance policy, including the sum allocated as bonus on such policy, other than the amount not includible in the total income under Schedule II [Table: Sl. No. 2]' },
  { code: '1031', section: '393(1) [Table: Sl. No. 8(ii)]', nature: 'Any sum for purchase of any goods' },
  { code: '1033', section: '393(1) [Table: Sl. No. 8(iv)]', nature: 'Any benefit or perquisite, whether convertible into money or not, arising from business or the exercise of a profession of any resident.' },
  { code: '1034', section: '393(1) [Table: Sl. No. 8(iv)] Note 6', nature: 'Benefits or perquisites of business or profession where such benefit is provided in kind or where part in cash is not sufficient to meet tax liability and tax required to be deducted is paid before such benefit is released' },
  { code: '1035', section: '393(1) [Table: Sl. No. 8(v)]', nature: 'Sale of goods or provision of services by an e-commerce participant, facilitated by an e-commerce operator through its digital or electronic facility or platform. - any e commerce operator' },
  { code: '1037', section: '393(1) [Table: Sl. No. 8(vi)]', nature: 'Any sum by way of consideration for transfer of a virtual digital asset by other than Individual or Hindu Undivided Family.' },
  { code: '1038', section: '393(1) [Table: Sl. No. 8(vi)] Note 6', nature: 'Any sum by way of consideration, whether in cash or in kind or partly in cash and partly in kind, for transfer of a virtual digital asset.' },
  { code: '1058', section: '393(3) [Table: Sl. No. 1]', nature: 'Any income by way of winnings (other than winnings from Sl. No. 2 of the table at section 393(3)) from–– (a) any lottery; or (b) crossword puzzle; or (c) card game and other game of any sort; or (d) gambling or betting of any form or nature whatsoever' },
  { code: '1059', section: '393(3) [Table: Sl. No. 1] Note 2', nature: 'Any income by way of winnings (other than winnings from Sl. No. 2 of the table at section 393(3)) from–– (a) any lottery; or (b) crossword puzzle; or (c) card game and other game of any sort; or (d) gambling or betting of any form or nature whatsoever where consideration, is made in kind or cash is not sufficient to meet the tax liability and tax has been paid before such winnings are released' },
  { code: '1060', section: '393(3) [Table: Sl. No. 2]', nature: 'Any income by way of winnings from online game.' },
  { code: '1061', section: '393(3) [Table: Sl. No. 2] Note 2', nature: 'Any income by way of winnings from online games, is made in kind or cash is not sufficient to meet the tax liability and tax has been paid before such winnings are released' },
  { code: '1062', section: '393(3) [Table: Sl. No. 3]', nature: 'Any income by way of winnings from any horse race.' },
  { code: '1063', section: '393(3) [Table: Sl. No. 4]', nature: 'Any income, credited or paid to a person, who is or has been stocking, distributing, purchasing or selling lottery tickets, by way of commission, remuneration or prize (by whatever name called) on such tickets' },
  { code: '1064', section: '393(3) [Table: Sl. No. 5.D(a)]', nature: 'Payment of certain amounts in cash by bank/ post office / co-operative society to a deductee being a co-operative society' },
  { code: '1065', section: '393(3) [Table: Sl. No. 5.D(b)]', nature: 'Payment of certain amounts in cash by bank/ post office / co-operative society to a deductee being a person other than co-operative society' },
  { code: '1066', section: '393(3) [Table: Sl. No. 6]', nature: 'Any amount referred to in section 80CCA(2)(a) of the Income-tax Act, 1961 (43 of 1961).' },
  { code: '1067', section: '393(3) [Table: Sl. No. 7]', nature: 'Any sum in the nature of salary, remuneration, commission, bonus or interest paid to a partner of the firm or credited to his account (including capital account).' },
];

const BY_CODE = new Map(FORM_140_SECTION_CODES.map((c) => [c.code, c]));

export function form140Section(code: string): Form140SectionCode | undefined {
  return BY_CODE.get(code.trim());
}
