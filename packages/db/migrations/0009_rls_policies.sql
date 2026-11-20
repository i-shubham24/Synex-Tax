-- =====================================================================
-- SynexTax | Migration 0009 | Row-Level Security (RLS) & RBAC Isolation
-- Target   : PostgreSQL 17 (AWS RDS Multi-AZ, ap-south-1)
-- Enforces : HMAC-verified context, 4-Role RBAC, Maker-Checker segregation
-- =====================================================================
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 1. Grant Lookup Permissions to synextax_rls_helper
-- ---------------------------------------------------------------------
GRANT USAGE ON SCHEMA public, app, extensions TO synextax_rls_helper;
GRANT SELECT ON public.firms, public.users, public.user_client_assignments, public.entities
  TO synextax_rls_helper;

-- ---------------------------------------------------------------------
-- 2. HMAC-Signed Request Context Verification
-- The signature is re-checked every time the context is read. Settings are
-- never trusted on their own: any role can call set_config(), so a stored
-- "verified" flag would let an SQL injection switch tenants or forge the
-- actor. Owned by synextax_rls_helper, the only role that can read
-- app.context_keys. Fails closed (NULL context) if the signature is missing,
-- malformed, expired, made with an unknown or retired key, or forged.
-- ---------------------------------------------------------------------
CREATE FUNCTION app.context_signature_valid(
  p_firm_id     uuid,
  p_user_id     uuid,
  p_actor_kind  text,
  p_exp         bigint,
  p_kid         text,
  p_sig         text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL SAFE
SET search_path = pg_catalog, public, app, extensions AS $$
DECLARE
  v_secret   bytea;
  v_expected bytea;
BEGIN
  IF p_firm_id IS NULL OR p_actor_kind IS NULL OR p_exp IS NULL OR p_kid IS NULL OR p_sig IS NULL THEN
    RETURN false;
  END IF;
  IF p_actor_kind NOT IN ('USER','SYSTEM_JOB','CLIENT_PORTAL') THEN
    RETURN false;
  END IF;
  -- now() is the transaction start: a context authorises the whole transaction it opened.
  IF p_exp <= extract(epoch FROM now())::bigint THEN
    RETURN false;
  END IF;
  IF lower(p_sig) !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  SELECT secret INTO v_secret
  FROM app.context_keys
  WHERE kid = p_kid AND active AND retired_at IS NULL;
  IF v_secret IS NULL THEN
    RETURN false;
  END IF;

  -- Payload format shared with apps/api (DatabaseManager.generateContextSignature).
  v_expected := extensions.hmac(
    convert_to(p_firm_id::text || ':' || COALESCE(p_user_id::text, '') || ':' || p_actor_kind || ':' || p_exp::text, 'UTF8'),
    v_secret, 'sha256');

  -- Compare digests of both values so timing does not reveal how many leading bytes matched.
  RETURN extensions.digest(v_expected, 'sha256') = extensions.digest(decode(lower(p_sig), 'hex'), 'sha256');
END;
$$;

-- Verifies the signature, then stores the signed fields (never a verdict) as
-- transaction-local settings. Every reader re-verifies them.
CREATE FUNCTION app.set_request_context(
  p_firm_id     uuid,
  p_user_id     uuid,
  p_actor_kind  text,
  p_ip          inet,
  p_request_id  text,
  p_user_agent  text,
  p_exp         bigint,
  p_kid         varchar(32),
  p_sig         text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_ok boolean := app.context_signature_valid(p_firm_id, p_user_id, p_actor_kind, p_exp, p_kid, p_sig);
BEGIN
  PERFORM set_config('app.current_firm_id', CASE WHEN v_ok THEN p_firm_id::text ELSE '' END, true);
  PERFORM set_config('app.current_user_id', CASE WHEN v_ok THEN COALESCE(p_user_id::text, '') ELSE '' END, true);
  PERFORM set_config('app.actor_kind',      CASE WHEN v_ok THEN p_actor_kind ELSE '' END, true);
  PERFORM set_config('app.ctx_exp',         CASE WHEN v_ok THEN p_exp::text ELSE '' END, true);
  PERFORM set_config('app.ctx_kid',         CASE WHEN v_ok THEN p_kid ELSE '' END, true);
  PERFORM set_config('app.ctx_sig',         CASE WHEN v_ok THEN lower(p_sig) ELSE '' END, true);
  PERFORM set_config('app.request_ip',      CASE WHEN v_ok THEN COALESCE(host(p_ip), '') ELSE '' END, true);
  PERFORM set_config('app.request_id',      CASE WHEN v_ok THEN COALESCE(left(p_request_id, 128), '') ELSE '' END, true);
  PERFORM set_config('app.user_agent',      CASE WHEN v_ok THEN COALESCE(left(p_user_agent, 512), '') ELSE '' END, true);
  RETURN v_ok;
END;
$$;

-- The one place context is read. Returns NULLs unless the stored fields still carry a valid signature.
CREATE FUNCTION app.verified_context(OUT firm_id uuid, OUT user_id uuid, OUT actor_kind text)
LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL SAFE
SET search_path = pg_catalog, public, app AS $$
DECLARE
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_firm  text := COALESCE(current_setting('app.current_firm_id', true), '');
  v_user  text := COALESCE(current_setting('app.current_user_id', true), '');
  v_actor text := NULLIF(current_setting('app.actor_kind', true), '');
  v_exp   text := COALESCE(current_setting('app.ctx_exp', true), '');
BEGIN
  -- Shape checks before casts, so malformed settings mean "no context" rather than an error.
  IF lower(v_firm) !~ c_uuid OR (v_user <> '' AND lower(v_user) !~ c_uuid) OR v_exp !~ '^[0-9]{1,18}$' THEN
    RETURN;
  END IF;
  IF app.context_signature_valid(v_firm::uuid, NULLIF(v_user, '')::uuid, v_actor, v_exp::bigint,
       NULLIF(current_setting('app.ctx_kid', true), ''), NULLIF(current_setting('app.ctx_sig', true), '')) THEN
    firm_id    := v_firm::uuid;
    user_id    := NULLIF(v_user, '')::uuid;
    actor_kind := v_actor;
  END IF;
END;
$$;

CREATE FUNCTION app.current_firm_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app AS $$
  SELECT firm_id FROM app.verified_context()
$$;

CREATE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app AS $$
  SELECT user_id FROM app.verified_context()
$$;

CREATE FUNCTION app.current_actor_kind() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app AS $$
  SELECT actor_kind FROM app.verified_context()
$$;

CREATE FUNCTION app.current_user_role() RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER PARALLEL SAFE
SET search_path = pg_catalog, public, app AS $$
  SELECT u.role
  FROM app.verified_context() c
  JOIN public.users u ON u.id = c.user_id AND u.firm_id = c.firm_id
  WHERE u.status = 'ACTIVE'
$$;

CREATE FUNCTION app.is_entity_visible(p_entity_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL SAFE
SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_firm_id uuid;
  v_user_id uuid;
  v_actor   text;
  v_role    public.user_role;
BEGIN
  SELECT c.firm_id, c.user_id, c.actor_kind INTO v_firm_id, v_user_id, v_actor FROM app.verified_context() c;
  IF v_firm_id IS NULL THEN
    RETURN false;
  END IF;

  -- Signed platform jobs (GSTN polls, radars, imports) act for the whole firm.
  IF v_actor = 'SYSTEM_JOB' AND v_user_id IS NULL THEN
    RETURN true;
  END IF;

  SELECT role INTO v_role
  FROM public.users
  WHERE id = v_user_id AND firm_id = v_firm_id AND status = 'ACTIVE';

  IF v_role = 'PARTNER' THEN
    RETURN true;
  END IF;

  IF v_role IN ('MANAGER', 'STAFF', 'CLIENT') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_client_assignments uca
      JOIN public.entities e ON e.firm_id = v_firm_id AND e.id = p_entity_id
      WHERE uca.firm_id = v_firm_id
        AND uca.user_id = v_user_id
        AND uca.revoked_at IS NULL
        AND (uca.entity_id = p_entity_id OR uca.client_group_id = e.client_group_id)
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION app.context_signature_valid(uuid,uuid,text,bigint,text,text) FROM PUBLIC;
ALTER FUNCTION app.context_signature_valid(uuid,uuid,text,bigint,text,text) OWNER TO synextax_rls_helper;
ALTER FUNCTION app.set_request_context(uuid,uuid,text,inet,text,text,bigint,varchar,text) OWNER TO synextax_rls_helper;
ALTER FUNCTION app.verified_context() OWNER TO synextax_rls_helper;
ALTER FUNCTION app.current_firm_id() OWNER TO synextax_rls_helper;
ALTER FUNCTION app.current_user_id() OWNER TO synextax_rls_helper;
ALTER FUNCTION app.current_actor_kind() OWNER TO synextax_rls_helper;
ALTER FUNCTION app.current_user_role() OWNER TO synextax_rls_helper;
ALTER FUNCTION app.is_entity_visible(uuid) OWNER TO synextax_rls_helper;

SET ROLE synextax_rls_helper;
GRANT EXECUTE ON FUNCTION
  app.set_request_context(uuid,uuid,text,inet,text,text,bigint,varchar,text),
  app.verified_context(),
  app.current_firm_id(), app.current_user_id(), app.current_actor_kind(),
  app.current_user_role(), app.is_entity_visible(uuid)
TO synextax_owner, synextax_app, synextax_auth, synextax_audit_writer;
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 3. Enable & Force RLS across Tenant & Audit Tables
-- ---------------------------------------------------------------------
ALTER TABLE public.firms                            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_client_assignments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_groups                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_contacts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_bank_accounts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gst_registrations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tan_registrations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dsc_inventory                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dsc_portal_registrations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dpdp_consent_records             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statutory_legal_holds            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gst_invoices_sales               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gst_invoices_purchase            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gst_2b_records                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ims_action_queue                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gst_filings                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tds_challans                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tds_challan_section_allocations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tds_deductees                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tds_returns                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tds_fvu_jobs                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_subscriptions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_invoices            ENABLE ROW LEVEL SECURITY;

-- Audit Tables RLS (Isolation for firm auditor views)
ALTER TABLE audit.immutable_audit_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.signing_audit_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.pii_access_logs                   ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.firms                            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.users                            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_client_assignments          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.client_groups                    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.entities                         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.entity_contacts                  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.entity_bank_accounts             FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gst_registrations                FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tan_registrations                FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dsc_inventory                    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dsc_portal_registrations         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dpdp_consent_records             FORCE ROW LEVEL SECURITY;
ALTER TABLE public.statutory_legal_holds            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gst_invoices_sales               FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gst_invoices_purchase            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gst_2b_records                   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ims_action_queue                 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gst_filings                      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tds_challans                     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tds_challan_section_allocations  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tds_deductees                    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tds_returns                      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tds_fvu_jobs                     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.firm_subscriptions               FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_invoices            FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.immutable_audit_logs              FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.signing_audit_logs                FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.pii_access_logs                   FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 4. Define Policies with Hardened Role Boundaries
-- ---------------------------------------------------------------------

-- Firm policy: Read for members, write strictly PARTNER
CREATE POLICY p_firm_select ON public.firms
  FOR SELECT TO synextax_app USING (id = (SELECT app.current_firm_id()));
CREATE POLICY p_firm_write ON public.firms
  FOR ALL TO synextax_app
  USING (id = (SELECT app.current_firm_id()) AND (SELECT app.current_user_role()) = 'PARTNER')
  WITH CHECK (id = (SELECT app.current_firm_id()) AND (SELECT app.current_user_role()) = 'PARTNER');

-- Users policy: Read for members, write strictly PARTNER
CREATE POLICY p_users_select ON public.users
  FOR SELECT TO synextax_app USING (firm_id = (SELECT app.current_firm_id()));
CREATE POLICY p_users_write ON public.users
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND (SELECT app.current_user_role()) = 'PARTNER')
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND (SELECT app.current_user_role()) = 'PARTNER');

-- Client assignments: Write strictly PARTNER
CREATE POLICY p_uca_select ON public.user_client_assignments
  FOR SELECT TO synextax_app USING (firm_id = (SELECT app.current_firm_id()));
CREATE POLICY p_uca_write ON public.user_client_assignments
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND (SELECT app.current_user_role()) = 'PARTNER')
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND (SELECT app.current_user_role()) = 'PARTNER');

