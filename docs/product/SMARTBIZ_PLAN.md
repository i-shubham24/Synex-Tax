# Beyond SmartBiz: the plan

How SynexTax reaches every SmartBiz feature and then moves past it. Written 23 Nov 2026.

## Method

Clean room. Everything about SmartBiz comes from its public pages as a visitor sees them
(new.smartbizindia.com: home, Smart Tax, Smart e-TDS, Smart GST, Smartbiz Assist, Smartbiz AI,
Updates), never from its software, files or code. Each feature is then built our own way and
checked against their published claim, line by line, in the checklist at the end. Their brand,
screens and wording are not copied.

Three steps for every item: **study** (their claim, in our words), **build** (our version, with
tests against the Department's or Protean's own formats), **check** (does our version do what
their line promises, and better).

## Where we stand

Level or ahead on Smart e-TDS, Smart GST (preparation), Smartbiz Assist and Smartbiz AI, except
where government or provider access is needed (see `COMPETITOR_SMARTBIZ.md` section 9). The
largest remaining gap is **Smart Tax**, their anchor product, which this plan studies in full for
the first time.

## 1. Smart Tax: what they have and what we have

| Their feature | SynexTax today | Gap | Needs |
|---|---|---|---|
| ITR-1 to ITR-6, JSON checked against the schema | ITR-1 to ITR-4, schema-checked | ITR-5 (firms, LLPs, AOPs), ITR-6 (companies) | Buildable: schemas are published |
| Upload and e-verify on the portal | File written, uploaded by the user | Direct upload, e-verification | ERI registration |
| Form chosen automatically | Form picker suggests ITR-1 to ITR-4 | Extend to ITR-5 and ITR-6 | Buildable |
| Updated returns (ITR-U), tax under 140B | None | ITR-U with 140B tax and additional tax | Buildable: schema published |
| ITR-V and intimations downloaded | None | Read the ITR-V and 143(1) intimation PDFs the user downloads | Buildable as an import; download needs ERI |
| Paper-form PDF and print preview | Computation on screen | Printable computation and return summary (labelled as our print, not a Department form) | Buildable |
| Five assessment years side by side | One year | Year switch and a five-year view per client | Buildable |
| AIS and TIS from the portal or AIS JSON, differences shown | None | Import the AIS JSON the client downloads; match every AIS line to the return and flag gaps | Buildable (JSON import); portal fetch needs ERI |
| Form 168 (26AS) from TRACES | None | Import the 26AS text or PDF the user downloads; match TDS credits | Buildable as an import; sample file needed |
| Earlier returns from the portal or offline JSON | None | Import last year's ITR JSON; carry forward losses, schedules and client details | Buildable |
| Challans pulled into prepaid taxes | Entered by hand | From the AIS JSON import | Buildable with AIS import |
| Form 130 (16) Part B from the employer's PDF | None | Read the TRACES-generated Form 16 PDF text (pdf.js, already in the app) | Buildable; sample PDFs needed |
| Capital gains from 16 broker and registrar formats (Zerodha, Groww, CAMS, KFintech) | Typed sale by sale | Importers for the main formats, with 31 Jan 2018 values | Buildable; one sample statement per format needed |
| Bulk download of three years of ITR, ITR-V, AIS, 26AS PDFs | None | Bulk import and filing per client | Download needs ERI; import is buildable |
| Salary, house property, business (44AD, 44ADA, 44AE) | Built | None | |
| Depreciation block by block, 180-day rule, additional depreciation | Blocks and 180-day rule in ITR-3 | Additional depreciation | Buildable |
| Capital gains with indexation and 112A grandfathering | 111A, 112A, 112 | Indexation choice for pre-23 July 2024 property, NSE and fund value sheets | Buildable; value sheets are public |
| Exemptions 54, 54F, 54G, 54EE and the 12.5% comparison | None | Exemption schedules and the comparison | Buildable |
| Virtual digital assets | None | Schedule VDA at 30% under 115BBH | Buildable |
| Share in firm, speculation, clubbing, agricultural income | None | Schedules IF, speculation, SPI, EI | Buildable |
| Balance sheet, P&L, Schedule AL | Balance sheet and P&L in ITR-3; returns above 50 lakh refused | Schedule AL | Buildable |
| ICDS, Schedule FA, ESR, 80-IA, 80-IB, 80-IC, 10AA | None | These schedules | Buildable; FA is the most asked for |
| Surcharge with marginal relief, cess, 87A | Built | None | |
| 234A, 234B, 234C instalment by instalment, 234F | Built; 234C entered for book cases | 234C computed from the advance tax paid | Buildable |
| Chapter VI-A 80C to 80U | Main sections | The rest of 80C to 80U | Buildable |
| Set-off and carry forward with a brought-forward loss schedule | Current year only; brought-forward refused | Schedule BFLA and CFL across years | Buildable with earlier-return import |
| AMT on book profit and AMT credit register | None | 115JC, 115JD with a year-wise credit register | Buildable |
| Relief under 89A | None | Form 10-EE based relief | Buildable |
| Client master with portal login and DSC | Client master, DSC by token | We never store portal passwords (by design) | Not planned for passwords |
| Filing status refreshed from the portal in bulk | Task and return status kept in SynexTax | Portal status refresh | ERI |
| Assessee register, file codes, representatives | Client groups | File codes, representative assessees | Buildable |
| Challans for advance and self-assessment tax created online | Advance tax calculator | Pre-filled challan values ready to paste into e-Pay Tax | Buildable (values); online creation needs portal |
| Notes to return, a document folder per client | Document folders, messages | Notes to return on each return | Buildable |
| "Import from previous year" on schedules | None | Carry forward recurring schedules | Buildable with earlier-return import |
| Multi-user on SQL Server, local or online | Cloud, multi-user, role and client rights | Local install | Not planned |
| Cloud backup of the yearly database | Hosted database with point-in-time recovery | None | |

