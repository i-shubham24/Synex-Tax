-- =====================================================================
-- SynexTax | Migration 0002 | Request context primitives
-- Target   : PostgreSQL 17 (AWS RDS Multi-AZ, ap-south-1)
--
-- Every API request / worker job runs inside ONE transaction:
--   BEGIN;
--   SELECT app.set_request_context(firm, user, actor_kind, ip, request_id, user_agent, exp, kid, sig);
--   ... queries ...
--   COMMIT;
-- set_request_context uses set_config(..., is_local => true), i.e. SET LOCAL
-- semantics, so context can never leak across pooled connections (PgBouncer
-- transaction pooling safe).
-- =====================================================================
SET ROLE synextax_owner;

-- Raw GUC readers. NEVER used directly in RLS policies; policies call the
-- validated helpers (app.current_firm_id() etc).
CREATE FUNCTION app.ctx_firm_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app, audit AS $$
  SELECT NULLIF(current_setting('app.current_firm_id', true), '')::uuid
$$;

CREATE FUNCTION app.ctx_user_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app, audit AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

CREATE FUNCTION app.ctx_actor_kind() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app, audit AS $$
  SELECT COALESCE(NULLIF(current_setting('app.actor_kind', true), ''), 'USER')
$$;

CREATE FUNCTION app.ctx_ip() RETURNS inet
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app, audit AS $$
  SELECT NULLIF(current_setting('app.request_ip', true), '')::inet
$$;

CREATE FUNCTION app.ctx_request_id() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app, audit AS $$
  SELECT NULLIF(current_setting('app.request_id', true), '')
$$;

CREATE FUNCTION app.ctx_user_agent() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app, audit AS $$
  SELECT left(NULLIF(current_setting('app.user_agent', true), ''), 512)
$$;

GRANT EXECUTE ON FUNCTION
  app.ctx_firm_id(), app.ctx_user_id(), app.ctx_actor_kind(),
  app.ctx_ip(), app.ctx_request_id(), app.ctx_user_agent()
TO synextax_app, synextax_auth, synextax_rls_helper, synextax_audit_writer;

-- HMAC keys for signed request context. Rotated by the platform; readable
-- ONLY by synextax_rls_helper (never by synextax_app).
CREATE TABLE app.context_keys (
  kid         varchar(32) PRIMARY KEY,
  secret      bytea       NOT NULL CHECK (octet_length(secret) >= 32),
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  retired_at  timestamptz
);
REVOKE ALL ON app.context_keys FROM PUBLIC;
GRANT SELECT ON app.context_keys TO synextax_rls_helper;

-- Generic updated_at maintenance
CREATE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, audit AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Calendar helpers (pure, immutable; no statutory dates encoded here)
CREATE FUNCTION app.month_start(d date) RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app, audit AS $$
  SELECT make_date(extract(year FROM d)::int, extract(month FROM d)::int, 1)
$$;

-- Indian financial / tax year start (April) for a date: 2026-03-31 -> 2025, 2026-04-01 -> 2026
CREATE FUNCTION app.fy_start_year(d date) RETURNS smallint
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app, audit AS $$
  SELECT (CASE WHEN extract(month FROM d) >= 4 THEN extract(year FROM d)
               ELSE extract(year FROM d) - 1 END)::smallint
$$;

-- Months between two month-start dates (b - a)
CREATE FUNCTION app.months_between(a date, b date) RETURNS int
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app, audit AS $$
  SELECT ((extract(year FROM b) - extract(year FROM a)) * 12
        + (extract(month FROM b) - extract(month FROM a)))::int
$$;

GRANT EXECUTE ON FUNCTION app.month_start(date), app.fy_start_year(date), app.months_between(date, date)
TO synextax_app, synextax_rls_helper, synextax_audit_writer;

RESET ROLE;
