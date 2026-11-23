# Deploying SynexTax on Vercel

The `api` service refuses to start in production without its secrets. On Vercel that shows as
`500 FUNCTION_INVOCATION_FAILED` on every `/api` route and `/health`, and the login page cannot
open the demo. Checked on 21 Nov 2026 by starting the built API with `NODE_ENV=production`:

| Missing | What happens |
|---|---|
| `JWT_SECRET` | `FATAL SECURITY ERROR: Default demo JWT_SECRET detected in production environment.` |
| `CHALLENGE_JWT_SECRET` | `FATAL SECURITY ERROR: CHALLENGE_JWT_SECRET must be set ...` |
| `DATABASE_URL` | API starts; sign-in and the demo fail with 500 (`Demo Initialization Failed`) |
| `CONTEXT_HMAC_SECRET` | First database query fails (`CONTEXT_HMAC_SECRET must be set ... in production`) |
| `CSRF_SECRET` | `FATAL SECURITY ERROR: CSRF_SECRET must be set ...` (added 21 Nov 2026) |

## 1. Database (PostgreSQL 17, in India)

Use a managed PostgreSQL 17 in the Mumbai region (AWS RDS `ap-south-1`, or another provider's
Mumbai region), to keep client data in India.

Apply the migrations once, and again after each release that adds one, from a machine with this
repository:

```
MIGRATION_DATABASE_URL=postgresql://<owner>:<password>@<host>:5432/synextax?sslmode=require \
CONTEXT_HMAC_KID=synextax-prod-01 \
CONTEXT_HMAC_SECRET=<same value as in Vercel> \
npm run migrate -w @synextax/db
```

`npm run migrate -w @synextax/db -- --dry-run` lists what would be applied. The migrations create
the roles the API switches to (`synextax_app`, `synextax_auth` and others); the login in
`DATABASE_URL` must be allowed to `SET ROLE` to them.

## 2. Environment variables (Vercel, Production, `api` service)

