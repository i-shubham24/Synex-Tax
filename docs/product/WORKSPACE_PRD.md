# SynexTax Workspace PRD: gap matrix and build order

Source of truth: [`workspace-spec-source.md`](workspace-spec-source.md) (extracted from "To give you an exhaustive.docx", 19 Nov 2026).
This file maps every feature in that spec to what exists in the repo today, flags statutory claims that need correcting, and sets the build order.

Status key: **Done** = working as specified. **Partial** = UI exists on mock data, or backend exists without UI. **Missing** = not started.
"UI" refers to `apps/web`, "API" to `apps/api` routes, "Data" to `packages/db` migrations.

## 0. Where the codebase stands

| Layer | What exists | What does not |
|---|---|---|
| Web workspace | 7 pages under `/dashboard` (Control Tower, Clients, Invoices, Recon, TDS, Audit, Settings), shell with rail, search, portal pill, notifications, profile menu, light/dark | No page calls the API: all data is in-file mock data. No client context, no Cmd+K, no routes per spec (`/gst/*`, `/tds/*`, `/dsc`, `/clients/[id]`, `/clients/import`) |
| API (Fastify) | auth (MFA setup, refresh), client-master CRUD (groups, entities, GSTINs, TANs, tree), compliance (flags, portal health, webhook), audit (logs, PII reveal), recon (run, IMS action, pre-14 risk), TDS (calculate, challans, CSI match, return validate), DSC (challenge, verify) | GSP adapter, NIC adapter, GSTR-1/3B filing flow, FVU job dispatch, TRACES conso, import pipeline, notifications, reports |
| Database | 10 migrations: tenancy + RLS, identities/MFA/sessions, client master, DSC inventory, feature flags, portal health, DPDP consents, legal holds, three audit tables, GST sales/purchase/2B/IMS/filings, return-expiry radar view, ISD radar view, TDS challans + 281N section allocations + deductees + returns + FVU jobs, DLT templates, subscriptions, credit reclaim and RCM ledgers | Token ledger per TAN quarter, GSTN API session table, vendor scores, notices, client portal users, fee billing |
| Engines | `tax-engine`: ITC set-off (Sec 49A/49B, Rule 88A), GST/IT rounding, GSTIN/PAN/POS/Rule 46/Sec 17(5) validators. `queue-worker`: TS 4-pass recon engine, IMS pre-14 alert job, invoice normaliser. `ingestion`: CSV parser, Tally XML parser, upload safety checks | Python recon worker (spec says `services/recon-worker`; today recon runs in TS), FVU Docker runners, .conso parser, PAN verification adapter |
| DSC agent (Go) | `/health`, `/api/v1/tokens`, `/api/v1/sign`, PKCS#11 module, nonce check, Tally poller stub | PAdES batch signing, installer, web pill integration |

**Decision recorded:** the spec's route map (`/clients`, `/gst/*`, `/tds/*`, `/dsc`, `/audit`, `/settings`) will be adopted with a Next.js route group so every workspace route shares one shell. `/dashboard` stays as the Control Tower. Existing `/dashboard/*` paths redirect to the new ones.

## 1. Statutory claims in the spec that need correcting

Checked against the verified research from this project (sources in the research reports).