-- Client groups
CREATE POLICY p_client_groups_tenant ON public.client_groups
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()));

-- Entity & Sub-entity Tables (Filtered by is_entity_visible)
CREATE POLICY p_entities_tenant ON public.entities
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(id));

CREATE POLICY p_entity_contacts_tenant ON public.entity_contacts
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_entity_bank_accounts_tenant ON public.entity_bank_accounts
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_gst_registrations_tenant ON public.gst_registrations
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_tan_registrations_tenant ON public.tan_registrations
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_dsc_inventory_tenant ON public.dsc_inventory
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_dsc_portal_reg_tenant ON public.dsc_portal_registrations
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_dpdp_consent_tenant ON public.dpdp_consent_records
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_statutory_holds_tenant ON public.statutory_legal_holds
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

-- GST Transaction Tables
CREATE POLICY p_gst_sales_tenant ON public.gst_invoices_sales
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_gst_purchase_tenant ON public.gst_invoices_purchase
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_gst_2b_tenant ON public.gst_2b_records
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_ims_queue_tenant ON public.ims_action_queue
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_gst_filings_tenant ON public.gst_filings
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

-- TDS Transaction Tables
CREATE POLICY p_tds_challans_tenant ON public.tds_challans
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_tds_alloc_tenant ON public.tds_challan_section_allocations
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_tds_deductees_tenant ON public.tds_deductees
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_tds_returns_tenant ON public.tds_returns
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_tds_fvu_jobs_tenant ON public.tds_fvu_jobs
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