## 2. Other SmartBiz products, still open

| Product | Gap | Plan |
|---|---|---|
| Smart GST | e-filing, GSTR-2 download, ledgers, challan history, filed cases | GSP contract; until then a portal-ready JSON for every return (done for GSTR-1 and 3B workings) |
| Smart e-TDS | e-filing, CSI download, conso and certificate download, compliance inbox, bulk PAN | TRACES-sanctioned route and Protean registration; imports of the files users download (done for conso, certificates) |
| Smart e-TDS | Form 138 fourth quarter | Protean has not published the format (checked 23 Nov 2026) |
| Smart Billing | GST invoices with stock register, GSTR-1 and GSTR-2 from them | A light billing module for firms' small clients: invoices, e-invoice IRN, stock register, flowing straight into GSTR-1 (they cannot do e-invoice) |
| Smart My Account | Single-entry VAT accounts | Not planned (VAT is limited to petroleum and liquor) |
| Smartbiz Assist | Android app with push | Installable web app now; Play Store app with push later (Play Console account) |

## 3. Build order

Each phase ends with every suite green, a production build, a browser check and the checklist
lines for that phase ticked.

**Phase 1, ITR imports (the switch from Smart Tax).** AIS and TIS JSON import with a line-by-line
match to the return; earlier-year ITR JSON import with carry forward of losses and schedules;
Form 16 PDF import; 26AS import (once a sample is in hand); broker capital gains importers for
Zerodha, Groww, CAMS and KFintech (once samples are in hand). These remove most typing, which is
why practices stay on Smart Tax.

**Phase 2, ITR coverage.** ITR-5 and ITR-6 from the published schemas; ITR-U with 140B; exemptions
54, 54F, 54G, 54EE with the 12.5% comparison; VDA; share in firm, speculation, clubbing,
agricultural income; Schedule AL and FA; 234C computed for book cases; the rest of Chapter VI-A;
additional depreciation; AMT and its credit register; 89A relief.

**Phase 3, ITR practice.** Five assessment years per client with a year switch; printable
computation and return summary; notes to return; assessee register and file codes; challan values
ready for e-Pay Tax; import from previous year on every schedule.

**Phase 4, outside access, as each arrives.** ERI (direct ITR upload, e-verification, AIS fetch,
filing status), GSP (GST filing, 2B and ledgers), TRACES route and Protean PAN verification
(TDS filing help, downloads, bulk PAN), AWS and Meta accounts (mail, WhatsApp, files, assistant),
Play Console (Android app).

**Phase 5, billing light.** Invoices with e-invoice IRN and e-way bills, a stock register, and
GSTR-1 from the invoices without retyping.

## 4. Far ahead: what SmartBiz cannot do

These turn parity into a lead. Each builds on what SynexTax already has and their installed
model cannot match.

