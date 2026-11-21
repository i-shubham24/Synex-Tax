# SmartBiz vs SynexTax: gaps and next build

Read on 20 Nov 2026 from smartbizindia.com/smart_etds.aspx and new.smartbizindia.com (home, Smart e-TDS, Smart GST, Smartbiz Assist, Smartbiz AI, Updates, Utilities). SmartBiz is in Amritsar (0183 phone code), claims 20+ years and 20,000+ CAs, advocates and companies, and sells 7 products. No public pricing.

## 1. Where they are ahead

| Area | SmartBiz has | SynexTax today | Gap |
|---|---|---|---|
| ITR | Smart Tax: ITR-1 to 6, AIS/TIS/26AS fetch, both regimes, e-verify | None | Their anchor product. CAs buy suites |
| TDS migration | Past filings imported from FVU .txt or TRACES .tds, whole folders; payees carried forward; year locked once filed | Client master import only | Blocks switching |
| TDS corrections | Built from the TRACES conso file: C1, C2, C3, C5, drafts, versions, revert | Planned (conso diff editor) | P1 in spec, not built |
| Certificates | Form 130/131/133 for one PAN, a list or all; signed PDFs; email and WhatsApp to payees | Planned | High daily value |
| TDS checks | Health Dashboard: late fee, unconsumed and over-consumed challans, defaults; interest u/s 398; Form 121 register; bulk PAN checks | Radar tiles, maths in tax-engine | Needs one TDS health view |
| Salary TDS | Section 392 both regimes, 87A relief, VI-A, HRA, perquisites, previous employer, Form 124 | Not built | Needed for Form 138 |
| Reports | Deposit and payee registers, default analysis, Form 26 clause 34 data, Form 24G | Few | Partners print these |
| Practice | Assist: document checklists, client upload by phone, auto reminders day 1/5/10, gap dashboard, tasks, calendar, fee ledger, documents locked until fee paid, Android app, Tally/Busy/Marg backup agent | Portal and billing are Phase 2/3 | They already ship it |
| AI | Q&A with 2025/1961 sections, notice reply drafts, bank statement to ledgers, deeds, daily notification feed | None | Fast-growing expectation |
| Workflow | Ctrl+K, function keys, What's New log, remote support | Ctrl+K only | Cheap wins |

Their portal automation ("TRACES automation", "e-filing prepared for you") should not be copied as-is: we never store portal passwords or run credential-storing scrapers. Equivalent value has to come from official APIs, user-run downloads that we import in one step, and OTP flows the user completes in session.

## 2. Where we are ahead

- **No install.** Their Utilities page lists SQL Server 2008 Express, Java JRE 8, .NET 4.5, VFP ODBC, emBridge, separate database setups and Windows XP SP3. We are a browser plus a 15 MB signer.
- **GST generation gap.** Smart GST compares 3B with GSTR-1 and **GSTR-2A**. No 2B, IMS, GSTR-1A, pre-14th guard, 3B lock, e-invoice, e-way bill or GSTR-9/9C on the page. This is our strongest wedge.
- **Control.** Maker-checker, tamper-proof audit trail, PII masking, DPDP consent, India-only hosting. None of it appears on their site.
- **Anywhere access.** Partners approve from home; they need AnyDesk or a cloud install.
- **Price clarity and instant trial.** They gate trials behind a request form (except AI) and show no prices.

## 3. Main site: changes

1. **Lead with the switch.** Hero line about leaving installed tax software, plus "Tax Year 2026-27 ready: Forms 138, 140, 143, 144". They claim it, so we must too.
2. **A `/switch` page.** What moves in 10 minutes: client masters from Excel, payees and past statements from FVU .txt or TRACES .tds, GSTINs in bulk. Include a side-by-side of desktop vs SynexTax (install, 2A vs 2B and IMS, maker-checker, access from home). Do not name the competitor.
3. **Deep feature pages** `/features/gst` and `/features/tds` with the full A to G style lists. CAs read every line, and these pages rank in search.
4. **Local presence.** Phone and WhatsApp in the nav and footer, an Amritsar demo slot, Punjabi and Hindi landing copy.
5. **`/security` page.** Mumbai hosting, RLS isolation, audit trail, DSC keys never leaving the token, DPDP.
6. **Free tools for lead generation.** 2025 to 1961 TDS section finder with rates, Section 427 late fee and Section 398 interest calculators, GST due date calendar by state and QRMP, GSTIN checker.
7. **What's New and statutory updates.** Changelog plus a weekly rule digest (feeds the footer sign-up).
8. **Proof.** Pilot firm quotes and numbers in place of their "20,000 clients".

## 4. Workspace: build order

**Next: TDS parity (wins the switch).**
1. Import past statements (FVU .txt, TRACES .tds, .conso), payee master carry-forward, tax year lock.
2. TDS Health view: late fee estimate, unconsumed and over-consumed challans, short deduction, interest u/s 398.
3. Correction statements from conso with C1/C2/C3/C5, drafts and versions.
4. Certificates: split the TRACES zip, batch-sign with the DSC agent, email and WhatsApp to payees.
5. Salary TDS for Form 138 (both regimes), Form 124, Form 121 register.
6. Challan helper: e-Pay Tax values ready to paste, CSI match, auto-link to deductees.

