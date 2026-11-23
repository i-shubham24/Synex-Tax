# Protean correction file check (C1, C2, C3, C5, C9)

Source: Protean correction file formats, version 1.2 (4 Aug 2026), Income-tax Act 2025 forms: Form 138 (Q1 to Q3), 140, 143 and 144. Each spreadsheet has one sheet with File Header (FH, 18 fields), Batch Header (BH, 72), Challan Detail (CD, 30) and Deductee or Collectee Detail (DD, 45). Form 138 has no salary detail records for Q1 to Q3.

Checked against `packages/tax-engine/src/tds/correction.ts`. "Blank" means the spec says "No value should be specified". "Last" means the value from the consolidated (conso) file, that is, the regular or last correction statement.

## Spec text on the correction types

| Type | Spreadsheet title | What the writer puts in it |
| - | - | - |
| C1 | Deductor (excluding TAN) details | Deductor and responsible person changes. FH and BH only. |
| C2 | Deductor (excluding TAN), and/or challan details | Challan changes with no row changes under that challan. Deductor changes too when C2 is chosen (BH field 7 = 1). No DD records (all DD columns for C2 are N.A). |
| C3 | Deductor, and/or challan, and/or deductee details | Row updates (U), row additions (A), PANNOTAVBL, PANAPPLIED or PANINVALID replaced, and challan changes for a challan whose rows change. Deductor changes too when C3 is chosen. |
| C5 | PAN update | A valid PAN replaced by another valid PAN. |
| C9 | Addition of challan | New challans with their rows (mode O). |

So the existing split (challan only in C2, challan plus rows in C3) is consistent with the spec. C3 may also carry a challan change alone (it needs at least one DD row, CD field 5 must be 1 or more), which the writer does by carrying the first row unchanged when C3 is chosen explicitly.

## File Header

| Field | C1 | C2 | C3 | C5 | C9 | Writer |
| - | - | - | - | - | - | - |
| 1 to 10 | Line no, FH, file type (SL1 for 138, NS1 for 140 and 144, TC1 for 143), C, date, sequence, D, TAN, batches (1), utility | same | same | same | same | Matches |
| 11 to 17 | Blank | Blank | Blank | Blank | Blank | Matches |
| 18 conso file hash | 138 and 144: hash of the conso file. 140: no remark. 143: blank | same | same | same | same | Was always blank. Fixed: copied from the conso FH field 18 for 138 and 144, error if missing |

## Batch Header (same on all four forms unless noted)

| Field | C1 | C2 and C3 | C5 | C9 | Writer before | Fixed |
| - | - | - | - | - | - | - |
| 3 batch no | 1 | 1 | 1 | 1 | 1 | |
| 4 challan count | Blank | Count | Count | Count | C1 wrote 0 | C1 blank |
| 6 type | C1 | C2 / C3 | C5 | C9 | ok | |
| 7 Batch Updation Indicator | Blank | 1 if BH deductor details change, else 0 | Blank | Blank | C2 blank, C3 always 0 | C2 and C3 write 0, or 1 with the deductor block when deductor edits ride along |
| 8, 9 tokens | Original, previous | same | same | same | ok | |
| 12 last TAN | TAN | TAN | TAN | TAN | ok | |
| 13 TAN | TAN | TAN | Blank | TAN | ok | |
| 15 deductor PAN | Given | Given only if indicator 1 | Blank | Blank | ok | |
| 16 to 18 AY, tax year, quarter | Last | Last | Last | Last | ok | |
| 19 name | New | Last, or new if indicator 1 | Last | Last | ok | |
| 20 country | Given | If indicator 1 | Blank | Blank | ok | |
| 21 to 25 address, 27 PIN, 28 email, 29, 30 phone | Given | If indicator 1 | Blank | Blank | ok | |
| 26 state | Given | Given always | Given | Given | ok | |
| 31 Filler 1 | Blank | Blank | Blank | Blank | C1 wrote Y/N "address changed" | Blank |
| 32 deductor type | New | Last, or new if indicator 1 | Last (138, 144: "same as last") | Last | ok | |
| 33 to 45 responsible person | Given | If indicator 1 | Blank | Blank | ok | |
| 46 Filler 3 | Blank | Blank | Blank | Blank | C1 wrote Y/N "address changed" | Blank |
| 47 batch total | Blank | Sum of CD field 12 | Blank | Sum of CD field 12 | ok | |
| 48 to 52 | Blank | Blank | Blank | Blank | C1 copied conso values | Blank |
| 53 last deductor type | Mandatory, last | If indicator 1, last; else blank | Blank | Blank | C1 ok | Also written with indicator 1 |
| 54 state name (govt) | Per type | If indicator 1 | Blank | Blank | ok | |
| 55, 56 Fillers 5, 6 | Blank | Blank | Blank | Blank | C1 copied conso values | Blank |
| 57, 58 ministry | Per type | If indicator 1 | Blank | Blank | ok | |
| 59 responsible PAN | Given | Given | Given | Given | ok | |
| 60 to 67 Fillers 7 to 14 | Blank | Blank | Blank | Blank | C1 copied conso values | Blank |
| 68 AIN | Govt only | If indicator 1 | Blank | Blank | ok | |
| 69 GSTIN | Given | Given | Given | Given | ok | |
| 70 to 72 | Blank | Blank | Blank | Blank | ok | |

## Challan Detail (identical text on all four forms; C1 is N.A, no CD records)

