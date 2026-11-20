-- =====================================================================
-- SynexTax | Migration 0011 | Auth module access and workspace provisioning
-- Target   : PostgreSQL 17
--
-- 1. The auth module (role synextax_auth) owns credentials, MFA factors and
--    sessions. It never reads tenant tables directly; firm memberships come
--    from one pinned SECURITY DEFINER lookup.
-- 2. Signup has to create a firm before any partner exists. A signed
--    SYSTEM_JOB context (HMAC-verified, no user) may provision its own firm,
--    its users and their assignments. It can never reach another firm,
--    because the firm id is part of the signed context.
-- 3. Trial window on the firm.
-- =====================================================================
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 1. Trial window
-- ---------------------------------------------------------------------
ALTER TABLE public.firms ADD COLUMN trial_ends_at timestamptz;

-- ---------------------------------------------------------------------
-- 2. Auth module grants: no DELETE, sessions are revoked, never removed
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON auth.identities, auth.mfa_factors, auth.sessions TO synextax_auth;

-- ---------------------------------------------------------------------
-- 3. Signed platform job helper
-- ---------------------------------------------------------------------
CREATE FUNCTION app.is_system_job() RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app AS $$
  SELECT COALESCE((SELECT actor_kind = 'SYSTEM_JOB' AND user_id IS NULL FROM app.verified_context()), false)
$$;
ALTER FUNCTION app.is_system_job() OWNER TO synextax_rls_helper;

-- Firm memberships for an identity, used at sign-in before any tenant context exists.
CREATE FUNCTION app.list_memberships(p_identity_id uuid)
RETURNS TABLE (user_id uuid, firm_id uuid, firm_name text, role public.user_role, display_name text, trial_ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app AS $$
  SELECT u.id, f.id, COALESCE(f.trade_name, f.legal_name)::text, u.role, u.display_name::text, f.trial_ends_at
  FROM public.users u
  JOIN public.firms f ON f.id = u.firm_id
  WHERE u.identity_id = p_identity_id
    AND u.status = 'ACTIVE'
    AND f.status = 'ACTIVE'
  ORDER BY u.created_at
$$;
REVOKE ALL ON FUNCTION app.list_memberships(uuid) FROM PUBLIC;
ALTER FUNCTION app.list_memberships(uuid) OWNER TO synextax_rls_helper;

SET ROLE synextax_rls_helper;
GRANT EXECUTE ON FUNCTION app.is_system_job() TO synextax_owner, synextax_app, synextax_auth, synextax_audit_writer;
GRANT EXECUTE ON FUNCTION app.list_memberships(uuid) TO synextax_auth;
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 4. Firm, user and assignment writes: partners, or a signed job for its own firm
-- ---------------------------------------------------------------------
DROP POLICY p_firm_write ON public.firms;
CREATE POLICY p_firm_write ON public.firms
  FOR ALL TO synextax_app
  USING (id = (SELECT app.current_firm_id())
         AND ((SELECT app.current_user_role()) = 'PARTNER' OR (SELECT app.is_system_job())))
  WITH CHECK (id = (SELECT app.current_firm_id())
              AND ((SELECT app.current_user_role()) = 'PARTNER' OR (SELECT app.is_system_job())));

DROP POLICY p_users_write ON public.users;
CREATE POLICY p_users_write ON public.users
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id())
         AND ((SELECT app.current_user_role()) = 'PARTNER' OR (SELECT app.is_system_job())))
  WITH CHECK (firm_id = (SELECT app.current_firm_id())
              AND ((SELECT app.current_user_role()) = 'PARTNER' OR (SELECT app.is_system_job())));

DROP POLICY p_uca_write ON public.user_client_assignments;
CREATE POLICY p_uca_write ON public.user_client_assignments
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id())
         AND ((SELECT app.current_user_role()) = 'PARTNER' OR (SELECT app.is_system_job())))
  WITH CHECK (firm_id = (SELECT app.current_firm_id())
              AND ((SELECT app.current_user_role()) = 'PARTNER' OR (SELECT app.is_system_job())));

RESET ROLE;
