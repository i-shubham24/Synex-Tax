/**
 * Form 138 (salary TDS) annexures, from Protean's "File Format for Form Number 138 Q1 to Q3"
 * (version 1.1/1.2, Tax Year 2026-27 onwards). The Q4 format, which adds the annual salary
 * annexure, has not been published yet.
 */

/** Annexure 2: section codes for employees. */
export const FORM_138_SECTION_CODES: Record<string, { section: string; nature: string }> = {
  '1001': { section: '392', nature: 'Payments made to Government employees other than Union Government employees' },
  '1002': { section: '392', nature: 'Payments made to employees other than Government employees' },
  '1003': { section: '392', nature: 'Payments made to Union Government employees' },
  '1032': { section: '393(1) [Table: Sl. No. 8(iii)]', nature: 'Deduction of tax in case of specified senior citizens' },
};

const ALL_138 = Object.keys(FORM_138_SECTION_CODES).join(',');

/** Annexure 6: reasons for lower or higher deduction. */
export const FORM_138_REASON_FLAGS: Record<string, { description: string; sections: ReadonlySet<string>; panRequired: boolean }> = Object.fromEntries(
  (
    [
      ['A', 'Lower deduction on account of a certificate under section 395(1)', ALL_138, true],
      ['C', 'Deduction at a higher rate on account of non-furnishing of PAN', ALL_138, false],
    ] as Array<[string, string, string, boolean]>
  ).map(([f, description, codes, panRequired]) => [f, { description, sections: new Set(codes.split(',')), panRequired }]),
);
