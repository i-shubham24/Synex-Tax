/**
 * Section and collection codes from Protean's 1961 Act file formats (Annexure 2), used to read
 * statements for periods up to 31 March 2026:
 *   24Q Q1 to Q3 v6.3, 26Q v7.8, 27Q v7.5, 27EQ v6.9 (published 27 May 2025).
 * They are kept to recognise codes in imported history; SynexTax does not write 1961 statements.
 */
export type LegacyForm = '24Q' | '26Q' | '27Q' | '27EQ';

export const LEGACY_FORMS: readonly LegacyForm[] = ['24Q', '26Q', '27Q', '27EQ'];

export const LEGACY_SECTION_CODES: Record<LegacyForm, ReadonlySet<string>> = {
  '24Q': new Set(['92A', '92B', '92C', '94P']),
  '26Q': new Set(
    '193 194 94A 94B 4BP 4BB 94C 94D 4EE 94F 94G 94H 94I 4IA 4IB 94L 4DA 4BA 2AA LBB 9IA LBC 4IC 94N 94K 4JA 4JB BA1 BA2 4NF 94O 94Q 94R 4RP 94S 4SP 9BA 4AP 4NC 9FT 94T'.split(' '),
  ),
  '27Q': new Set('94E 195 96A 96B 96C 96D 4LB 4LC LC1 LC2 LC3 4LD 2AA 4BA LBB LBC 94N BA1 BA2 BA3 4NF 6DA 94B 4BP 9BA 4AP 4BB 4NC 9FT 94T'.split(' ')),
  '27EQ': new Set('A B C D E F G H I J K L M N O P Q R T MA MB MC MD ME MF MG MH MI MJ'.split(' ')),
};

export const isLegacyForm = (form: string): form is LegacyForm => (LEGACY_FORMS as readonly string[]).includes(form);
