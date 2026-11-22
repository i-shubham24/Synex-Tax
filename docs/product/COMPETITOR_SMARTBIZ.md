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
| Tally, Busy, Marg backup | Agent | Agent module with SHA-256 manifest and retention; built with Go 1.27.4, vetted and tested |
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
| Tally, Busy and Marg backup agent | Code-signing certificate for the agent installer |
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

## 6. Update, 21 Nov 2026 (evening)

Closed since section 5, each tested (tax-engine 116, DB 43, API 31, agent 4 packages) and checked in the browser:

| SmartBiz has | SynexTax now |
|---|---|
| Client upload by phone (Assist, Android app) | Upload link per checklist: the client photographs or picks each document on a phone page that can be added to the home screen; files checked by type and checksum, items marked received |
| TDS at each section's rate and threshold | Every Form 140 code from the department's Tax Year 2026-27 chart and section 393: short rate, missed deduction past the threshold, wrong below-threshold claims |
| Lower deduction certificates (197 / 395) | Register with rate, limit and dates; reason A rows checked, limit used in date order |
| Government deductors, Form 24G reports | State, ministry and AIN written to the statement; book adjustments listed with 24G receipt and DDO serial |
| Salary summaries, Form 124 report | Salary register per employee with tax, TDS so far and monthly TDS; Form 124 report |
| Bulk challan linking | Payments and challans pasted as two lists, linked by month |
| FVU inside the software | Agent prepares the folder, opens Protean's FVU and reads the result |
| Certificates for every PAN, signed | Check of the TRACES converter's PDFs: one PAN each, signed or not |
| Whole folder of past filings, Excel templates | Several statement files at once; CSV templates for each paste import |
| Person register, MIS reports | Party master and MIS by month |
| Function keys | F2 to F10 jump between screens |

Fixed along the way: the desktop agent accepted any web page whose address merely started with an allowed one (for example `https://app.synextax.com.attacker.net`); origins are now matched exactly. The CSRF signing secret had no production guard; it has one now.

Still waiting on outside inputs: GSP (GST filing, GSTR-2 download, ledgers), FVU download consent and a TRACES route (corrections, certificate download, bulk PAN checks, compliance inbox), sample CSI, TRACES consolidated and 26AS files (their layouts are not published), Protean's Form 138 Q4 format, ITD's ITR schemas, mail and WhatsApp providers (sending certificates and reminders, staff invitations), S3 storage in Mumbai (uploads on Vercel), an India-hosted AI model. Also to do: server-signed challenge codes for the agent (today it checks codes only for reuse).

## 7. Update, 21 Nov 2026 (night): what could be built without outside help

Checked against Protean's and the Income Tax Department's sites on 21 Nov 2026.

| Gap | Now |
|---|---|
| TDS corrections (SmartBiz: online correction, conso file) | Built. Protean published correction formats v1.2 (4 Aug 2026) for Forms 138 (Q1 to Q3), 140, 143 and 144. SynexTax reads the TRACES consolidated file and writes C5 (PAN), C3 (challan and rows, placeholder PANs) and C9 (missed challan) files, one type per file. Tested on Protean's sample layout; to be confirmed on a real consolidated file. |
| ITR filing files | Built for ITR-1, AY 2026-27: written to the Department's schema ITR-1_2026_Main_V1.1 and checked against it in tests, with 234A, 234B and 234F worked out. Writing the file needs the software ID the Department gives a registered e-return intermediary. ITR-2, 3 and 4 follow the same way. |
| Signed agent requests | Built. The agent acts only on Ed25519 tokens signed by the server, one action each, two minutes, used once. |
| Uploads on Vercel, email, WhatsApp, AI | Built and tested against recorded requests: S3 and SES in Mumbai or Hyderabad, Meta's WhatsApp template messages, Bedrock in India with identifiers masked. Each turns on with its settings. |
| Settings page | The "API & GSP Connections" tab showed GSTN, IRP, TRACES and e-filing as "CONNECTED" with response times; none was real. It now shows what is actually set up. |

Still needing something from outside: a GSP contract (GST filing, GSTR-2B, ledgers); e-return intermediary registration (ITR software ID, direct filing); Protean's PAN verification registration (bulk PAN checks, Rs 14,160 a year); sample CSI, 26AS and GSTR-2B files; Protean's Form 138 Q4 formats; an AWS account in Mumbai and a Meta business account.

DSC signing (added the same night): the Audit page's signing was simulated, and so was the agent's. The agent now signs through the Windows certificate store with the token's own PIN window, the server builds what is signed and checks the signature against the certificate, and production requires the CCA India roots (`DSC_TRUSTED_ROOTS`). Tested with in-memory keys through the same Windows calls; not yet tried with a physical token.

## 8. Comparison, 22 Nov 2026

