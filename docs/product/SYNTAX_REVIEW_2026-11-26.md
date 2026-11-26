# SynTax review against the procurement playbook (26 Nov 2026)

Input: `SynTax_Competitive_Research_Architecture_and_Procurement_Playbook.docx`, your commits up to `d61667c`, and the uncommitted work (new `apps/api/src/modules/gst|tds`, `/dsc`, `/products`, `/pricing`, suite entitlements, `cmd/agent`, `gsp-adapter`, FVU workers, Terraform, e2e).

## 1. Is the approach right against SmartBiz?

Mostly yes. Three parts of the playbook are correct and should stay:

- **The wedge.** Lead with the monthly pain (messy purchase Excel, 4-pass 2B, IMS, 3B set-off, DSC without Java). A CA feels it 12 times a year. ITR loyalty to Smart Tax is seasonal (July to November); a December pilot is off-season for ITR anyway.
- **Separate suites in the UI, one ledger underneath.** That is the real structural difference from SmartBiz's 5 desktop apps plus a bolted-on cloud Assist, and the code now does it: `firms.enabled_suites`, suite-grouped nav, `/products/*`.
- **Support hours and no per-PC fees as product features.** SmartBiz closes 2:30 to 3:30 PM and after 6 PM on rush nights. That is cheap to beat and easy to prove.

Where I disagree with the playbook or the new code:

1. **ITR is not "Phase 3 roadmap" any more.** ITR-1 to ITR-6 JSON, AIS/26AS/Form 16 imports, capital gains, saved returns and the assessee register are built. Calling it "Roadmap" in the nav undersold it, and the new suite check (see 3a) actually blocked it. Keep GST as the wedge, but show ITR as included. It becomes the reason a pilot firm does not go back to Smart Tax in July 2027.
2. **Honesty beats breadth.** SmartBiz's real moat is "it actually files." One demo where a CA finds a fake "Ready for upload" loses that firm and its referrals. The new code had several places that claimed results nothing produced (listed in 3b). Every screen must say what really ran.
3. **Two of everything.** The repo now has two DSC agents (root `main.go` with real Windows token signing and Ed25519 challenges, `cmd/agent` with only a simulator), two FVU paths (agent runs the Protean JAR locally; server pretends a Docker run), and two GST/TDS route sets (`routes/*` and `modules/*`). Pick one per job before pilot, or bugs get fixed in the copy nobody uses.

## 2. How to be better than the playbook

- **Migration is the switching cost.** "10-minute migration" must import SmartBiz's own exports (client masters, Smart e-TDS deductor and deductee masters, Smart GST party lists). Get one real SmartBiz export file from a friendly CA (item 15) and make it the first golden fixture.
- **Make statutory speed visible.** Publish a public change log: "GSTN advisory X on date Y, live in SynTax at Z." That turns SmartBiz's service-pack friction into a number a CA can see.
- **Real data before more features.** The critical path to December is items 4 (FVU JARs), 12 (real USB token), 15 (real datasets) and 1 (GSP sandbox), not new screens.
- **Back every marketing claim.** "FIPS 140-3 radar" today is a guess from the certificate's issue date (`interface.go` `DetectFipsTier`). Label it "estimated from issue date" until it reads the token's real module info.
- **Pilot only on the real agent.** Remove `https://synex-tax.vercel.app` (the demo with login bypass) from the agent's default allowed origins before a CA installs it.

## 3. Findings in the new code

### 3a. Fixed in this pass

| # | Problem | Fix |
|---|---------|-----|
| 1 | `enforceModules` sent `/api/v1/itr` to suite DIRECT, but a trial allowed only GST/TDS/SIGN/DESK and the default `enabled_suites` had no DIRECT: Income tax was blocked for every firm. A firm with no `trial_ends_at` (paid) was treated as an endless trial. | `security/modules.ts`: a trial allows all suites; no trial date means `enabled_suites` decides; `itr-import`, `itr-statements` and `itr-returns` are gated the same as `itr`. DIRECT added to the defaults in the API, web shell and sample data. |
| 2 | Second migration numbered `0011` (`0011_suite_entitlements.sql`). | Renamed to `0040_suite_entitlements.sql`, rewritten to be safe to re-run, with DIRECT in the default and a backfill for firms that had the old default. |
| 3 | CI built `./cmd/agent` as `syntax-sign-windows-amd64.exe`. Outside `--dev`, that binary still signed with the in-memory simulator key, and its nonce check verifies nothing (HMAC secret is `nil`). | CI now builds the root package (the real agent). `cmd/agent` refuses to start without `--dev` or `--dev-simulator`. |
| 4 | `validate-fvu` marked a job `SUCCESS` with an `output.fvu` S3 path without running Protean FVU, used an invented error code `T-FV-4040`, and the page said "0 Errors: Ready for Upload". The page also read `json.errors` while the API sent `clickableErrors`. | Route reports a SynTax pre-check (`QUEUED`, `fvuExecuted: false`, `precheck: PASSED/FAILED`, code `PRECHECK_PAN`), no fake file paths. Page shows "Pre-check passed. Run Protean FVU on the desktop agent." and reads either error field. |
| 5 | `/dsc` was missing from the proxy's signed-in list, so it got the static CSP without a nonce. | Added `dsc`. |
| 6 | No nav link to the assessee register; Income tax labelled "Roadmap". | Added "Assessee Register" (`/itr/register`), label "Income Tax", exact-match active state. |
| 7 | `/products/sign` said port 18531; the agent now listens on 15850. | Text corrected. |