| Spec says | Verified position | Action |
|---|---|---|
| Token state `REVOKED_BY_TAXPAYER` | No such GSTN code. Known codes: AUTH4037 (API access not enabled / denied), AUTH4033 (invalid session). A revoked consent needs a fresh OTP consent. | Map AUTH4037/AUTH4033 to our own internal state `REVOKED`; never show a fake GSTN code |
| Edit log under "CGST Rule 56(15)" | The edit/delete log for electronic records is **Rule 56(8)**. Rule 56(15) is DSC authentication of electronic records. | Label the viewer "MCA Rule 3(1) and CGST Rule 56(8)" |
| GSP-ASP pair chosen when enabling API access, 30-day logs | Official advisories (17 Jul, 29 Sep 2025) confirm duration choice, active-token view and revoke; GSP-ASP pair selection appears only in secondary 2026 sources | Keep the checklist, word it as "confirm the ASP shown on the portal" |
| GSTR-3B hard-blocked by the portal until 2B recompute | Recompute is required for post-14th IMS changes to count; a portal hard block is not confirmed | Keep our product-side lock, label it as a SynexTax safeguard |
| Form 141 Schedules A to E, E from 1 Oct 2026 | Official FAQ lists A (rent), B (property), C (contractor/professional), D (VDA); the 1 Oct 2026 non-resident property case was added by G.S.R. 830(E), schedule letter not confirmed | Confirm the letter from the current Form 141 utility before coding |
| 2% GST TDS on scrap/e-waste from 1 Nov 2026 | Single unconfirmed source | Behind a feature flag, off, until the notification is confirmed |
| Notification 03/2026-CT post-sale discount credit notes from 1 Nov 2026 | Not confirmed (verification pending); a separate source ties 04/05-2026-CT to RCM e-invoicing | Keep `original_invoice_ref` nullable logic behind a flag until confirmed |
| Automated registration suspensions from 1 Apr 2027 | Not confirmed | Show portal status only; no countdown copy until confirmed |
| Composition 10(1) / 10(2A) split "from 1 Nov 2026" | Rates (1%, 5%, 6%) are long-standing; the dated split is not confirmed | Phase 2 item; confirm before build |
| "Advisory 643" credit reclaim ledger guard | Ledger and negative-balance validation exist (2023/2024 advisories); the advisory number is not confirmed | Keep the guard, drop the number from UI copy |
| CBIC Circular 258 hearings, Instruction 02/2026 ₹10,000 threshold | Not confirmed | Phase 3 item; confirm before build |
| SAC 998314 on our invoices | Classification is a judgment call (998314 / 998315 / 997331) | Confirm with the CA advisor |

Confirmed and safe to build: 2-year TDS correction window (s.397(3)(f), from the end of the tax year the original statement was due), Sec 427 fee ₹200/day capped at TDS, Sec 461 penalty, ITNS 281N up to 20 sections with company/non-company and resident/non-resident splits, FVU 1.2 and 9.5, 27EQ on the 15th vs Form 143 on the 31st, IMS credit-note pending cap (one period), GSTR-3B Table 3.1/3.2 lock from July 2025, 3-year return time bar, 30-day e-invoice window for AATO ≥ ₹10 cr, 14-digit EWB / 11-digit CEWB from 1 Jan 2027, RCMDOM/RCMIMP, CCA FIPS 140-2 cut-off 21 Sep 2026, Rule 37A, Rule 138E.

## 2. Gap matrix

### Part 1. Shell, Control Tower, Client Master, Migration

| Feature | Phase | UI | API/Data |
|---|---|---|---|
| Role-aware rail, 72/220px collapsible with labels | P1 | **Done** (M1) | Roles exist in DB |
| Firm + active client context pill | P1 | **Done** (M1, session-persisted) | Missing |
| Cmd+K command bar (search + `> file 3b` actions) | P1 | **Done** (M1, client-side search) | Server search: Missing |
| Portal health pill with latency | P1 | Partial (GSTN, NIC IRP, TRACES, ITD with latency; static values) | Partial (`/compliance/portal-health`) |
| Local DSC agent live pill (polls 127.0.0.1) | P1 | **Done** (M1, polls `/health` every 15 s) | Agent `/health` exists |
| Trial / plan meter badge | P1 | **Done** (M1) | Partial (subscriptions table) |
| Categorised notification centre | P1 | **Done** (M1, sample events) | Missing |
| Theme toggle, profile, role badge, MFA status, session lock | P1 | **Done** (M1; unlock checks code format until the API verifies TOTP) | Partial |
| Rush-day support widget | P1 | **Done** (M1, drafts kept locally until the desk API exists) | Missing |
| Control Tower period pills + staff/group/category chips | P1 | **Done** (M1) | Missing |
| Bento: tax donut, 2x2 KPIs linking to queues, ITC vs cash bars, velocity spline, at-risk list | P1 | **Done** (M1, sample data) | Missing |
| Risk Radar strip (3-year cliff, pre-14 IMS, token watch, DSC/FIPS expiry, TDS correction + ISD) | P1 | **Done** (M1) | Rules **Done** in `tax-engine/compliance` (unit-tested) |
| Filing Matrix view, Partner approval queue, staff workload bars | P1 | **Done** (M1, sample data) | Missing |
| Client list + floating inspector, masked PAN with audited reveal | P1 | Partial (list + inspector, reveal not wired) | Partial (CRUD, reveal route) |
| Entity 360 with six tabs | P1 | Missing | Partial (tables exist) |
| GSTN API access manager + WhatsApp setup card | P1 | Missing | Missing (no session table) |
| TAN token ledger + TRACES KYC cheat sheet | P1 | Missing | Missing (no ledger table) |
| Bank vault with reason-logged reveal, DPDP consent tracker, legal hold panel | P1 | Missing | Partial (tables exist) |
| Migration wizard (Excel templates, bulk GSTIN enrichment, .conso bootstrap, guided form, hygiene grid) | P1 | Missing | Partial (CSV parser, validators) |
| Partner-only watermarked export | P1 | Missing | Missing |