Re-read on 22 Nov 2026 from new.smartbizindia.com: home, Smart e-TDS, Smart GST, Smartbiz Assist, Smartbiz AI and the Updates pages. Their product pages are unchanged since 21 Nov. Their update logs list "AY 2026-27 added" and "FVU 9.0" for Smart e-TDS, "Financial Year 2025-26" for Smart GST, and ITR-1 to 7 and Form 3CA/3CB/3CD for AY 2025-26 as the latest Smart Tax update (Service Pack 40, 2 Sep 2025).

### Ahead of SmartBiz

| Area | SmartBiz (from their pages) | SynexTax |
|---|---|---|
| GST input credit | 3B compared with GSTR-1 and GSTR-2A | GSTR-2B reconciliation, IMS actions, GSTR-1A, the pre-14th guard and the 3B lock; nothing on their pages covers 2B or IMS |
| Installation | Windows software with SQL Server, Java, .NET and AnyDesk for remote help | Browser, plus a small signer on the computer that holds the DSC |
| Control and audit | "Audit log of every action" (Assist only) | Maker-checker on signing and filing; row-level security per firm and per assigned client; every change in a SHA-256 hash chain that the Audit page rechecks, exported for auditors; PANs masked with every reveal logged |
| DSC sign-off | emBridge | Server builds what is signed; the signature is checked against the certificate and the CCA India roots; each attempt recorded |
| Security | Not described | MFA for every account, session-bound CSRF, strict per-request CSP, India-only hosting, signed agent requests, CI with dependency audit |
| Corrections | C1, C2, C3, C5 | C3, C5 and C9 (missed challan); C1 and C2 are the gap below |
| ITR year | Latest published update: AY 2025-26 | ITR-1 for AY 2026-27 checked against the Department's schema (file written once the ERI software ID is set) |
| Trial | Request form (except AI) | Open demo workspace |

### Level

TDS statements for Forms 138 (Q1 to Q3), 140, 143 and 144 in both Acts; imports of past FVU files and pasted sheets; health view with section 398 interest and the 427 fee; salary TDS in both regimes with Form 124; Form 121 register; lower deduction certificates; 24G and government deductor data; deposit, payee and clause 34 reports; challan linking; Protean FVU run through the agent; user rights by screen and by client; document checklists with phone upload; tasks from the due-date calendar; fee invoices, receipts and ledger; Ctrl+K and function keys; What's New.

### Behind, needing outside access

| Gap | What unblocks it |
|---|---|
| e-filing GSTR-1, 3B, 4, ITC-04; GSTR-2 download; cash and credit ledgers; challan history; filed cases | A GST Suvidha Provider contract |
| TDS e-filing prepared on the portal, CSI download, conso and certificate download, justification reports, compliance inbox, e-Pay Tax filled in, bulk PAN checks | A TRACES or e-filing route that does not store portal passwords; Protean PAN verification registration for bulk checks |
| ITR filing, AIS, TIS and 26AS fetch, e-verify | E-return intermediary registration (software ID and API) |
| Form 138 Q4 | Protean's Q4 format |
| Sending email and WhatsApp, file storage on Vercel, the AI model | AWS account in Mumbai and a Meta business account (the adapters are built and tested) |
| Android app with push | A Play Console account; can start as an installable web app |
| Proof on real data | One real TRACES consolidated file and one physical DSC token to confirm the correction reader and token signing |

### Behind, buildable now

| Gap | SmartBiz has |
|---|---|
| C1 and C2 corrections; Excel import and export of deductees in a correction; drafts, versions and revert | Smart e-TDS B |
| ITR-2, 3 and 4 return files from the Department's published schemas; Form 3CA, 3CB, 3CD | Smart Tax |
| Reminders that send themselves on day 1 and day 5, a note to the firm on day 10, pause when everything is in | Assist B |
| Documents: client folders, versions with restore, previews, an open log; deliverable locked until the fee is paid | Assist C and E |
| Client logins and client messages with attachments | Assist A and D |
| Staff invited by email; password reset by code; signed-in devices listed and signed out | Assist A and F |
| Task board, calendar of deadlines and meetings | Assist D |
| Backup agent uploading on a schedule with an alert when one is late, plus Zoho and Vyapar | Assist backup agent (ours keeps backups on the computer) |
| Certificates sent to payees by email and WhatsApp after the TRACES PDFs are checked | Smart e-TDS C |
| AI: questions answered with 2025 and 1961 sections, notice reply drafts with citation checks, deeds and resolutions, calculators, daily CBDT and GST notification feed | Smartbiz AI (ours explains FVU errors only) |
| Bank statements from PDF and scans, ten bank layouts; ledger scrutiny; two-party reconciliation | Smartbiz AI D (ours: pasted statements, rules, Tally vouchers) |
| Billing with a stock register; single-entry VAT accounts | Smart Billing, Smart My Account (outside the GST and TDS workspace; not planned) |

### Not planned

Local network installation, and portal automation that stores client passwords.