-- Subscriptions & Billing
CREATE POLICY p_firm_sub_tenant ON public.firm_subscriptions
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()));

CREATE POLICY p_sub_invoices_tenant ON public.subscription_invoices
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()));

-- Audit Tables Policies: Read-only scoped to firm
CREATE POLICY p_audit_logs_tenant ON audit.immutable_audit_logs
  FOR SELECT TO synextax_app USING (firm_id = (SELECT app.current_firm_id()));

CREATE POLICY p_signing_logs_tenant ON audit.signing_audit_logs
  FOR SELECT TO synextax_app USING (firm_id = (SELECT app.current_firm_id()));

CREATE POLICY p_pii_logs_tenant ON audit.pii_access_logs
  FOR SELECT TO synextax_app USING (firm_id = (SELECT app.current_firm_id()));

-- The audit writer role only runs inside SECURITY DEFINER functions
-- (capture_audit_event, log_signing_event, log_pii_access). It may append,
-- never read, update or delete.
CREATE POLICY p_audit_writer_append ON audit.immutable_audit_logs
  FOR INSERT TO synextax_audit_writer WITH CHECK (true);
CREATE POLICY p_audit_writer_append ON audit.signing_audit_logs
  FOR INSERT TO synextax_audit_writer WITH CHECK (true);