### Part 2. GST suite

| Feature | Phase | UI | API/Data |
|---|---|---|---|
| Period bar, token countdown, workflow stepper, period lock, sequential-filing guard | P1 | Missing | Partial (filings table) |
| Dirty Excel/CSV mapper + hygiene grid with inline fixes | P1 | Missing | Partial (parser, validators) |
| GSTN JSON/Excel import fallback | P1 | Missing | Missing |
| GSTR-1 register with GSTN section tabs, keyboard grid, inspector | P1 | Partial (invoice grid) | Partial (sales table) |
| HSN (Table 12 B2B/B2C) and documents (Table 13) auto-summary | P1 | Missing | Missing |
| Books vs e-invoice gate before SAVE | P1 | Missing | Missing |
| GSTR-1A single-shot workspace, QRMP IFF mode | P1 | Missing | Missing |
| 2B sync, 4-pass recon, buckets, side-by-side diff inspector | P1 | Partial (recon page, TS engine) | Partial (`/recon/run`) |
| 17(5) tagger, Rule 42/43 calculator | P1 | Partial (17(5) validator) | Partial |
| Scrap 2% GST TDS alert | P1 per spec | Missing | Flag off until confirmed |
| Vendor follow-up statements | P1 | Missing | Missing |
| IMS console: recipient/supplier views, bulk actions, CN cap + reversal prompt, pre-14 tab, amendment lineage, bypass tab, recompute lock, offline JSON | P1 | Partial (IMS actions on recon page) | Partial (`/recon/ims-action`, pre-14 job) |
| GSTR-3B: locked 3.1/3.2, editable 3.1(d), Table 4 with reclaim/RCM ledger guards, 16(4)/37A warnings | P1 | Partial (offset screens) | Partial (ledger tables) |
| ITC set-off optimiser + Rule 86B guard | P1 | Partial | Done in `tax-engine` |
| Offset modal with challan shortfall, maker-checker history, DSC/EVC filing | P1 | Partial (modal on mock data) | Partial (filing lock plugin) |
| PMT-06 fixed-sum vs self-assessment | P1/P2 | Missing | Missing |
| CMP-08 / GSTR-4, GSTR-9/9C, ITC-04, RFD-01, GSTR-6, GSTR-7 | P2/P3 | Missing | Missing |
| e-Invoice, e-Way Bill, vendor scores, hold-GST ledger | P2 | Missing | Missing (no NIC adapter) |
| Tally/Busy direct sync, OCR intake | P2 | Missing | Partial (Tally parser, agent poller stub) |

### Part 3. TDS, DSC, portal, notices, billing, audit, settings

| Feature | Phase | UI | API/Data |
|---|---|---|---|
| TDS command bar, regime badge, due date + Sec 427/234E fee ticker, 2-year correction countdown, Mark Quarter Nil, return stepper | P1 | Partial (calculator, regime routing) | Partial (`/tds/calculate`, returns table) |
| Challan vault: split validator, Tax Year warning, 281N allocator, allocation fields, CSI match | P1 | Partial (281N builder) | Partial (challans + allocations, `/tds/csi-match`) |
| Deductee/salary grid with PAN operative checks, quarter-bound dates, rounding rules, 395(1)/Form 121, Form 144 codes, Form 138 Q4 | P1 | Missing | Partial (deductees table, rounding) |
| Form 141 helper | P1/P2 | Missing | Missing |
| FVU hub: pre-FVU modal, .txt compiler, Docker runners, clickable error parser, upload bundle | P1 | Missing | Partial (fvu_jobs table) |
| TRACES conso studio, KYC cheat sheet, certificate ingestion + bulk signing | P1 | Missing | Missing |
| DSC hub: agent monitor, inventory + custody, expiry/FIPS radar, PAdES batch queue, installers | P1 | Missing (no `/dsc` page) | Partial (inventory table, agent stub) |
| White-label client portal + WhatsApp engine | P2 | Missing | Partial (DLT templates) |
| Notices and GSTAT tracker, AI reply drafter, AA bank health check | P3 | Missing | Missing |
| Practice fee billing + analytics | P3 | Missing | Missing |
| Audit: edit log viewer with diffs, signing trail, PII reveal log, Rule 3(6) PDF, DPDP + legal hold vault, offboarding export | P1 | Partial (audit page, reveal gate) | Partial (audit tables, `/audit/logs`) |
| Settings: profile, team RBAC + maker-checker, integrations + flags view, MFA + passkeys + sessions, subscription + e-mandate + GST invoices | P1 | Partial (settings page) | Partial |

