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
-- Owned by synextax_rls_helper with pinned search_path.
-- Fails closed if unsigned, expired, or tampered.
-- ---------------------------------------------------------------------
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
SET search_path = pg_catalog, public, app, extensions AS $$
DECLARE
  v_secret    bytea;
  v_payload   text;
  v_expected  bytea;
BEGIN
  -- 1. Check expiration
  IF p_exp <= extract(epoch from clock_timestamp())::bigint THEN
    PERFORM set_config('app.context_verified', 'false', true);
    RETURN false;
  END IF;

  -- 2. Retrieve active key
  SELECT secret INTO v_secret
  FROM app.context_keys
  WHERE kid = p_kid AND active = true;

  IF v_secret IS NULL THEN
    PERFORM set_config('app.context_verified', 'false', true);
    RETURN false;
  END IF;

  -- 3. Verify HMAC signature
  v_payload := p_firm_id::text || ':' || COALESCE(p_user_id::text, '') || ':' || p_actor_kind || ':' || p_exp::text;
  v_expected := extensions.hmac(v_payload::bytea, v_secret, 'sha256');

  IF extensions.digest(v_expected, 'sha256') <> extensions.digest(decode(p_sig, 'hex'), 'sha256') THEN
    PERFORM set_config('app.context_verified', 'false', true);
    RETURN false;
  END IF;

  -- 4. Set transaction-local verified context
  PERFORM set_config('app.context_verified', 'true', true);
  PERFORM set_config('app.current_firm_id', p_firm_id::text, true);
  PERFORM set_config('app.current_user_id', COALESCE(p_user_id::text, ''), true);
  PERFORM set_config('app.actor_kind', p_actor_kind, true);
  PERFORM set_config('app.request_ip', COALESCE(p_ip::text, ''), true);
  PERFORM set_config('app.request_id', COALESCE(p_request_id, ''), true);
  PERFORM set_config('app.user_agent', COALESCE(left(p_user_agent, 512), ''), true);

  RETURN true;
END;
$$;

-- Fails closed: Only returns firm_id if context was HMAC-verified
CREATE FUNCTION app.current_firm_id() RETURNS uuid
LANGUAGE plpgsql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF current_setting('app.context_verified', true) = 'true' THEN
    RETURN NULLIF(current_setting('app.current_firm_id', true), '')::uuid;
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE plpgsql STABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF current_setting('app.context_verified', true) = 'true' THEN
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION app.current_user_role() RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER PARALLEL SAFE
SET search_path = pg_catalog, public, app AS $$
  SELECT role FROM public.users
  WHERE id = app.current_user_id() AND firm_id = app.current_firm_id() AND status = 'ACTIVE';
$$;

CREATE FUNCTION app.is_entity_visible(p_entity_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER PARALLEL SAFE
SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_role public.user_role;
  v_user_id uuid := app.current_user_id();
  v_firm_id uuid := app.current_firm_id();
  v_visible boolean;
BEGIN
  IF v_firm_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT role INTO v_role
  FROM public.users
  WHERE id = v_user_id AND firm_id = v_firm_id AND status = 'ACTIVE';

  IF v_role = 'PARTNER' THEN
    RETURN true;
  END IF;

  IF v_role IN ('MANAGER', 'STAFF', 'CLIENT') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_client_assignments uca
      JOIN public.entities e ON e.firm_id = v_firm_id AND e.id = p_entity_id
      WHERE uca.firm_id = v_firm_id
        AND uca.user_id = v_user_id
        AND uca.revoked_at IS NULL
        AND (uca.entity_id = p_entity_id OR uca.client_group_id = e.client_group_id)
    ) INTO v_visible;
    RETURN COALESCE(v_visible, false);
  END IF;

  RETURN false;
END;
$$;

ALTER FUNCTION app.set_request_context(uuid,uuid,text,inet,text,text,bigint,varchar,text) OWNER TO synextax_rls_helper;
ALTER FUNCTION app.current_firm_id() OWNER TO synextax_rls_helper;
ALTER FUNCTION app.current_user_id() OWNER TO synextax_rls_helper;
ALTER FUNCTION app.current_user_role() OWNER TO synextax_rls_helper;
ALTER FUNCTION app.is_entity_visible(uuid) OWNER TO synextax_rls_helper;

SET ROLE synextax_rls_helper;
GRANT EXECUTE ON FUNCTION
  app.set_request_context(uuid,uuid,text,inet,text,text,bigint,varchar,text),
  app.current_firm_id(), app.current_user_id(), app.current_user_role(), app.is_entity_visible(uuid)
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
  FOR SELECT TO synextax_app USING (id = app.current_firm_id());
CREATE POLICY p_firm_write ON public.firms
  FOR ALL TO synextax_app
  USING (id = app.current_firm_id() AND app.current_user_role() = 'PARTNER')
  WITH CHECK (id = app.current_firm_id() AND app.current_user_role() = 'PARTNER');

-- Users policy: Read for members, write strictly PARTNER
CREATE POLICY p_users_select ON public.users
  FOR SELECT TO synextax_app USING (firm_id = app.current_firm_id());
CREATE POLICY p_users_write ON public.users
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.current_user_role() = 'PARTNER')
  WITH CHECK (firm_id = app.current_firm_id() AND app.current_user_role() = 'PARTNER');

