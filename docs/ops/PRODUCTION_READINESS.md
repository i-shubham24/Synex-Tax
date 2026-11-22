# Production readiness

Where SynexTax stands on each item of the engineering checklist, as of 21 Nov 2026. "In code" means
the repository does it and a test checks it. "Platform" means it is a setting or service of the
hosting (Vercel for web and API, managed PostgreSQL, AWS Mumbai for files, mail and the assistant),
not code. "Open" means it is not done yet.

## Security

| Item | Status |
|---|---|
| SQL injection | In code. Every query uses `$n` parameters; the few dynamic parts are fixed strings or allowlists (PII reveal, audit filter). |
| XSS | In code. No `dangerouslySetInnerHTML` or `innerHTML`; React escapes output. Web CSP is set per request in `apps/web/src/proxy.ts`: scripts run only with that request's nonce or when loaded by a nonced script (`'strict-dynamic'`); no `eval` and no `'unsafe-inline'` for scripts in production; `object-src 'none'`, `frame-ancestors 'none'`. Every page renders per request for this. Styles keep `'unsafe-inline'` (server-rendered style attributes cannot carry a nonce). |
| CSRF | In code. Tokens are bound to the session cookie they were issued for, sent only in a header, and a bearer token excuses a request only once it verifies (`plugins/csrfProtection.ts`). The refresh cookie is `HttpOnly`, `SameSite=Lax`, `Secure`, scoped to `/api/v1/auth`. |
| JWT | In code. HS256 only, issuer and audience checked, one-hour access tokens renewed from a rotating refresh cookie; reuse of a rotated refresh token ends every session of the account. |
| OAuth | Not used; sign-in is email, Argon2id password and TOTP. |
| Passwords | In code. Argon2id (19 MiB, t=2). Wrong passwords and wrong MFA codes share one lockout (5, then 15 minutes). Login checks the password before saying whether an account is locked. |
| MFA | In code. TOTP secrets encrypted with AES-256-GCM, each code used once (atomic), recovery codes single use. Every account except the local demo has MFA. |
| Secrets management | In code. Every signing secret fails closed outside `NODE_ENV=development/test` (`security/env.ts`). Secrets live in the platform's encrypted environment; nothing secret is in `NEXT_PUBLIC_*`. Open: rotation is manual. |
| Tokens in the browser | In code. Access token in memory only; nothing in local or session storage; logout clears every key. |
| Permissions on the server | In code. JWT checked on every route; per-screen modules checked against the matched route (encoded paths cannot slip past); maker-checker on signing and filing; row-level security in PostgreSQL decides which clients a user sees. |
| RLS | In code. All 41 tenant tables and 5 audit tables have RLS enabled and forced, with policies; tests prove tenant isolation. |
| Webhook signatures | In code. HMAC-SHA256 over the raw body and a required timestamp, 5-minute window, each signature accepted once (across instances when `REDIS_URL` is set). |
| SSRF | In code. No outbound URL comes from users today. `security/ssrfGuard.ts` blocks private, loopback, link-local and mapped IPv6 forms and checks DNS answers, for any future user-supplied URL. |
| CORS | In code. Exact origins only (`APP_URL`, `CORS_ORIGINS`); localhost only in development. |
| Rate limiting | In code: 300 a minute per client, tighter on sign-in, MFA, sign-up, demo, upload links, exports, PII reveal. With `REDIS_URL` the counters are shared by every instance (`infra/redis.ts`); without it each instance counts on its own. |
| File uploads | In code. Type by magic bytes (JPEG, PNG, PDF), 10 MB cap, link checked before the body is read, sanitised names, write-once storage, SHA-256 kept and checked on download. |
| Source maps | In code. Not published for the browser. |
| Default credentials | In code. The demo account works only where the demo is switched on; the database password has no default outside development. |
| Sensitive data in logs | In code. Authorization, cookies and CSRF headers redacted; upload-link tokens masked in URLs; database errors logged by code and message only; 5xx responses never carry internal messages. |
| Vulnerable dependencies | In code. `npm audit --omit=dev` is clean (zod moved to 4.6.7); CI fails on high or critical advisories. |
| DSC signatures | In code. Checked against the certificate and the built-in CCA India 2022 roots. |
| IAM | Platform. The S3 user needs only `PutObject` and `GetObject` on the bucket; database roles are least-privilege (`synextax_app`, `synextax_auth`, audit writer). |
| WAF, DDoS protection | Platform. Vercel's edge firewall; add rules for `/api/v1/auth/*` and `/api/v1/portal/*`. |
| TLS, encryption in transit | Platform. HTTPS everywhere, HSTS preload; database with `sslmode=require`. |
| Encryption at rest | Platform plus code. Managed PostgreSQL and S3 (SSE) encrypt at rest; TOTP secrets are also encrypted by the app. |

## Reliability