## 3. Progress log

- **19 Nov 2026, Milestones 0 and 1 (front end):** spec route map under a `(workspace)` route group with redirects from `/dashboard/*`; workspace store (active client, filters, error log); typed sample firm + live adapter for `/client-master/tree` (`NEXT_PUBLIC_DATA_SOURCE=api`); statutory calendar and radar rules in `packages/tax-engine/src/compliance` with 11 unit tests; full Milestone 1 shell and Control Tower.
- **Still open from Milestone 0:** the API has no login endpoint and its client-master routes keep data in memory, so live data needs: dev Postgres (PGlite socket server), migrations + seed, a login endpoint issuing JWTs, and the routes moved onto the database.
- **20 Nov 2026, Master Engineering spec Checkpoint 1 (database):** source of truth is now `docs/product/master-engineering-source.md`. Most Section 2A fixes were already in `packages/db/migrations`. Closed the rest and fixed what the new suite exposed:
  - HMAC context could be bypassed three ways: a NULL signature or NULL expiry passed the check, and `current_firm_id()` trusted a `context_verified` setting that any role can write with `set_config`. Context is now re-verified on every read (`app.verified_context()`); tampering with any setting voids the whole context.
  - Audit capture took the actor from raw settings and could never insert (FORCE RLS with no writer policy). Now: tenant from the row, actor from the verified context, append-only writer policies, Client Master and governance tables audited, PII/signing writers refuse other firms.
  - `is_entity_visible` saw no users under RLS, so staff and managers saw nothing. Helper read policies added.
  - Maker-checker referenced a non-existent `PARTNER_SIGNED` status and `created_by` column, and failed open with no role. Rewritten: FILED needs a PARTNER or delegated MANAGER (or a signed job with a recorded checker), maker is fixed at insert, signer must not be maker.
  - Period locks now cover INSERT. GSTR-7 return type, Form 144 remittance code registry (empty until loaded from the official utility), global tables re-revoked after the blanket grant, billing guard uses the signed actor.
  - Verification: `npm run migrate:test -w @synextax/db` on PGlite 0.4.6 = PostgreSQL 17.5 with real pgcrypto, 35/35 passing. Log in `packages/db/reports/checkpoint1-verification.log`.
  - Pins: Go 1.27 / toolchain go1.27.4, Node `22.x` + `.nvmrc`, Next `~16.4.6`, Postgres 17 compose (already). API refuses the dev HMAC secret in production.
- **20 Nov 2026, Checkpoint 2 (live site):** space restored in "clarity and compliance so your team can breathe easy"; `/privacy` (DPDP Act), `/terms` and `/contact` pages added; nav and footer links work from every page; pricing already server-rendered. Tax-engine unit tests for Sec 170, Sec 516, Rule 269, 88A/86B, Advisory 643 and validators already existed. Company emails, Grievance Officer and courts clause in `apps/web/src/lib/legal.ts` need confirming before launch.