CREATE POLICY p_audit_writer_append ON audit.pii_access_logs
  FOR INSERT TO synextax_audit_writer WITH CHECK (true);

-- The RLS helper resolves roles and assignments for the policies above. It
-- has no login and only runs inside the pinned SECURITY DEFINER helpers, so it
-- reads these four tables unfiltered (read only).
CREATE POLICY p_rls_helper_read ON public.firms                   FOR SELECT TO synextax_rls_helper USING (true);
CREATE POLICY p_rls_helper_read ON public.users                   FOR SELECT TO synextax_rls_helper USING (true);
CREATE POLICY p_rls_helper_read ON public.user_client_assignments FOR SELECT TO synextax_rls_helper USING (true);
CREATE POLICY p_rls_helper_read ON public.entities                FOR SELECT TO synextax_rls_helper USING (true);

-- ---------------------------------------------------------------------
-- 5. Global Config Lockdown
-- Revoke mutation privileges on global reference tables from synextax_app
-- ---------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.compliance_feature_flags,
  public.portal_health_status,
  public.dlt_sms_templates
FROM synextax_app, synextax_auth;

GRANT SELECT ON
  public.compliance_feature_flags,
  public.portal_health_status,
  public.dlt_sms_templates,
  public.v_dlt_inactive_template_radar