-- Client assignments: Write strictly PARTNER
CREATE POLICY p_uca_select ON public.user_client_assignments
  FOR SELECT TO synextax_app USING (firm_id = app.current_firm_id());
CREATE POLICY p_uca_write ON public.user_client_assignments
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.current_user_role() = 'PARTNER')
  WITH CHECK (firm_id = app.current_firm_id() AND app.current_user_role() = 'PARTNER');

-- Client groups
CREATE POLICY p_client_groups_tenant ON public.client_groups
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id())
  WITH CHECK (firm_id = app.current_firm_id());

-- Entity & Sub-entity Tables (Filtered by is_entity_visible)
CREATE POLICY p_entities_tenant ON public.entities
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(id));

CREATE POLICY p_entity_contacts_tenant ON public.entity_contacts
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_entity_bank_accounts_tenant ON public.entity_bank_accounts
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_gst_registrations_tenant ON public.gst_registrations
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_tan_registrations_tenant ON public.tan_registrations
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_dsc_inventory_tenant ON public.dsc_inventory
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_dsc_portal_reg_tenant ON public.dsc_portal_registrations
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_dpdp_consent_tenant ON public.dpdp_consent_records
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_statutory_holds_tenant ON public.statutory_legal_holds
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

-- GST Transaction Tables
CREATE POLICY p_gst_sales_tenant ON public.gst_invoices_sales
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_gst_purchase_tenant ON public.gst_invoices_purchase
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_gst_2b_tenant ON public.gst_2b_records
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_ims_queue_tenant ON public.ims_action_queue
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_gst_filings_tenant ON public.gst_filings
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

-- TDS Transaction Tables
CREATE POLICY p_tds_challans_tenant ON public.tds_challans
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_tds_alloc_tenant ON public.tds_challan_section_allocations
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_tds_deductees_tenant ON public.tds_deductees
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_tds_returns_tenant ON public.tds_returns
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_tds_fvu_jobs_tenant ON public.tds_fvu_jobs
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

-- Subscriptions & Billing
CREATE POLICY p_firm_sub_tenant ON public.firm_subscriptions
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id())
  WITH CHECK (firm_id = app.current_firm_id());

CREATE POLICY p_sub_invoices_tenant ON public.subscription_invoices
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id())
  WITH CHECK (firm_id = app.current_firm_id());

-- Audit Tables Policies: Read-only scoped to firm
CREATE POLICY p_audit_logs_tenant ON audit.immutable_audit_logs
  FOR SELECT TO synextax_app USING (firm_id = app.current_firm_id());

CREATE POLICY p_signing_logs_tenant ON audit.signing_audit_logs
  FOR SELECT TO synextax_app USING (firm_id = app.current_firm_id());

CREATE POLICY p_pii_logs_tenant ON audit.pii_access_logs
  FOR SELECT TO synextax_app USING (firm_id = app.current_firm_id());

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
  v_role public.user_role;
  v_user_id uuid := app.current_user_id();
  v_can_approve boolean;
  v_enforce_sod boolean;
BEGIN
  v_role := app.current_user_role();

  IF NEW.workflow_status IN ('PARTNER_SIGNED', 'FILED') THEN
    IF v_role NOT IN ('PARTNER', 'MANAGER') THEN
      RAISE EXCEPTION 'RBAC_SECURITY_VIOLATION: User role % cannot execute final signing or filing. Requires PARTNER or delegated MANAGER approval.', v_role
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_role = 'MANAGER' THEN
      SELECT can_approve_delegated INTO v_can_approve
      FROM public.users
      WHERE id = v_user_id AND firm_id = app.current_firm_id() AND status = 'ACTIVE';

      IF NOT COALESCE(v_can_approve, false) THEN
        RAISE EXCEPTION 'RBAC_SECURITY_VIOLATION: Manager does not hold delegated filing approval authorization.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    -- Segregation of Duties: checker cannot be the maker who created the filing draft
    SELECT enforce_segregation_of_duties INTO v_enforce_sod
    FROM public.firms
    WHERE id = app.current_firm_id();

    IF COALESCE(v_enforce_sod, true) AND NEW.signed_by_user_id IS NOT NULL AND NEW.signed_by_user_id = NEW.created_by THEN
      RAISE EXCEPTION 'SEGREGATION_OF_DUTIES_VIOLATION: Preparer (%) cannot approve or sign their own return filing.', NEW.created_by
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_maker_checker_gst_filing
  BEFORE INSERT OR UPDATE OF workflow_status ON public.gst_filings
  FOR EACH ROW EXECUTE FUNCTION app.enforce_maker_checker_filing_lock();

CREATE TRIGGER trg_maker_checker_tds_filing
  BEFORE INSERT OR UPDATE OF workflow_status ON public.tds_returns
  FOR EACH ROW EXECUTE FUNCTION app.enforce_maker_checker_filing_lock();

-- Payment status mutation lock on subscription invoices
CREATE FUNCTION app.protect_subscription_payment_status() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF NEW.payment_status <> OLD.payment_status AND app.ctx_actor_kind() <> 'SYSTEM_JOB' THEN
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

RESET ROLE;
