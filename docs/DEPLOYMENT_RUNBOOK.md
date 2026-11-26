# SynTax Staging Deployment Runbook & CERT-In Readiness Guide

This runbook documents the deployment, wiring, and security controls for **SynTax** (by **Synex Labs**) connecting `https://synex-tax.vercel.app` to India-resident AWS infrastructure in Mumbai (`ap-south-1`) with automated replication to Hyderabad (`ap-south-2`).

---

## 1. Statutory Architecture & India Data Residency

SynTax enforces **100% India Data Residency** pursuant to:
- **Companies (Accounts) Rules, 2014, Rule 3(6)** (mandatory India primary books of accounts with accessible backup).
- **Digital Personal Data Protection Act, 2023 (DPDP)**.
- **GSTN Statutory Guidelines & MCA Circular 12/2022**.

| Component | AWS Resource | Primary Region | Secondary / DR Region | Compliance Function |
| :--- | :--- | :--- | :--- | :--- |
| **Relational Database** | RDS PostgreSQL 17 (`db.t4g.medium`) | `ap-south-1` (Mumbai) | `ap-south-2` (Hyderabad) | Shared 4-tier Client Master, HMAC audit logs, GST/TDS tables |
| **Cache & Queue** | ElastiCache Redis 7 (`cache.t4g.micro`) | `ap-south-1` (Mumbai) | Re-provisionable via IaC | BullMQ async jobs, 120s distributed locks, idempotency registry |
| **Document Vault** | S3 Bucket with KMS CMK & CRR | `ap-south-1` (Mumbai) | `ap-south-2` (Hyderabad) | 8-year MCA audit pack exports, signed Form 27A, GSTR-3B PDFs |
| **Compute Services** | ECS Fargate (`syntax-api`, workers) | `ap-south-1` (Mumbai) | IaC ready | Provider-agnostic GSP gateway, TRACES pollers, recon workers |
| **NSDL FVU Farm** | Isolated Docker Fargate Runners | `ap-south-1` (Mumbai) | IaC ready | Zero-egress air-gapped container running NSDL FVU JARs |
| **Desktop Bridge** | SynTax Sign Local Agent (`apps/dsc-agent`) | Local Windows/Mac | Loopback only | Zero-Java, hardware PIN isolation, USB token signing |

---

## 2. Vercel Staging Configuration

To wire `https://synex-tax.vercel.app` to the live backend:

1. Open the **Vercel Project Dashboard** -> **Settings** -> **Environment Variables**.
2. Set the following environment variables:

```bash
NEXT_PUBLIC_API_URL=https://staging-api.synextax.in
NEXT_PUBLIC_APP_ENV=staging
NEXT_PUBLIC_DSC_AGENT_URL=http://127.0.0.1:15850
```

3. Ensure route rewrites in `apps/web/next.config.js` properly proxy `/api/v1/*` to `https://staging-api.synextax.in/api/v1/*`.

---

## 3. Production & Staging `.env.production.example`

```bash
# Server Environment
NODE_ENV=production
PORT=4000
APP_BASE_URL=https://app.synextax.in
CORS_ALLOWED_ORIGINS=https://synex-tax.vercel.app,https://app.synextax.in

# PostgreSQL 17 Master Connection (ap-south-1 Mumbai)
DATABASE_URL=postgresql://synextax_app:SECURE_DB_PASSWORD@staging-syntax-db.cxyz123.ap-south-1.rds.amazonaws.com:5432/synextax?sslmode=require
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=25

# ElastiCache Redis 7 (ap-south-1 Mumbai)
REDIS_HOST=staging-syntax-redis.xyz.cache.amazonaws.com
REDIS_PORT=6379
REDIS_AUTH_TOKEN=SECURE_REDIS_AUTH_TOKEN
REDIS_TLS=true

# Security & HMAC Context Tokens
JWT_SECRET=SECURE_256_BIT_SECRET_KEY
REQUEST_CONTEXT_HMAC_KEY=SECURE_64_CHAR_HEX_KEY
NONCE_SECRET=SECURE_NONCE_GENERATION_SECRET

# AWS KMS & S3 Document Vault (ap-south-1 Mumbai with CRR to ap-south-2 Hyderabad)
AWS_REGION=ap-south-1
AWS_DR_REGION=ap-south-2
S3_VAULT_BUCKET=staging-syntax-mca-vault-mumbai
S3_DR_VAULT_BUCKET=staging-syntax-dr-vault-hyderabad
KMS_KEY_ARN=arn:aws:kms:ap-south-1:123456789012:key/xyz-123

# Statutory Gateways (Mock adapter in staging, GSP in production)
GSTN_GATEWAY_PROVIDER=mock
GSP_CLIENT_ID=STAGING_GSP_CLIENT_ID
GSP_CLIENT_SECRET=STAGING_GSP_CLIENT_SECRET

# Isolated FVU Runners (Internal VPC endpoints)
FVU_RUNNER_V1_2_URL=http://fvu-v1-2.internal:8080
FVU_RUNNER_V9_5_URL=http://fvu-v9-5.internal:8080
```

---

## 4. CERT-In VAPT Pre-Production Readiness Checklist

Before live pilot demos on December 2:

- [x] **Zero Commits with Secrets**: Scanned git history for private keys, TLS certs, or AWS keys.
- [x] **USB DSC Hardware Key Isolation**: PIN and private key never transmitted over the wire; hardware token signs locally inside `apps/dsc-agent`.
- [x] **Origin-Pinned Loopback HTTPS**: DSC agent strictly allows `https://app.synextax.in`, `https://synex-tax.vercel.app`, and `http://localhost:3000` (dev only).
- [x] **Nonce Replay Prevention**: Every DSC signature request requires a single-use SHA-256 nonce with TTL <= 120s.
- [x] **Zero-Egress Container Isolation**: NSDL Java FVU runners execute in an air-gapped security group with no outbound internet access.
- [x] **PostgreSQL 17 RLS & HMAC Context**: All database mutations execute with `app.set_request_context` verifying tenant isolation.
- [x] **MCA Rule 3(6) Cross-Region Replication**: S3 buckets configured with automated replication from Mumbai to Hyderabad.
- [x] **AWS Activate Runway Safeguard**: Monthly budget limit of $400 ($5,000 Activate 1-year runway) with automated email alerts at 80% and 100%.
