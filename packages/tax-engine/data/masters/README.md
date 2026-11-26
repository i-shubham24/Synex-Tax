# Statutory master lookup tables (DRAFT, UNVERIFIED)

Founder checklist item 16. Every file here has `"status": "DRAFT_UNVERIFIED"` at the top level and must be checked by a CA before any code reads it. Compiled on 26 Nov 2026.

Ground rules used:

- Values come first from the existing code (each entry's `sources` gives the file and line), then from web pages read on 26 Nov 2026. Nothing was downloaded.
- A rate, threshold or code that could not be confirmed from the code or a page actually read is `null`, with `needs_verification: true` and a note.
- Rates are base rates in percent, before surcharge and cess.
- The official ITD pages (`incometaxindia.gov.in/w/tds-rates`, `/w/section-393-5`, `/w/tds-rates-1`) returned HTTP 403 to the fetch tool, so they could not be re-read. The code (`src/tds/rates2025.ts`) says it read them on 21 Nov 2026.
- Pages marked "secondary" are not government sources. Treat them as leads, not authority.

## Files

### tds-sections-2025.json

Income-tax Act, 2025: TDS under s.392 and s.393 and TCS under s.394. Each entry gives the four-digit Protean code, the Table serial, rate, threshold, payee type and the 1961 section it replaces. Covers 88 codes: Form 138 (4), Form 140 (29 plus 11 shared with Form 144), Form 144 (19), Form 143 TCS (25).

Sources:

- Code: `packages/tax-engine/src/tds/form140Codes.ts`, `rates2025.ts`, `form138Annexures.ts`, `form144and143Annexures.ts`, `dualActRecon.ts`, `src/assistant/sections.ts`.
- https://blog.tdsman.com/2026/03/tds-tcs-rate-chart-fy-2026-27/ (secondary). Read 26 Nov 2026. This is the only page read for Form 144 rates (1039 to 1057) and TCS rates (1068 to 1092).
- Official, could not be read (403): https://www.incometaxindia.gov.in/w/tds-rates and https://www.incometaxindia.gov.in/w/section-393-5. CA to read in a browser.
- Founder to fetch (xlsx, not downloaded): the Protean file formats for Forms 138, 140, 143 and 144 at https://tinpan.proteantech.in/downloads/e-tds (the code copied from "Form Number 140 - 26Q - Q1 to Q4_22072026.xlsx" and the matching 143 and 144 files).

Verified by: ____ (CA), date ____

### tds-sections-1961.json

Income-tax Act, 1961, for FY 2025-26 and earlier. It has two parts:

- `sections`: a 48-row rate chart for FY 2025-26.
- `protean_codes`: 88 codes used in Protean's 24Q, 26Q, 27Q and 27EQ formats. `mapping_basis` says how each code's section was found: from the code, from tdsman, inferred from the code's spelling, or unknown.

Sources:

- Code: `packages/tax-engine/src/tds/form1961Codes.ts:11` (Protean 1961 formats published 27 May 2025) and `dualActRecon.ts:23`.
- https://taxguru.in/?p=957899 "TDS Rate Chart For F.Y. 2025-26", 10 Apr 2025 (secondary). Read 26 Nov 2026.
- https://www.caclubindia.com/articles/tds-rate-chart-for-fy-2025-26-ay-2026-27-53169.asp, 24 Feb 2025 (secondary). Read 26 Nov 2026.
- https://blog.tdsman.com/2026/03/tds-tcs-rate-chart-fy-2026-27/ (secondary): the 2025 Act equivalents, and the 27EQ letter mapping. Read 26 Nov 2026.
- Founder to fetch (xlsx/pdf): the Protean 1961 file formats (24Q Q1 to Q3 v6.3, 26Q v7.8, 27Q v7.5, 27EQ v6.9) at https://tinpan.proteantech.in/downloads/e-tds. Annexure 2 of each settles the 25 `UNKNOWN` and 26 `NAME` code mappings.

Verified by: ____ (CA), date ____

### deductor-types.json

The 16 Protean deductor and collector category codes (A, S, D, E, G, H, L, N, K, M, P, T, J, B, Q, F), with the state and ministry rules from the code.

Sources:

- Code: `packages/tax-engine/src/tds/form140Annexures.ts:64` (Protean Form 140 Annexure 4).
- https://learn.microsoft.com/en-us/previous-versions/dynamics/ax-2012/reference/jj795822(v=ax.60) (TypeOfDeductor_IN, 2014, secondary). Read 26 Nov 2026. All 16 letters agree with the code.
- https://docs.oracle.com/cd/E16582_01/doc.91/e23355/txt_file_field_26q.htm (secondary). Read 26 Nov 2026. It confirms the 8 government letters.

Verified by: ____ (CA), date ____

### form144-remittance-codes.json

The 16 nature-of-remittance codes for Form 144 (Annexure 9), and which section codes allow each one.

Sources:

- Code: `packages/tax-engine/src/tds/form144and143Annexures.ts:79` and `:100`. These are copied verbatim from Protean "Form Number 144-27Q - Q1 to Q4_22072026.xlsx", read 21 Nov 2026.
- Founder to fetch: the Form 144 xlsx at https://tinpan.proteantech.in/downloads/e-tds, to re-check the list. The 1961 Act 27Q nature-of-remittance list (27Q format v7.5) is not in the code and was not read.

Verified by: ____ (CA), date ____

### gst-rates-hsn-chapters.json

A starter only:

- The rate slabs (Schedules I to VII of Notification 9/2025-CT(Rate)).
- 11 chapter or heading entries and 2 SAC examples that were read on a page.

It is NOT the HSN master. Do not assign item rates from it.

Sources:

- Code: `packages/tax-engine/src/gst/salesRegister.ts:45` (GST_RATES) and `packages/db/migrations/0008_billing_and_dlt.sql:106` (SAC 998314 comment).
- https://www.caclubindia.com/articles/gst-notification-no-92025-complete-hsnwise-rate-schedule-effective-from-september-22-2025-54119.asp (secondary). Read 26 Nov 2026.
- https://blog.saginfotech.com/central-tax-rate-notification-9-2025-new-gst-rates-hsn-codes (secondary). Read 26 Nov 2026.
- https://www.caclubindia.com/articles/footwear-gst-rate-51094.asp (secondary). Read 26 Nov 2026.
- https://www.caclubindia.com/news/gst-rate-on-apparel-rationalised-18-percent-tax-for-garments-above-rs-2500-25945.asp (secondary). Read 26 Nov 2026.
- https://www.taxscan.in/top-stories/56th-gst-council-meeting-know-major-gst-rate-changes-proposed-for-goods-and-services-1431908 (secondary, paywalled after the first section). Read 26 Nov 2026.
- https://cbic-gst.gov.in/gst-goods-services-rates.html was read on 26 Nov 2026. It only points to https://taxinformation.cbic.gov.in.
- Founder to fetch:
  - The full text of Notification No. 9/2025-Central Tax (Rate), 17 Sep 2025, and its amendments (including 19/2025), and No. 10/2025-Central Tax (Rate) (exempt goods). These are PDFs on https://taxinformation.cbic.gov.in and https://gstcouncil.gov.in/cgst-rate-notification.
  - The PIB release for the 56th GST Council meeting, Annexure I (HSN-wise changes), at https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/sep/doc2025917639401.pdf (PDF).

**Official HSN master (about 20,000 rows):** get it from the GST portal's Search HSN page, Services > User Services > Search HSN/SAC (https://services.gst.gov.in/services/searchhsnsac), using the "Download HSN in Excel Format" link. Secondary sources also mention a "Download HSN Codes List" button in GSTR-1 Table 12. Founder to fetch; it was not downloaded here. The exact file name was not confirmed.

Verified by: ____ (CA), date ____

## Known conflicts (also noted in the entries)

1. **Code 1028 (director fees).**
   - `src/tds/form140Codes.ts:39` (Protean) and tdsman give Table 6(iii).D(b).
   - `src/tds/rates2025.ts:60` and `src/tds/dualActRecon.ts:28` give Table 6(iii)(c).
   - `dualActRecon.ts:28` also maps it to 1961 "194J(1)(c)" with Protean code "94J". tdsman says 194J(b), and 94J is not in the 1961 26Q code list (`form1961Codes.ts:14`).
2. **Code 1033 (business perquisite).** `dualActRecon.ts:35` says there is no threshold. `rates2025.ts:64` and tdsman say Rs 20,000.
3. **Code 1037 (virtual digital asset).** `dualActRecon.ts:36` says there is no threshold. `rates2025.ts:67` says Rs 10,000 or Rs 50,000 depending on the payer, and tdsman says Rs 10,000.
4. **Code 1012 (compensation on acquisition).** tdsman maps it to 194IA. `src/assistant/sections.ts:53` says 194LA, and tdsman's own reply to a reader agrees.
5. **Code 1061 (online game winnings in kind).** tdsman shows a Rs 10,000 threshold. `rates2025.ts:72` says none.
6. **194D (FY 2025-26).** caclubindia shows 5% for payees that are not companies. taxguru and code 1005 show 2%.
7. **194O (FY 2025-26).** taxguru shows 10%. caclubindia and tdsman show 0.1%.

## Resolved in code (26 Nov 2026)

- 1028: `rates2025.ts` now gives Table 6(iii)(b), matching Protean's code list; `dualActRecon.ts` maps it to 1961 section 194J(1)(ba), Protean code 4JB (94J is not a current 26Q code).
- 1033 and 1037: `dualActRecon.ts` no longer keeps its own thresholds; it reads section, rate and threshold from `rates2025.ts` (1033 is now Rs 20,000 aggregate, 1037 "not checked, turns on who pays"). Pinned by a test in `dualActRecon.test.ts`.
