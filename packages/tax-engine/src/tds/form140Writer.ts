import {
  writeTdsStatement,
  type StatementAddress,
  type StatementChallanInput,
  type StatementInput,
  type StatementParty,
  type StatementPayee,
  type WriteIssue,
} from './statementWriter.js';

/**
 * Form 140 (non-salary TDS, residents) statement writer. The shared writer handles Forms 140,
 * 144 and 143; these names stay for callers that only deal with Form 140.
 */
export type Form140Address = StatementAddress;
export type Form140Deductee = StatementPayee;
export type Form140Challan = StatementChallanInput;
export type Form140Party = StatementParty;
export type Form140Input = Omit<StatementInput, 'form'>;
export type { WriteIssue };

export function writeForm140(input: Form140Input): { text: string; issues: WriteIssue[] } {
  return writeTdsStatement({ ...input, form: '140' });
}