| Field | C2 | C3 | C5 | C9 | Writer before | Fixed |
| - | - | - | - | - | - | - |
| 4 record no | Last, increasing | Last, increasing | Last, increasing | Next after the last | ok | |
| 5 row count | Blank | 1 or more | 1 or more | 0 or more | C2 wrote 0 | C2 blank |
| 6 nil | Last | Last | Last | Y/N | ok | |
| 7 Challan Updation Indicator | Blank | 1 if CD changes, else 0 | Blank | Blank | C2 wrote 1 | C2 blank |
| 8 to 11 tax, interest, fee, others | Given | If indicator 1, else blank | Blank | Given | ok | |
| 12 total | Given | Given | Blank | Given | ok | |
| 13 mode | Given | Given | Given | Given | ok | |
| 14, 16, 18, 20 last BSR, serial, date, total | Last | Last | Last | Blank | ok | |
| 15, 17, 19 BSR, serial, date | Given | New if 1, last if 0 | Blank | Given | ok | |
| 21, 22 deposited and deducted | Blank | Deltas (A rows plus U row changes) | Blank | Sums | ok | |
| 23 minor head | Given | If indicator 1, else blank | Blank | Given (blank for nil) | ok | |
| 24, 25 interest and others allocation | Blank | Given (values of fields 9 and 11) | Blank | Given | C2 filled them; C3 with indicator 0 left them blank | C2 blank; C3 always filled |
| 26 to 30 | Blank | Blank | Blank | Blank | ok | |

C9 field 19 for a nil challan must be the last day of the quarter: added as a check.

## Deductee / collectee detail

C1 and C2: N.A, no DD records (writer matches).

Fields every form agrees on:

| Field | C3 | C5 | C9 | Writer |
| - | - | - | - | - |
| 4 record no | U: last, increasing; A: next after the last | Last, increasing | Running serial | ok |
| 5 challan ref | CD field 4 | CD field 4 | CD field 4 | ok |
| 6 mode | F if conso says F, U update, A add | Blank | O | ok |
| 7 last PAN | U: last; A: blank | Blank | Blank | ok |
| 8 PAN | Current or corrected | New valid PAN | PAN or literal | ok |
| 18 deposited Y/N | Y or N | Blank | Blank | C9 wrote Y/N. Fixed: blank |
| 24, 25 deducted, deposited | Must be equal (U rows with reason C excepted) | Blank | Must be equal | Form 140 allowed them to differ. Fixed: equal on every form |
| 26, 42 last deducted, deposited | U: last; A: blank | Last | Blank | ok |
| 32 reason, 33 certificate | As last / per Annexure 6 | Blank | Per Annexure 6 | ok |

Fields that differ by form (blank lists are 1-based field numbers, now in `DD_BLANK`):

| Form | C3 blank | C9 blank | Rate (28) | Other |
| - | - | - | - | - |
| 138 | 10 to 14, 16, 17, 21 to 23, 28, 30, 31, 34 to 41, 43 to 45 | 7, 10 to 14, 16 to 18, 21 to 23, 26, 28, 30, 31, 34 to 45 | None | Field 29 date of deposit: C3 given, C9 equal to challan date (C9 was blank when no tax; fixed) |
| 140 | 10 to 14, 16, 17, 21, 29, 30, 34 to 41, 43 to 45 | 7, 10 to 14, 16 to 18, 21 to 23, 26, 29, 30, 34 to 45 | 4 decimals; 0 for codes 1059, 1034, 1038, 1061 (added) | 22, 23 cash withdrawal; 31 Form 121 UIN |
| 143 | 10, 16, 17, 21 to 23, 28 to 31, 34 to 41, 43 to 45 | 7, 10, 11, 13, 14, 16 to 18, 21 to 23, 26, 28 to 31, 34 to 45 | None (writer wrote one; fixed) | 11 to 14 and 34 to 36 collectee fields |
| 144 | 10, 11, 13, 29, 34 to 36, 40, 43 to 45 | 7, 10, 11, 13, 14, 18, 22, 23, 26, 29, 30, 34 to 36, 40, 42 to 45 | 4 decimals; 0 for 1059, 1061 (added) | C5 must also carry field 12 (status, Annexure 8): added |

C3 U rows were copied from the conso row as is, so any value the conso carried in a remark, filler or hash field reached the file. They are now cleared per the lists above.

## Left ambiguous by the spec

1. Form 143 BH remarks for C3, C5 and C9 are shifted one row from field 20 to 26 (field 25 "District" carries the state remark, 26 "State" the PIN remark). Field names and the C1 column match the other forms, so the writer keeps the state in field 26.
2. CD fields 12, 24 and 25 in a C3 with indicator 0: the text says "mention" without a condition while fields 8 to 11 must be blank. The writer gives the challan total and the last interest and others.
3. Form 140 DD field 31 (Form 121 UIN) reads "mandatory" for every A, U and O row, and field 33 (certificate) "mandatory for mode A or U". Both look copied from conditional rules; the writer only requires the certificate for reason A and does not force a UIN.
4. DD field 32 says to quote the reason "as per the last statement irrespective of mode", but also only forbids changing reason C. The writer allows changes except for C.
5. C9 DD field 4 is a "running serial number"; the writer continues after the last row number in the conso (as C3 mode A does). 138 adds "in current statement", which could mean numbering from 1.
6. BH field 32 refers to "the note below Annexure 4" for a change of deductor type; no such note is in any of the four spreadsheets.
7. Rate for the zero-rate codes is written as "0.00" in the remark but rates use 4 decimals; the writer writes 0.0000.
8. Form 140 FH field 18 has no remark at all (143 says blank, 138 and 144 say the hash); the writer leaves it blank for 140.