TO synextax_app;

-- ---------------------------------------------------------------------
-- 6. Hardened Maker-Checker & Segregation of Duties Trigger
-- ---------------------------------------------------------------------
CREATE FUNCTION app.enforce_maker_checker_filing_lock() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_ctx          record;
  v_role         public.user_role;
  v_can_approve  boolean;
  v_enforce_sod  boolean;
  v_signer_role  public.user_role;
  v_signer_deleg boolean;
BEGIN
  SELECT * INTO v_ctx FROM app.verified_context();

  -- The maker is whoever created the row under a signed context; it can never be edited later.
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(v_ctx.user_id, NEW.created_by);
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;

  IF NEW.workflow_status = 'FILED' AND (TG_OP = 'INSERT' OR OLD.workflow_status IS DISTINCT FROM 'FILED') THEN
    IF v_ctx.actor_kind = 'SYSTEM_JOB' AND v_ctx.user_id IS NULL THEN
      -- A signed worker completing RETFILE / FVU upload: a checker must already be recorded.
      SELECT role, can_approve_delegated INTO v_signer_role, v_signer_deleg
      FROM public.users
      WHERE id = NEW.signed_by_user_id AND firm_id = NEW.firm_id AND status = 'ACTIVE';
      IF NOT (v_signer_role = 'PARTNER' OR (v_signer_role = 'MANAGER' AND v_signer_deleg)) THEN
        RAISE EXCEPTION 'RBAC_SECURITY_VIOLATION: A filing job needs an approving PARTNER or delegated MANAGER recorded as signer.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      SELECT u.role, u.can_approve_delegated INTO v_role, v_can_approve
      FROM public.users u
      WHERE u.id = v_ctx.user_id AND u.firm_id = NEW.firm_id AND u.status = 'ACTIVE';

      IF v_role IS NULL OR v_role NOT IN ('PARTNER', 'MANAGER') THEN
        RAISE EXCEPTION 'RBAC_SECURITY_VIOLATION: Role % cannot file a return. Requires PARTNER or delegated MANAGER approval.', COALESCE(v_role::text, 'none')
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_role = 'MANAGER' AND NOT COALESCE(v_can_approve, false) THEN
        RAISE EXCEPTION 'RBAC_SECURITY_VIOLATION: Manager does not hold delegated filing approval.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.signed_by_user_id IS DISTINCT FROM v_ctx.user_id THEN
        RAISE EXCEPTION 'RBAC_SECURITY_VIOLATION: The signer recorded on a filing must be the approving user.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    -- Segregation of duties: the checker cannot be the maker.
    SELECT enforce_segregation_of_duties INTO v_enforce_sod FROM public.firms WHERE id = NEW.firm_id;
    IF COALESCE(v_enforce_sod, true) AND NEW.signed_by_user_id IS NOT DISTINCT FROM NEW.created_by THEN
      RAISE EXCEPTION 'SEGREGATION_OF_DUTIES_VIOLATION: Preparer (%) cannot approve or sign their own return.', NEW.created_by
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_maker_checker_gst_filing
  BEFORE INSERT OR UPDATE ON public.gst_filings
  FOR EACH ROW EXECUTE FUNCTION app.enforce_maker_checker_filing_lock();

CREATE TRIGGER trg_maker_checker_tds_filing
  BEFORE INSERT OR UPDATE ON public.tds_returns
  FOR EACH ROW EXECUTE FUNCTION app.enforce_maker_checker_filing_lock();

-- Payment status mutation lock on subscription invoices
CREATE FUNCTION app.protect_subscription_payment_status() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status AND app.current_actor_kind() IS DISTINCT FROM 'SYSTEM_JOB' THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Subscription invoice payment_status can only be updated by automated payment webhooks / system jobs.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_payment_status
  BEFORE UPDATE OF payment_status ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION app.protect_subscription_payment_status();

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO synextax_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO synextax_app;

-- The blanket grant above must not reopen global reference tables: revoke again, last.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.compliance_feature_flags,
  public.portal_health_status,
  public.dlt_sms_templates,
  public.tds_remittance_tax_codes
FROM synextax_app, synextax_auth;

RESET ROLE;