- **20 Nov 2026, competitor phases 0 to 6 (see COMPETITOR_SMARTBIZ.md):**
  - Fixed: demo partner backdoor (now dev or `ENABLE_DEMO_WORKSPACE` only), refresh that never worked against the DB (CSRF and an auth-role permission error), silent fallback to the demo account, logout not revoking, simulated DSC signing reported as verified, FVU dispatch inventing a validation result and token, PII reveal returning a fixed fake value without logging, full client PANs on screen, DATE columns shifting a day, pglite-socket locking out a restarted API.
  - Built: client import (tax-engine rules, `/clients/import`, partner-only commit); Form 140 statement import with Protean's official layout and section codes (`tax-engine/tds`), payee master, TDS health (`/tds/health`); salary TDS calculator; document checklists with gap board and WhatsApp/email reminders (`/documents`, migration 0014); PII redaction for any AI use; `/switch`, `/security`, `/features/gst`, `/features/tds`, `/tools`, `/whats-new`; keyboard shortcuts.
  - Still open, needs outside inputs: real PKCS#11 signing (USB token), FVU runner containers, 1961-format and TRACES conso import (file layouts), correction statements, Form 130/131 certificate handling (TRACES files), client self-upload (file storage) and automatic WhatsApp sending (provider), India hosting, API responses masking PAN.