**Then: practice layer (where Assist competes).**
7. Document checklists per service with client upload from a phone link, automatic WhatsApp and email chasers, gap dashboard.
8. Tasks auto-created from the filing calendar, fee ledger, optional lock on deliverables until paid.

**Then: speed and assistance.**
9. Function-key shortcuts on grids, Excel templates, What's New panel.
10. AI on India-hosted models with PII redaction: notice reply drafts, rule digest, bank statement to ledger.

**Decision needed: ITR.** Smart Tax is their anchor. Either plan an ITR module, or position SynexTax as the GST and TDS workspace that sits beside existing ITR software and import AIS/26AS later.

## 5. Where it stands on 21 Nov 2026

Re-read on 21 Nov 2026 from new.smartbizindia.com (Smart GST and Smart e-TDS pages). Their lists have not changed since yesterday; the column below is what SynexTax does today, checked by tests and in the browser.

### Level or ahead now

| Area | SmartBiz | SynexTax now |
|---|---|---|
| New Act statements | Forms 138, 140, 143, 144 | Statement files for all four (Form 138 for Q1 to Q3), every Annexure rule checked before the FVU; Form 143 uses file type TC1 as Protean requires |
| Past filings | FVU .txt one at a time or a folder | 2025 Act and 1961 Act (24Q, 26Q, 27Q, 27EQ) files, checked against Protean's layouts and samples; one file at a time |
| Quarter data entry | Excel templates | The firm's own sheet pasted in; rows checked, challans and draft return created |
| TDS health and reports | Health dashboard, deposit and payee registers, default analysis, clause 34 data | Health view, defaults (late deduction and deposit interest, short deposit, no-PAN rate), deposit register, section-wise clause 34(a) totals, statement register for 34(b) |
| Form 121 register | Yes, with portal template | Register checked against flag B rows; no portal template yet |
| Salary TDS | Both regimes, perquisites, previous employer, Form 124 | Both regimes with HRA, LTA, home-loan interest, 80C, NPS, perquisites and an earlier employer; Form 124 claim checks (no Form 124 report yet) |
| GST sales | Import from Excel and accounting software, rate-wise GSTR-1 report | Paste import with GSTR-1 classification and tax checks, rate-wise summary |
| Composition | GSTR-4 e-filed | CMP-08 and GSTR-4 workings; filing waits on a GSP |
| Practice | Tasks, calendar, fee ledger, documents locked until paid | Tasks from due dates, fee invoices with GST and a rule 46 number series, receipts, ledger with ageing; no deliverable lock until the client portal exists |
| Users | Rights screen by screen | Screens per team member, clients per team member, both enforced by the server and the database |
| Bank to ledger | AI bank statement to ledgers | Rules and party detection to Tally vouchers, statement kept in the browser |
| ITC-04 | e-filed | Job work position, deemed supplies, period and due date; filing waits on a GSP |
| GSTR-3B yearly summary | Yes, plus 3B against 1 and 2A | 3B against GSTR-1 and GSTR-2B (not 2A) month by month |
| Tally, Busy, Marg backup | Agent | Agent module with SHA-256 manifest and retention; written but not yet compiled (no Go toolchain on the build machine) |
| ITR | ITR-1 to 6, e-filed | Computation under both regimes; no return file yet |

### Still behind, and what each needs

| Gap | Needs |
|---|---|
| e-filing GST returns, GSTR-2 download, cash and credit ledgers, challan history, filed cases | GSP contract and API access |
| FVU run and statement upload, e-Pay Tax helper, CSI download, bulk PAN checks, Form 130/131/133, conso and corrections | FVU download consent, sample TRACES files, an ERI or TRACES-sanctioned route (no stored portal passwords) |
| Form 138 Q4 | Protean's Q4 format (still "expected to be released soon") |
| Section rates and thresholds for every 393 and 394 code | A verified rate table; not guessed |
| ITR return files | ITD's ITR schemas for Tax Year 2026-27 |
| Client phone upload, automatic WhatsApp reminders, deliverable lock | File storage and a WhatsApp provider (BSP) |
| Tally, Busy and Marg backup agent | Install Go 1.27 to build and test the module, then sign the agent build |
| AI notice replies and rule digest | India-hosted model |
| Staff invitations | Email provider for invite links |
| Local network install | Not planned; SynexTax is cloud only |

### Fixed along the way
- Form 143 files carried file type NS1 instead of TC1.
- A statement took every challan in the quarter, mixing forms; rows now carry their form.
- The TDS challan endpoint returned an invented ID without saving; it now saves.
- Government portal status in the header and audit page was hard-coded as normal; it is now a real five-minute check.
- Payee and health responses sent full PANs; they are masked now.
- The MFA challenge secret had no production guard; production now refuses the development default.
