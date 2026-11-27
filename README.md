# SynTax (SynexTax)

Cloud-native GST, dual-Act TDS/TCS, ITR, and Chartered Accountant practice management platform for India.

Built for CA firms transitioning from single-PC desktop tax software to a multi-tenant browser workspace with database-enforced tenant isolation, maker-checker filing gates, local Class 3 USB DSC signing (without Java), and compliance support across both the **Income-tax Act, 1961** and the **Income-tax Act, 2025**.

---

## Core Suites

- **SynTax GST** (`/products/gst`, workspace `/gst`): Import raw Tally/Busy purchase & sales registers (skipping title/round-off/total noise rows), run sub-second GSTR-2B reconciliation (`EXACT`, `PROBABLE_MATCH`, `MISMATCH_VALUE`, `MISMATCH_DOCTYPE`, `VENDOR_NOT_IN_2B`, `ITC_NOT_AVAILABLE`), act on IMS invoices before the 14th, and draft GSTR-1 & GSTR-3B with Rule 88A set-off.
- **SynTax TDS** (`/products/tds`, workspace `/tds`): Dual-Act routing by transaction date (`24Q`/`26Q`/`27Q`/`27EQ` up to March 2026; `Forms 138` to `144` under the 2025 Act), bank CSI challan matching, rate & threshold verification, TRACES `.conso` correction drafting, and Protean FVU validation (`1.2` / `9.5`) via the local desktop agent.
- **SynTax Sign** (`/products/sign`, workspace `/dsc`): Windows USB Class 3 DSC bridge listening locally on `127.0.0.1:15850`. Uses Ed25519 single-use signed server challenges, validates certificate chains up to CCA India roots, keeps private keys & PINs strictly on the token driver, verifies Form 130/131 PDFs, and backs up Tally/Busy/Marg data.
- **SynTax Desk** (`/products/desk`, workspace `/clients`, `/practice`, `/billing`, `/audit`): Unified client master keyed by PAN/GSTIN/TAN, role-based staff scoping (`PARTNER`, `MANAGER`, `STAFF`, `CLIENT`), one-time client upload links, fee invoicing & ledgers, and a hash-chained tamper-evident audit trail.

---

## Monorepo Architecture

```text
apps/
  web/        Next.js 16 (App Router, Tailwind CSS, TypeScript) marketing site + CA workspace
  api/        Fastify 5 API server with PostgreSQL 17 RLS, Argon2id auth, TOTP MFA & CSRF
  dsc-agent/  Go Windows local agent for Class 3 USB token DSC signing & Protean FVU runner

packages/
  tax-engine/     Dual-Act TDS rates (1961 & 2025), GST Rule 88A, PAN/GSTIN/TAN validators, ITR rules
  ingestion/      Tally/Busy Excel/CSV register parsers & GSTR-2B JSON parser
  shared-schemas/ Shared Zod contracts and validation types
  gsp-adapter/    GST Suvidha Provider (GSP) integration adapter
  dsc-client/     Client SDK for communicating with the local SynTax Sign desktop agent
  db/             SQL migrations and PGlite embedded Postgres helper for tests & local dev

workers/
  queue-worker/   Shared GSTR-2B reconciliation engine & background job processing
  fvu-v1-2/       Protean FVU 1.2 worker harness (Income-tax Act, 2025 statements)
  fvu-v9-5/       Protean FVU 9.5 worker harness (Income-tax Act, 1961 statements)

infra/
  terraform/      AWS Mumbai (ap-south-1) / Hyderabad (ap-south-2) staging & prod IaC
```

---

## Quick Start

### Prerequisites

- **Node.js** `22.x` and **npm** `>= 10.0.0`
- *(Optional, for building `apps/dsc-agent`)* **Go** toolchain on Windows

### Install Dependencies

```bash
npm install
```

### Run Web Frontend & API Tests

`apps/api` includes embedded **PGlite** support (`test.env`), so the entire API suite runs locally with real PostgreSQL migrations and Row-Level Security without needing external Docker services.

```bash
# Build workspace packages and run all API tests
npx tsc -p apps/api/tsconfig.json
npm test -w @synextax/api

# Run synthetic golden compliance fixtures (Tally/Busy + 2B + TDS)
npm run test:golden

# Build and start the Next.js production server on http://localhost:3000
npm run build -w @synextax/web
npm start -w @synextax/web
```

For active frontend/monorepo development across workspaces:

```bash
npm run dev
```

---

## Security & Compliance Architecture

- **Tenant Isolation**: PostgreSQL Row-Level Security (`SET LOCAL ROLE synextax_app`, `app.current_firm_id()`) enforced on tenant queries plus strict BOLA/IDOR foreign-key ownership checks.
- **Authentication & RBAC**: Argon2id password hashing, HttpOnly rotating refresh cookies, in-memory short-lived HS256 JWT access tokens, double-submit CSRF protection, mandatory TOTP MFA with 5-attempt account lockout (`423 Locked`), and strict Maker-Checker separation (blocking non-approving staff from DSC signing/filing).
- **PAN Masking & Audit Trail**: Unmasked PAN views and client reveals require partner/manager privileges and are written to a SHA-256 hash-chained audit ledger.
- **Production Demo Guard**: Demo workspace access and offline previews are disabled when `NODE_ENV=production` unless explicitly opted in.
- **Upload, CSV & AI Boundaries**: Magic-byte verification, ZIP entry count/uncompressed-size bomb guards (`max 5000` entries / `100 MB`), `X-Content-Type-Options: nosniff` + CSP headers on inline previews, formula-neutralized CSV exports, and `<untrusted_*>` XML delimiter framing for Bedrock (India region) prompt inputs.

---

## Technical SEO & Core Web Vitals

- Centralized SERP metadata engine (`apps/web/src/seo/meta.ts`) enforcing `<= 60` character / `<= 561px` Arial 20px titles, `130-155` character descriptions, canonical URLs, OpenGraph, and Twitter cards across public routes, plus `noindex, nofollow` on authentication and private workspace routes.
- Schema.org JSON-LD (`apps/web/src/seo/schema.ts`) covering `Organization` / `ProfessionalService`, `WebSite`, `SoftwareApplication`, `OfferCatalog` + `FAQPage`, `HowTo`, `ItemList`, and `BreadcrumbList`.
- Dynamic code-splitting for 3D hero WebGL (`three`) via `next/dynamic`, WebP companion logo delivery with `<picture>` PNG fallback, HTTP `301` permanent redirects in `apps/web/next.config.js`, `robots.txt`, and `sitemap.xml`.

---

## Suggested GitHub Repository Description

> **Cloud-native Indian GST, Dual-Act TDS/TCS (1961 & 2025 Acts), and CA Practice SaaS built with Next.js 16, Fastify 5, PostgreSQL RLS, and a Go USB DSC desktop signing agent.**