- **21 Nov 2026, statement files for all four 2025 Act forms:**
  - `writeTdsStatement` (tax-engine `tds/statementWriter.ts`) writes Forms 138 (Q1 to Q3), 140, 144 and 143 from Protean's file formats v1.2, with Annexure 2, 6, 8, 9 and 10 rules for each form. Form 138 uses file type SL1, has no rate field and carries the deposit date in DD field 29; Form 138 Q4 is refused because Protean has not published that format yet.
  - Parser reads all four forms, including Protean's published 138 and 140 samples; imports keep the Form 144 and 143 fields (migration 0017).
  - Fixed: a statement picked up every challan for the TAN and quarter, so a Form 138 file pulled in a Form 144 challan. Each deductee row now records its form (migration 0018); older rows are placed by section code. Forms 140 and 144 share eleven codes, so section codes alone cannot decide this.
  - Tests: tax-engine 70, DB 41, API 20 (Form 144 and 138 import, then write back from the database).
  - Still open: Form 138 Q4 annexure (waiting on Protean), Form 124 declarations, perquisites and previous-employer income feeding the salary computation, a screen to edit non-resident and collectee fields row by row.
  - 1961 Act import: 24Q, 26Q, 27Q and 27EQ regular statements (layouts read from Protean's .xls formats; CD 41 and DD 54 fields, tax = income tax + surcharge + cess, section from DD 33 or, in older files, CD 21). Checked against Protean's published samples for all four forms. Stored under IT_ACT_1961; a challan carrying more than one section is refused, since an ITNS 281 challan covers one. 24Q Q4 salary detail (SD, S16, C6A) records are skipped with a warning.
  - Fixed: Form 143 files were written with file type NS1; Protean's format and sample use TC1. Any Form 143 file written before 21 Nov 2026 must be written again.

- **21 Nov 2026, registers, GST returns, practice, access, bank, ITR:**
  - TDS: registers and default analysis (tax-engine `tds/registers.ts`), Form 121 register (migration 0019), quarter sheet import that creates challans, rows and the draft return (`tds/quarterImport.ts`), challan endpoint now saves.
  - GST: sales register import and GSTR-1 classification (`gst/salesRegister.ts`, migration 0020 adds tables 5 and 6A), rate-wise summary, CMP-08 and GSTR-4 (`gst/composition.ts`), `/gst/returns`.
  - Practice: tasks from due dates, fee invoices with a per-year series, receipts and ledgers (`practice/tasks.ts`, `practice/fees.ts`, migration 0021), `/practice`.
  - Access: per-screen modules per user (migration 0022, `security/modules.ts` enforced on every request), team routes, real Settings team panel; nav hides screens a user lacks.
  - Bank to books (`bank/statement.ts`, `/bank`, browser only) and ITR computation (`itr/computation.ts`, `/itr`).
  - Fixed: fake challan save, fake portal status, full PANs in payee and health responses, MFA challenge secret without a production guard, delimiter detection on pasted sheets with title rows.
  - Tests: tax-engine 97, DB 43, API 26; web type-check and production build pass. No ESLint is set up in the web app (`next lint` no longer exists in Next 16).
  - Comparison with SmartBiz: `COMPETITOR_SMARTBIZ.md` section 5.

- **21 Nov 2026, items needing no outside input:**
  - Salary TDS: perquisites, an earlier employer's salary, PT and TDS, LTA and home-loan interest (`tds/salary.ts`); Form 124 claim checks and conversion (`tds/form124.ts`); calculator on `/tools` updated.
  - ITC-04 (`gst/itc04.ts`): job work position, deemed supply after one or three years, period and due date by turnover; tab on `/gst/returns`, browser only.
  - GSTR-3B for the year (`gst/gstr3bYear.ts`, `GET /api/v1/gst/gstr3b/year`): 3B against the sales register and GSTR-2B, QRMP by quarter; months with no 3B kept here are shown as not in SynexTax, not as overdue.
  - Desktop agent: `modules/backup` zips Tally, Busy or Marg data folders with a SHA-256 manifest, keeps 30, refuses folders that are not the product's own; endpoints `/api/v1/backup/{detect,run,list}`, run needs a challenge nonce. Built with Go 1.27.4 (checksum-verified download, kept in the session scratch folder): `go build`, `go vet` and 4 backup tests pass. The build exposed an unused `crypto/x509` import in `modules/dsc/pkcs11.go`, so the agent had never compiled; fixed, and the agent files are now gofmt-clean.
  - Tests: tax-engine 105, DB 43, API 27; web type-check passes.
- **21 Nov 2026, live site (synex-tax.vercel.app):** the API function crashes on every request (`FUNCTION_INVOCATION_FAILED` on `/health`), so the demo login fails. Likely causes in the deployed commit: `JWT_SECRET` and `CONTEXT_HMAC_SECRET` not set (production refuses to start without them), no `DATABASE_URL`, `ENABLE_DEMO_WORKSPACE` not set, or the workspace packages not built. The API build now compiles its workspace packages first (`build:deps`); the login message now names the failure. Both need a commit and redeploy; the Vercel log line decides which setting is missing. After this commit production also needs `CHALLENGE_JWT_SECRET`.
  - Confirmed locally by starting the built API with `NODE_ENV=production`: it stops on the missing `JWT_SECRET`, then `CHALLENGE_JWT_SECRET`; with both it starts, and the demo then fails only for want of a database. Added `npm run migrate -w @synextax/db` (`packages/db/scripts/migrate.js`) to migrate a real PostgreSQL over `pg`, tested against a fresh PostgreSQL 17 on a socket (`migrate:check`). Steps and variables: `docs/deploy/VERCEL.md`.
- **21 Nov 2026, the twelve buildable items:** client upload portal (migration 0023, `/upload/<token>`, link resolver as a SECURITY DEFINER function, files checked by magic bytes and SHA-256); TDS section rates and thresholds (`tds/rates2025.ts`, from the CBDT chart and section 393 as read on 21 Nov 2026); lower deduction certificates (0024, `tds/certificates.ts`); government deductors and Form 24G list (0025); salary register and Form 124 report (0026, `tds/salaryRegister.ts`); challan linking (`tds/challanLink.ts`); FVU and certificate check in the agent (`modules/fvu`, `modules/certs`); multi-file statement import and CSV templates; GST MIS and party master (`gst/mis.ts`); function keys. Not built for want of a published layout: CSI file reader, 26AS import. Fixed: agent origin prefix match (now exact), CSRF secret production guard. See `COMPETITOR_SMARTBIZ.md` section 6.
- **21 Nov 2026, from published formats:** TDS correction statements (`tds/correction.ts`, Protean correction formats v1.2 of 4 Aug 2026; TRACES consolidated file in, C5 / C3 / C9 out; `/api/v1/tds/corrections/*`, Corrections tab). ITR-1 JSON for AY 2026-27 (`itr/itr1Json.ts`, schema vendored in `packages/tax-engine/schemas/itr`, validated with Ajv in tests; `/api/v1/itr/itr1`; needs `ITR_SOFTWARE_ID`). Server-signed Ed25519 challenge tokens for the desktop agent (`security/agentChallenge.ts`, `security/challenge.go`, shared test vector). Adapters in `apps/api/src/integrations`: SigV4 (AWS test-suite vector), S3, SES, WhatsApp Cloud API, Bedrock with PII masking; India regions only. Settings, Connections now shows real status instead of the fixed "CONNECTED" list. Tests: tax-engine 126, API 40, DB 43 plus migrate check, agent 4 packages, web build OK. See `COMPETITOR_SMARTBIZ.md` section 7.
- **21 Nov 2026, DSC signing made real:** the agent (`modules/dsc`) lists and signs with certificates from the Windows store (CNG smart card provider, CryptoAPI fallback; no PIN handled); `/api/v1/dsc/challenge` builds the signed document from the return, `/verify` checks the signature with the certificate (`security/dscSignature.ts`) and the chain against `DSC_TRUSTED_ROOTS`, and logs SUCCESS, UNVERIFIED or REJECTED. The fake `/api/v1/dsc/tokens` list and the hardcoded token cards on Audit and Settings are gone. Tests: agent signing through NCrypt RSA and ECDSA and CryptoAPI with in-memory keys, server checks with a test CA.
- **22 Nov 2026, security, reliability and UI pass:** CCA India 2022 and 2022 SPL roots built in (`security/ccaRoots.ts`, fingerprints pinned). Change-log SHA-256 hash chain (migration 0027, `audit.verify_chain()`), real badge on Audit and evidence export (`GET /api/v1/audit/export`, partners). Fixes from a three-part audit: fail-closed secrets unless NODE_ENV is development or test (`security/env.ts`); exact CORS origins; CSRF tokens bound to the session cookie; module check on the matched route (encoded paths no longer bypass it); JWT algorithm, issuer and audience pinned, one-hour access tokens; atomic refresh rotation with reuse detection; MFA codes single use and counted in the lockout; demo account refused when the demo is off; webhooks on raw body with required timestamp and replay check; SSRF guard fixed for IPv6 forms and DNS; no internal error text in 5xx; tokens kept out of web storage; web login, sign-up and MFA now send CSRF tokens (they were refused before). Reliability: timeouts on every outbound call, S3 read retries, circuit breakers, Idempotency-Key on every write, If-Match on salary and task edits, readiness that fails without the database, pool timeouts, indexes (migration 0028), CI workflow, zod 4.6.7 (npm audit clean). UI: unslop sweep over 59 files (weights, mono on prose, uppercase labels, transition-all, pulses, glows), jargon copy rewritten, fake GST signing dialog and fake evidence pack replaced. See `docs/ops/PRODUCTION_READINESS.md`.
- **22 Nov 2026, open items closed:** per-request nonce CSP (`apps/web/src/proxy.ts`, pages render per request); shared Redis store for rate limits and webhook replay (`REDIS_URL`); `/metrics` and `docs/ops/alerts.yml` (SLOs and burn-rate alerts); batched imports (`db/batchInsert.ts`); `If-Match` on TAN details, checklist items, team screens and firm details, sent by the web forms; Settings, Firm now reads and saves the firm's real record (`/api/v1/firm`, migration 0029 adds phone and address). 25 unused web components deleted (`components/swiss`, `components/taxmate` and eight others). Tests: API 50, DB 45 plus migrate check.

## 4. Build order

Each milestone ships UI, API and data together, against the `MockGspAdapter`, so screens stop being mock-only as they are built.

| # | Milestone | Scope | Why this order |
|---|---|---|---|
| 0 | Foundations | Route map + shared shell, client context store, data fetching layer wired to the API, seed data, local Postgres (PGlite in dev) | Every later screen depends on these |
| 1 | Shell + Control Tower | Expandable role-aware rail, context pill, Cmd+K, DSC agent pill, plan meter, notification centre, support widget; radar strip, filing matrix, approval queue, workload bars | The partner's daily entry point; shows the whole firm at once |
| 2 | Client Master + Migration | Entity 360 (six tabs), API access manager, token ledger + KYC sheet, PII vault, migration wizard with hygiene grid, partner-only export | Switching from SmartBiz starts here; all other modules read the master |
| 3 | GST core | Period bar + stepper, import hub, GSTR-1/1A/IFF, 2B recon + vendor statements, IMS console, GSTR-3B + optimiser + offset modal | 70% of monthly staff time |
| 4 | TDS core | Command bar, challan vault + 281N + CSI, deductee grids, FVU hub + Docker runners, TRACES studio + certificate hub | Quarterly peak on 31 Jan and 31 May |
| 5 | DSC hub | Agent monitor, inventory, FIPS radar, PAdES batch signing, installers | Unblocks RETFILE and Form 130/131 signing |
| 6 | Audit + Settings | Log viewers, Rule 3(6) PDF, DPDP vault, team RBAC, MFA/sessions, subscription billing | Needed before the pilot and VAPT |
| 7 | Phase 2 | e-Invoice/EWB, vendor scores, client portal + WhatsApp, Tally sync, OCR, PMT-06, CMP-08 | After pilot feedback |
| 8 | Phase 3 | Notices/GSTAT, fee billing, GSTR-9/9C, AA health check | Later |