1. **One client, one picture.** AIS, 26AS, GSTR-1, GSTR-2B, the TDS registers and the bank
   statement reconciled against each other for the same client and year: turnover in GST against
   AIS and the books, TDS deducted on the client against 26AS, purchases in 2B against the
   purchase register and the bank. Every difference becomes a task. SmartBiz keeps these in
   separate products and databases.
2. **Notices before they arrive.** The same cross-checks run the Department's usual mismatch tests
   (AIS against return, GSTR-1 against 3B against 2B, TDS short payment) so the CA fixes the gap
   before a notice. When a notice does arrive, the assistant drafts the reply from the client's
   own reconciled data with checked citations.
3. **Review built in.** Maker-checker on every return type, a review checklist per form, the
   hash-chained audit trail and DSC sign-off: partners see what changed since they last looked.
4. **The client does their part.** The client portal collects documents, answers questions on
   the return (rent, donations, capital gains) and approves the computation before filing, with
   every answer logged. SmartBiz sends files; SynexTax gets answers.
5. **Anywhere, any device, no install.** Partners approve from a phone; staff work from home;
   updates arrive without service packs.
6. **Firm health at a glance.** Workload per staff member, overdue work, fees outstanding, and
   compliance risk across every client, from data the firm already has in SynexTax.
7. **Open to the firm's other tools.** A documented API and exports for Tally, Zoho and Excel, so
   the firm is never locked in.
8. **Trust as a feature.** India-only hosting, DPDP-compliant consent and PII handling, client data
   isolated in the database, no stored portal passwords. A written security page firms can show
   their own clients.

## 5. Check against SmartBiz, line by line

Ticked when built, tested and checked in the browser.

| SmartBiz line (their claim, in our words) | Status |
|---|---|
| e-TDS: Forms 138, 140, 143, 144 statements, both Acts | Done (138 Q4 waits on Protean) |
| e-TDS: corrections C1, C2, C3, C5 from the conso file, drafts, versions, revert | Done; field-by-field check against Protean v1.2 in progress |
| e-TDS: certificates for one PAN, a list or all, emailed and on WhatsApp | Sending done; download needs TRACES route |
| e-TDS: salary TDS both regimes, Form 124, Form 121 register | Done |
| e-TDS: section rates and thresholds, 398 interest, 427 fee, health dashboard | Done |
| e-TDS: past FVU and TRACES files imported, payees carried forward | Done |
| GST: GSTR-1, 3B, 4, ITC-04 prepared | Done (filing needs GSP) |
| GST: 3B against GSTR-1 and 2A, yearly summary | Done with 2B instead of 2A |
| Assist: checklists, phone upload, reminders on day 1, 5, 10, gap dashboard | Done |
| Assist: document folders with versions, previews, open log, fee lock | Done |
| Assist: tasks list and board, calendar, client messages | Done |
| Assist: staff invites, rights by screen and client, audit log | Done |
| Assist: backup agent for Tally, Busy, Marg, Zoho, Vyapar | Done |
| Assist: Android app | Open (Phase 4) |
| AI: questions with 2025 and 1961 sections, notice replies, deeds, calculators, daily feed | Done (model needs Bedrock) |
| AI: bank statements from PDF and scans, ledgers | Done for statements; ledger scrutiny open |
| Smart Tax: ITR-1 to ITR-6 | ITR-1 to ITR-4 done; ITR-5, ITR-6 in Phase 2 |
| Smart Tax: AIS, TIS, 26AS, earlier returns, Form 16, broker statements imported | Phase 1 |
| Smart Tax: exemptions, VDA, AMT, 89A, Schedule FA, AL | Phase 2 |
| Smart Tax: five years, print, ITR-U, notes, assessee register | Phases 2 and 3 |
| Smart Tax: e-filing, e-verify, portal status | Phase 4 (ERI) |
| Billing with stock register | Phase 5 |

## What I need from you

- One real file of each kind, with client details masked if you like: an AIS JSON, a 26AS text
  file, a Form 16 PDF, a TRACES consolidated file, and capital gains statements from Zerodha,
  Groww, CAMS and KFintech. Each turns a Phase 1 importer from "built to the published format" into
  "checked on a real file".
- Decisions on outside access: ERI registration (unblocks most of Smart Tax's portal features), a
  GSP contract, AWS and Meta accounts in India.
