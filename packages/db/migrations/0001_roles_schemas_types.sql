-- =====================================================================
-- SynexTax | Migration 0001 | Roles, schemas, extensions, core types
-- Target   : PostgreSQL 17 (AWS RDS Multi-AZ, ap-south-1)
-- Executed : by the deploy pipeline as a role able to create roles and
--            event triggers (rds_superuser on RDS). Forward-only.
-- Rule     : a shipped migration is never edited; fixes go in a new file.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Roles
--   synextax_owner        NOLOGIN  owns every schema object; migrations SET ROLE to it
--   synextax_app          LOGIN    Fastify API + BullMQ workers; always subject to RLS; no DDL
--   synextax_auth         LOGIN    auth module only (credentials, MFA, sessions)
--   synextax_rls_helper   NOLOGIN  owns SECURITY DEFINER tenancy helpers (breaks RLS recursion)
--   synextax_audit_writer NOLOGIN  owns audit capture functions; the ONLY role that can INSERT audit rows
--   synextax_auditor      NOLOGIN  read-only audit role granted to statutory-auditor logins
-- Passwords are never set here: production uses RDS IAM auth / Secrets Manager rotation.
-- ---------------------------------------------------------------------
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['synextax_owner','synextax_rls_helper','synextax_audit_writer','synextax_auditor'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', r);
    END IF;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['synextax_app','synextax_auth'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT', r);
    END IF;
  END LOOP;
END $$;

-- The owner may SET ROLE to the definer roles (to hand over function ownership)
-- but does not inherit their privileges.
GRANT synextax_rls_helper   TO synextax_owner WITH INHERIT FALSE, SET TRUE;
GRANT synextax_audit_writer TO synextax_owner WITH INHERIT FALSE, SET TRUE;

-- ---------------------------------------------------------------------
-- 2. Schemas and extensions
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION synextax_owner;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;   -- hmac() for signed request context

CREATE SCHEMA IF NOT EXISTS app   AUTHORIZATION synextax_owner;   -- context + rule functions
CREATE SCHEMA IF NOT EXISTS auth  AUTHORIZATION synextax_owner;   -- identities, MFA, sessions
CREATE SCHEMA IF NOT EXISTS audit AUTHORIZATION synextax_owner;   -- append-only evidence

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO synextax_owner;

GRANT USAGE ON SCHEMA public, app, extensions
  TO synextax_app, synextax_auth, synextax_rls_helper, synextax_audit_writer, synextax_auditor;
GRANT USAGE, CREATE ON SCHEMA app TO synextax_rls_helper, synextax_audit_writer;
GRANT USAGE ON SCHEMA auth  TO synextax_auth, synextax_rls_helper;
GRANT USAGE ON SCHEMA audit TO synextax_app, synextax_auditor, synextax_rls_helper;
GRANT USAGE, CREATE ON SCHEMA audit TO synextax_audit_writer;

-- Functions are not executable by PUBLIC unless granted explicitly.
ALTER DEFAULT PRIVILEGES FOR ROLE synextax_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 3. Core enumerations
-- ---------------------------------------------------------------------
CREATE TYPE public.user_role AS ENUM ('PARTNER','MANAGER','STAFF','CLIENT');

CREATE TYPE public.actor_kind AS ENUM ('USER','SYSTEM_JOB','CLIENT_PORTAL');

CREATE TYPE public.lifecycle_status AS ENUM ('ACTIVE','INACTIVE','ARCHIVED');

CREATE TYPE public.entity_constitution AS ENUM (
  'INDIVIDUAL','PROPRIETORSHIP','HUF','PARTNERSHIP','LLP',
  'PRIVATE_LIMITED','PUBLIC_LIMITED','ONE_PERSON_COMPANY','SECTION_8_COMPANY','FOREIGN_COMPANY',
  'TRUST','SOCIETY','AOP','BOI','COOPERATIVE_SOCIETY','LOCAL_AUTHORITY','GOVERNMENT',
  'ARTIFICIAL_JURIDICAL_PERSON'
);

-- Split Composition into 10(1) (Goods/Restaurants) and 10(2A) (Services/Mixed) per Nov 1, 2026 GSTN advisory
CREATE TYPE public.gst_registration_type AS ENUM (
  'REGULAR','COMPOSITION_10_1','COMPOSITION_10_2A','SEZ_UNIT','SEZ_DEVELOPER','ISD','TDS_DEDUCTOR','TCS_COLLECTOR',
  'NON_RESIDENT','OIDAR','CASUAL','UIN_HOLDER'
);

-- Maker-checker filing state machine with full lifecycle
CREATE TYPE public.filing_workflow_status AS ENUM (
  'DRAFT','VALIDATED','RECONCILED','CLIENT_APPROVED','PORTAL_SAVED','FILED','CLOSED'
);

-- IMS action states: Accept, Reject, Pending, No action (deemed accepted at 2B generation)
CREATE TYPE public.ims_action AS ENUM ('A','R','P','NONE');

-- Dual-Act router. The cutover DATE is data (statutory_regimes), never code.
CREATE TYPE public.statutory_regime AS ENUM ('IT_ACT_1961','IT_ACT_2025');

CREATE TYPE public.job_priority AS ENUM ('HIGH','MEDIUM','LOW');

CREATE TYPE public.signoff_method AS ENUM ('DSC','EVC','AADHAAR_OTP','AADHAAR_ESIGN');

CREATE TYPE public.ui_language AS ENUM ('en','pa','hi');

RESET ROLE;
