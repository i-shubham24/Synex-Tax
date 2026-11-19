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