Checks: API `tsc` clean, web `tsc` clean, API tests 37 of 37 pass (the ITR-over-API test included). **The Go changes are not compiled or tested:** the Go toolchain on this PC was in a scratch folder that has since been cleared.

### 3b. Still open (your call)

1. `traces.routes.ts` KYC cheat sheet returns full deductee PANs with no masking and no logged unmask. This breaks the PAN rule. Suggest: masked by default, a full reveal only through the existing logged unmask path, PARTNER or MANAGER only.
2. `traces.routes.ts` `prn-token` sets a return to `FILED` with no If-Match and no maker-checker step.
3. `traces.routes.ts` `conso-diff` only counts `CD` and `DD` lines, but answers as "C1..C9 corrections" and hard-codes `padesReady: true`. `tds/traces/page.tsx` line 120 says "Simulates live parse". The real parser is already in `packages/tax-engine/src/tds`; wire that in instead.
4. `cmd/agent` CORS reflects any `Origin` with credentials before the origin check; the origin check then refuses, so it is not exploitable, but delete `cmd/agent` or merge its PAdES batch work into the root agent.
5. `fvu-runner.sh` in both workers only echoes; nothing runs the JAR yet (needs item 4).
6. `gsp-adapter` is a mock with an OTP flow (no portal password: good). Not wired anywhere yet; fine until item 1.

## 4. The 18 external items: who does what

**I can do now, no outside access needed**

| Item | What I deliver |
|------|----------------|
| 14 Legal pack | Drafts in `docs/legal/` (ToS, DPDP notice EN/PA/HI, DPA, Rule 3(6) disclosure) for the lawyer. Running now. |
| 15 Golden datasets | Synthetic stand-ins with the same shape plus tests, in `tests/golden-fixtures/synthetic/`; real files drop into `tests/golden-fixtures/real/`. Running now. |
| 16 Statutory masters | Draft TDS section/rate, deductor type and remittance code tables in `packages/tax-engine/data/masters/`, marked unverified, for a CA to sign off. Running now. |
| 17 Pilot leaflet | 1-page English/Punjabi leaflet and the support-hours page, with the frontend work. |
| 13 VAPT prep | An internal security review of the API, RLS and agent before the auditor comes, so the paid audit finds less. |
| 1, 2 GSP | Inquiry email draft and the question list (IRP 1/2 failover, EWB bundle, ASP pairing). Your team sends it. |
| 6, 7 DLT and WhatsApp | Message template texts in EN/PA/HI ready to submit for approval. |
| 11 Code signing | CI signing step ready to take the certificate once bought. |
| 12 USB token | A step-by-step test script for the first real ePass2003/ProxKey session. |

**I can do with your OK**

| Item | Why it needs your OK |
|------|----------------------|
| 4 Protean FVU JARs | It is a file download from Protean's site; I then mount them in the workers and the agent. |
| 9 Domain | Checking availability sends the candidate names to registry lookup services. Buying stays with you. The IP India trademark search has a CAPTCHA, so a person must run it. |
| 18 Change monitor | I can set up a weekly scheduled check of CBIC, GSTN, CBDT and Protean pages that summarises changes. A named person still has to own it. |

**Team only**

1 (sign GSP), 2 (confirm bundle), 3 (PAN API account KYC), 5 (Razorpay/Cashfree KYC), 6 (DLT registration), 7 (Meta verification), 8 (incorporation, PAN, GSTIN, bank), 9 (trademark search, domain purchase), 10 (DPIIT, AWS Activate), 11 (buy OV certificate), 12 (buy or borrow the dongle), 13 (engage CERT-In auditor), 14 (lawyer sign-off), 15 (collect real data), 17 (phone and WhatsApp lines), 18 (the owner).