| Name | Value |
|---|---|
| `NODE_ENV` | `production`. Development defaults (known secrets, the demo, localhost origins) apply only when this is `development` or `test`; unset or anything else is treated as production. |
| `JWT_SECRET` | 64 random hex characters |
| `CHALLENGE_JWT_SECRET` | 64 random hex characters, different from the above |
| `CONTEXT_HMAC_SECRET` | 64 random hex characters, the same value used when migrating |
| `CONTEXT_HMAC_KID` | `synextax-prod-01` |
| `CSRF_SECRET` | 64 random hex characters |
| `FILE_STORE_DIR` | Only on a server with a persistent disk. On Vercel leave it unset: client uploads stay switched off (and say so) until S3 storage in Mumbai is added. |
| `DATABASE_URL` | the application login, with `?sslmode=require` |
| `AUTH_DATABASE_URL` | optional: a separate login for sign-in; falls back to `DATABASE_URL` |
| `APP_URL` | `https://synex-tax.vercel.app` (or the custom domain) |
| `CORS_ORIGINS` | Optional, comma separated: other exact origins allowed to call the API from a browser. The web app calls it through its own origin, so this is usually empty. Wildcards such as `*.vercel.app` are not accepted. |
| `WEBHOOK_SECRET` | 64 random hex characters, shared with whoever sends signed webhooks to `/api/v1/compliance/webhook`. |
| `MFA_ENCRYPTION_KEY` | 32 random bytes, base64 (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). Encrypts authenticator secrets. |
| `TRUST_PROXY` | Number of proxy hops in front of the API (default `1`), so rate limits and audit logs see the client's address. `false` when the API is reached directly. |
| `REDIS_URL` | Optional: a Redis in Mumbai (`rediss://...`, ElastiCache or Upstash). Rate-limit counters and the webhook replay check are then shared by every instance. |
| `METRICS_TOKEN` | Optional, 24 characters or more: turns on `GET /metrics` for the monitoring service, which sends it as a bearer token. Alert rules are in `docs/ops/alerts.yml`. |
| `CRON_SECRET` | 32 random hex characters. Vercel sends it to the scheduled jobs in `vercel.json` (reminders 09:00 IST, late backups 10:30 IST, notification feed 07:00 IST); without it they do not run. |
| `MESSAGES_ENCRYPTION_KEY` | 32 random bytes, base64. Encrypts client messages at rest; without it messaging answers "not set up". |
| `WHATSAPP_CERTIFICATE_TEMPLATE` | Optional: the approved WhatsApp template (four values) for sending TDS certificate links to payees. |
| `BACKUP_STORE_DIR` | Optional, only on a server with a disk: where agent backups are kept when S3 is not set up. |
| `RATE_LIMIT_PER_MINUTE` | Optional, default 300 per client address. Sign-in, MFA, upload links and exports have tighter limits of their own. |
| `POSTGRES_POOL_MAX` | Default 10 per instance. On Vercel use 2 or 3 and point `DATABASE_URL` at a transaction pooler (RDS Proxy, PgBouncer). |
| `POSTGRES_STATEMENT_TIMEOUT_MS` | Default 15000. Any statement running longer is cancelled by the database. |
| `ENABLE_DEMO_WORKSPACE` | `true` only on a public demo deployment; leave unset for real firms |
| `AGENT_CHALLENGE_PRIVATE_KEY` | Ed25519 key for desktop agent requests (`npm run agent-key -w @synextax/api`). Without it the agent features say they are not set up. |
| `DSC_TRUSTED_ROOTS` | Optional. The CCA India 2022 and 2022 SPL roots are built in (`apps/api/src/security/ccaRoots.ts`, fingerprints pinned); set this (PEM text) or `DSC_TRUSTED_ROOTS_FILE` only to replace them, for example when CCA publishes a new root. In production a DSC that does not chain to these roots is refused. |

Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Never reuse the development values in `apps/api/dev.env`.

## 3. Redeploy and check

After saving the variables, redeploy. `https://<site>/health` should answer 200, then the demo
button on `/login` opens the sample workspace (when `ENABLE_DEMO_WORKSPACE=true`).

The `api` build compiles its workspace packages first (`build:deps` in `apps/api/package.json`),
so it does not depend on the order Vercel builds them in.

## 4. Optional services (all in India)

Each turns on when its settings are present; Settings, Connections in the app shows which are on.

| Service | Settings |
|---|---|
| Client uploads in S3 | `S3_BUCKET`, `S3_REGION` (`ap-south-1` or `ap-south-2`), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (optional `AWS_SESSION_TOKEN`). Objects are written once, encrypted (SSE-S3). The IAM user needs only `s3:PutObject` and `s3:GetObject` on the bucket. |
| Email reminders (Amazon SES) | `MAIL_FROM` (a verified sender), `SES_REGION` (India), the AWS keys. |
| WhatsApp reminders (Meta Cloud API) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_REMINDER_TEMPLATE`, optional `WHATSAPP_TEMPLATE_LANG`. The template takes five values: client name, period, documents outstanding, due date, firm name. |
| Assistant (Amazon Bedrock) | `BEDROCK_REGION` (India), `BEDROCK_MODEL_ID` (a model or an India inference profile; global, US, EU and APAC profiles are refused), the AWS keys. Identifiers are masked before any text is sent. |
| ITR-1 files | `ITR_SOFTWARE_ID` (SW and 8 digits, issued by the Income Tax Department to a registered e-return intermediary), optional `ITR_INTERMEDIARY_CITY`. |

The desktop agent on each computer needs `SYNEXTAX_AGENT_PUBLIC_KEY` (the public half of `AGENT_CHALLENGE_PRIVATE_KEY`) and `SYNEXTAX_ALLOWED_ORIGINS` with the site's address, for example `https://synex-tax.vercel.app`.