| Item | Status |
|---|---|
| Timeouts | In code. Every outbound call has one (S3 30 s, SES and WhatsApp 10 s, Bedrock 30 s, portal probes); database statements 15 s, queries 20 s. |
| Retries, exponential backoff | In code where safe: S3 reads retry twice with jittered backoff. Writes are not retried blindly. |
| Circuit breakers | In code. SES, WhatsApp and Bedrock fail fast for a minute after five failures. |
| Idempotency | In code. Any POST, PUT, PATCH or DELETE with an `Idempotency-Key` runs once; repeats get the first answer for 24 hours (`plugins/idempotency.ts`). |
| Optimistic locking | In code on salary employees, practice tasks, deductor (TAN) details, checklist items, team screens and the firm's details: `If-Match` with the version the client read, 409 when someone saved in between. The web forms send it and reload on a conflict. |
| Pessimistic and distributed locks | In code where needed: the audit hash chain locks each firm's chain head row; refresh-token rotation and MFA codes use single conditional updates. |
| Deadlocks | Transactions are short and lock one firm's rows in a fixed order; no known cycles. |
| Data validation | In code. zod on every request body; database CHECK constraints and triggers behind it. |
| Health checks, liveness and readiness | In code. `/health/liveness`; `/health/readiness` answers 503 unless the database replies within 2 s. |
| Error handling | In code. One error handler: full error to the log with the request id, a plain message and the request id to the client. |
| Logging | In code. Structured JSON (pino) with request ids. |
| Monitoring, alerts, SLOs, error budgets | In code and config. `GET /metrics` (with `METRICS_TOKEN`) gives requests by route and status and a latency histogram per route in the Prometheus format; `docs/ops/alerts.yml` holds the SLOs (99.5% of requests without a 5xx, 99% under 1 s, per 30 days) and burn-rate, latency, sign-in and readiness alerts. Left to choose: the service that scrapes and pages (Grafana Cloud, Amazon Managed Prometheus or similar), and who it pages. |
| Distributed tracing | Not needed with one API and one database; every log line carries the request id, which the client also receives on errors. |
| Connection pooling | In code (pool of 10, timeouts). On serverless put a transaction pooler in front (see `docs/deploy/VERCEL.md`). |
| Indexing, query optimisation | In code. Indexes on every foreign key the API filters by and on the audit log's newest-first read (migration 0028). |
| N+1 queries | Reads are joined; imports insert in multi-row statements of up to 1,000 rows (`db/batchInsert.ts`): GST sales registers, quarter and statement imports, task generation. |
| Caching, cache invalidation | Portal reachability is cached five minutes. Nothing else is cached, so there is nothing to invalidate. |
| Message queues, dead letter queues | `workers/queue-worker` exists for FVU jobs. Open: run it with a real queue and a dead-letter queue when filing goes live. |
| Pub/sub, event-driven, sagas, distributed transactions | Not needed: one database, every change in one transaction. |
| Read replicas, partitioning, replication, leader election | Platform. Not needed at current size; the audit log is the first table to partition by month when it grows. |
| CAP, eventual consistency | One primary database: reads see the latest write. |
| WebSockets, SSE, long polling | Not used. |
| Backup, disaster recovery, failover | Platform. Managed PostgreSQL with point-in-time recovery and Multi-AZ in Mumbai; S3 versioning on the upload bucket. Open: a written restore drill. |
| Multi-region | Not wanted: data stays in India (Mumbai, with Hyderabad as the second region if needed). |
| Chaos engineering | Open. |
| Feature flags | In code. Per-firm modules and `compliance_feature_flags`; services switch on with their settings. |
| Blue-green, canary, rolling deployments | Platform. Vercel deploys immutably with instant rollback; preview deployments for every branch. |
| CI/CD | In code. `.github/workflows/ci.yml`: install, audit, build, web type check, tax-engine, database, API and client tests, and the desktop agent on Windows. |
| Docker, Kubernetes, Helm, Terraform, service discovery, load balancing, reverse proxies, API gateways | Not used on Vercel. If the API moves to containers, add a Dockerfile, IaC for the database, bucket and IAM user, and keep the same health endpoints. |
| Cold starts, serverless limits | The API is one function; keep the pool small, the bundle lean, and long work (FVU, imports) under the function time limit or in the worker. |
| Cost | Pay per use on Vercel and AWS; the assistant runs only when asked. |
| API versioning, semantic versioning | Every route is under `/api/v1`; packages carry semver versions. |
| Webhooks | Signed, timestamped, replay-checked (above). |
| HTTP/2, HTTP/3, TLS | Platform (Vercel edge). |
| gRPC, TCP vs UDP | Not used. |
| Latency, P99, throughput | Measured per route by `/metrics`; the p99 alert is in `alerts.yml`. |
| Clock skew | TOTP accepts one 30-second step either side; CSRF tokens and webhooks allow 60 s ahead. Servers keep time with the platform's NTP. |
| DNS | Platform. |
| Incidents, on-call, postmortems | Open: name an on-call owner, a status page and a postmortem template before the first paying firm. |
