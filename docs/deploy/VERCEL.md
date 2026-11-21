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
| `JWT_SECRET` | 64 random hex characters |
| `CHALLENGE_JWT_SECRET` | 64 random hex characters, different from the above |
| `CONTEXT_HMAC_SECRET` | 64 random hex characters, the same value used when migrating |
| `CONTEXT_HMAC_KID` | `synextax-prod-01` |
| `DATABASE_URL` | the application login, with `?sslmode=require` |
| `AUTH_DATABASE_URL` | optional: a separate login for sign-in; falls back to `DATABASE_URL` |
| `APP_URL` | `https://synex-tax.vercel.app` (or the custom domain) |
| `ENABLE_DEMO_WORKSPACE` | `true` only on a public demo deployment; leave unset for real firms |

Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Never reuse the development values in `apps/api/dev.env`.

## 3. Redeploy and check

After saving the variables, redeploy. `https://<site>/health` should answer 200, then the demo
button on `/login` opens the sample workspace (when `ENABLE_DEMO_WORKSPACE=true`).

The `api` build compiles its workspace packages first (`build:deps` in `apps/api/package.json`),
so it does not depend on the order Vercel builds them in.
