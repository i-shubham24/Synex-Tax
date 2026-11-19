-- =====================================================================
-- SynexTax | Migration 0010 | Financial Engine Invariants & Statutory Ledgers
-- Target   : PostgreSQL 17 (AWS RDS Multi-AZ, ap-south-1)
-- Invariants:
--   1. Optimistic Locking (version column)
--   2. Immutable Filing Snapshots (PORTAL_SAVED, FILED, CLOSED locking triggers)
--   3. Idempotency Key Store
--   4. Advisory 643 Ledgers (Electronic Credit Reclaim & RCM ITC Liability)
--   5. Append-only amendment lineage (parent_record_id, revision_no)
-- =====================================================================
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 1. Idempotency Keys Table
-- ---------------------------------------------------------------------
CREATE TABLE public.idempotency_keys (
  key                 varchar(128) NOT NULL,
  firm_id             uuid NOT NULL REFERENCES public.firms(id),
  endpoint            varchar(128) NOT NULL,
  request_hash        char(64) NOT NULL,
  response_status     integer,
  response_headers    jsonb,
  response_body       jsonb,
  locked_until        timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (firm_id, key)
);
CREATE INDEX ix_idempotency_locked ON public.idempotency_keys (firm_id, locked_until);

-- ---------------------------------------------------------------------
-- 2. GSTN Advisory 643 Ledgers
-- ---------------------------------------------------------------------
CREATE TABLE public.electronic_credit_reclaim_ledger (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                     uuid NOT NULL REFERENCES public.firms(id),
  entity_id                   uuid NOT NULL,
  gst_registration_id         uuid NOT NULL,
  return_period               varchar(7) NOT NULL CHECK (return_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  opening_balance_igst        numeric(18,2) NOT NULL DEFAULT 0.00,
  opening_balance_cgst        numeric(18,2) NOT NULL DEFAULT 0.00,
  opening_balance_sgst        numeric(18,2) NOT NULL DEFAULT 0.00,
  opening_balance_cess        numeric(18,2) NOT NULL DEFAULT 0.00,
  reversed_table_4b2_igst     numeric(18,2) NOT NULL DEFAULT 0.00,
  reversed_table_4b2_cgst     numeric(18,2) NOT NULL DEFAULT 0.00,
  reversed_table_4b2_sgst     numeric(18,2) NOT NULL DEFAULT 0.00,
  reversed_table_4b2_cess     numeric(18,2) NOT NULL DEFAULT 0.00,
  reclaimed_table_4d1_igst    numeric(18,2) NOT NULL DEFAULT 0.00,
  reclaimed_table_4d1_cgst    numeric(18,2) NOT NULL DEFAULT 0.00,
  reclaimed_table_4d1_sgst    numeric(18,2) NOT NULL DEFAULT 0.00,
  reclaimed_table_4d1_cess    numeric(18,2) NOT NULL DEFAULT 0.00,
  closing_balance_igst        numeric(18,2) GENERATED ALWAYS AS (opening_balance_igst + reversed_table_4b2_igst - reclaimed_table_4d1_igst) STORED,
  closing_balance_cgst        numeric(18,2) GENERATED ALWAYS AS (opening_balance_cgst + reversed_table_4b2_cgst - reclaimed_table_4d1_cgst) STORED,
  closing_balance_sgst        numeric(18,2) GENERATED ALWAYS AS (opening_balance_sgst + reversed_table_4b2_sgst - reclaimed_table_4d1_sgst) STORED,
  closing_balance_cess        numeric(18,2) GENERATED ALWAYS AS (opening_balance_cess + reversed_table_4b2_cess - reclaimed_table_4d1_cess) STORED,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, gst_registration_id, return_period),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, gst_registration_id) REFERENCES public.gst_registrations (firm_id, id),
  CHECK (closing_balance_igst >= 0.00 AND closing_balance_cgst >= 0.00 AND closing_balance_sgst >= 0.00 AND closing_balance_cess >= 0.00)
);

CREATE TABLE public.rcm_liability_itc_ledger (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                     uuid NOT NULL REFERENCES public.firms(id),
  entity_id                   uuid NOT NULL,
  gst_registration_id         uuid NOT NULL,
  return_period               varchar(7) NOT NULL CHECK (return_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  opening_rcm_paid_igst       numeric(18,2) NOT NULL DEFAULT 0.00,
  opening_rcm_paid_cgst       numeric(18,2) NOT NULL DEFAULT 0.00,
  opening_rcm_paid_sgst       numeric(18,2) NOT NULL DEFAULT 0.00,
  opening_rcm_paid_cess       numeric(18,2) NOT NULL DEFAULT 0.00,
  rcm_liability_table_31d_igst numeric(18,2) NOT NULL DEFAULT 0.00,
  rcm_liability_table_31d_cgst numeric(18,2) NOT NULL DEFAULT 0.00,
  rcm_liability_table_31d_sgst numeric(18,2) NOT NULL DEFAULT 0.00,
  rcm_liability_table_31d_cess numeric(18,2) NOT NULL DEFAULT 0.00,
  rcm_itc_claimed_table_4a2_igst numeric(18,2) NOT NULL DEFAULT 0.00,
  rcm_itc_claimed_table_4a2_cgst numeric(18,2) NOT NULL DEFAULT 0.00,
  rcm_itc_claimed_table_4a2_sgst numeric(18,2) NOT NULL DEFAULT 0.00,
  rcm_itc_claimed_table_4a2_cess numeric(18,2) NOT NULL DEFAULT 0.00,
  closing_rcm_eligible_igst   numeric(18,2) GENERATED ALWAYS AS (opening_rcm_paid_igst + rcm_liability_table_31d_igst - rcm_itc_claimed_table_4a2_igst) STORED,
  closing_rcm_eligible_cgst   numeric(18,2) GENERATED ALWAYS AS (opening_rcm_paid_cgst + rcm_liability_table_31d_cgst - rcm_itc_claimed_table_4a2_cgst) STORED,
  closing_rcm_eligible_sgst   numeric(18,2) GENERATED ALWAYS AS (opening_rcm_paid_sgst + rcm_liability_table_31d_sgst - rcm_itc_claimed_table_4a2_sgst) STORED,
  closing_rcm_eligible_cess   numeric(18,2) GENERATED ALWAYS AS (opening_rcm_paid_cess + rcm_liability_table_31d_cess - rcm_itc_claimed_table_4a2_cess) STORED,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, gst_registration_id, return_period),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, gst_registration_id) REFERENCES public.gst_registrations (firm_id, id),
  CHECK (closing_rcm_eligible_igst >= 0.00 AND closing_rcm_eligible_cgst >= 0.00 AND closing_rcm_eligible_sgst >= 0.00 AND closing_rcm_eligible_cess >= 0.00)
);

-- ---------------------------------------------------------------------
-- 3. Hardened Immutability Triggers (No LIMIT 1, Exact Period & State Check)
-- ---------------------------------------------------------------------

-- Sales Register Immutability Guard
CREATE FUNCTION app.prevent_sales_mutation_on_locked_period() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_firm_id   uuid;
  v_reg_id    uuid;
  v_period    varchar(7);
  v_is_amend  boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_firm_id  := OLD.firm_id;
    v_reg_id   := OLD.gst_registration_id;
    v_period   := OLD.return_period;
    v_is_amend := OLD.is_amendment;
  ELSE
    v_firm_id  := NEW.firm_id;
    v_reg_id   := NEW.gst_registration_id;
    v_period   := NEW.return_period;
    v_is_amend := NEW.is_amendment;
  END IF;

  -- Block if GSTR-3B is already locked or if GSTR-1/IFF is locked and not an amendment insert
  IF EXISTS (
    SELECT 1 FROM public.gst_filings f
    WHERE f.firm_id = v_firm_id
      AND f.gst_registration_id = v_reg_id
      AND f.return_period = v_period
      AND (
        (f.return_type = 'GSTR3B' AND f.workflow_status IN ('PORTAL_SAVED','FILED','CLOSED'))
        OR
        (f.return_type IN ('GSTR1','IFF') AND f.workflow_status IN ('PORTAL_SAVED','FILED','CLOSED') AND NOT COALESCE(v_is_amend, false))
      )
  ) THEN
    RAISE EXCEPTION 'PERIOD_IMMUTABLE_LOCKED: Sales records for period % cannot be altered because return is locked. GSTR-1A amendments permitted only prior to GSTR-3B locking.', v_period
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lock_sales_mutation
  BEFORE UPDATE OR DELETE ON public.gst_invoices_sales
  FOR EACH ROW EXECUTE FUNCTION app.prevent_sales_mutation_on_locked_period();

-- Purchase Register Immutability Guard (locked strictly when GSTR-3B is locked)
CREATE FUNCTION app.prevent_purchase_mutation_on_locked_period() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_firm_id uuid;
  v_reg_id  uuid;
  v_period  varchar(7);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_firm_id := OLD.firm_id;
    v_reg_id  := OLD.gst_registration_id;
    v_period  := OLD.return_period;
  ELSE
    v_firm_id := NEW.firm_id;
    v_reg_id  := NEW.gst_registration_id;
    v_period  := NEW.return_period;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.gst_filings f
    WHERE f.firm_id = v_firm_id
      AND f.gst_registration_id = v_reg_id
      AND f.return_period = v_period
      AND f.return_type = 'GSTR3B'
      AND f.workflow_status IN ('PORTAL_SAVED','FILED','CLOSED')
  ) THEN
    RAISE EXCEPTION 'PERIOD_IMMUTABLE_LOCKED: Purchase records for period % cannot be altered because GSTR-3B has been saved or filed.', v_period
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lock_purchase_mutation
  BEFORE UPDATE OR DELETE ON public.gst_invoices_purchase
  FOR EACH ROW EXECUTE FUNCTION app.prevent_purchase_mutation_on_locked_period();

-- TDS Deductees Immutability Guard (locked when matching tds_return is in PORTAL_SAVED, FILED, CLOSED)
CREATE FUNCTION app.prevent_tds_deductee_mutation_on_locked_quarter() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_firm_id   uuid;
  v_tan_id    uuid;
  v_tax_year  smallint;
  v_quarter   varchar(2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_firm_id := OLD.firm_id;
    v_tan_id  := OLD.tan_registration_id;
    SELECT c.tax_year, c.quarter INTO v_tax_year, v_quarter
    FROM public.tds_challans c WHERE c.id = OLD.challan_id AND c.firm_id = OLD.firm_id;
  ELSE
    v_firm_id := NEW.firm_id;
    v_tan_id  := NEW.tan_registration_id;
    SELECT c.tax_year, c.quarter INTO v_tax_year, v_quarter
    FROM public.tds_challans c WHERE c.id = NEW.challan_id AND c.firm_id = NEW.firm_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tds_returns r
    WHERE r.firm_id = v_firm_id
      AND r.tan_registration_id = v_tan_id
      AND r.tax_year = v_tax_year
      AND r.quarter = v_quarter
      AND r.workflow_status IN ('PORTAL_SAVED','FILED','CLOSED')
  ) THEN
    RAISE EXCEPTION 'TDS_QUARTER_IMMUTABLE_LOCKED: Deductee records for % % cannot be altered because quarterly statement is locked or filed. File a formal correction batch instead.', v_tax_year, v_quarter
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lock_tds_deductees_mutation
  BEFORE UPDATE OR DELETE ON public.tds_deductees
  FOR EACH ROW EXECUTE FUNCTION app.prevent_tds_deductee_mutation_on_locked_quarter();

-- TDS Challans Immutability Guard
CREATE FUNCTION app.prevent_tds_challan_mutation_on_locked_quarter() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_firm_id   uuid;
  v_tan_id    uuid;
  v_tax_year  smallint;
  v_quarter   varchar(2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_firm_id  := OLD.firm_id;
    v_tan_id   := OLD.tan_registration_id;
    v_tax_year := OLD.tax_year;
    v_quarter  := OLD.quarter;
  ELSE
    v_firm_id  := NEW.firm_id;
    v_tan_id   := NEW.tan_registration_id;
    v_tax_year := NEW.tax_year;
    v_quarter  := NEW.quarter;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tds_returns r
    WHERE r.firm_id = v_firm_id
      AND r.tan_registration_id = v_tan_id
      AND r.tax_year = v_tax_year
      AND r.quarter = v_quarter
      AND r.workflow_status IN ('PORTAL_SAVED','FILED','CLOSED')
  ) THEN
    RAISE EXCEPTION 'TDS_QUARTER_IMMUTABLE_LOCKED: Challan for % % cannot be altered because quarterly statement is locked or filed.', v_tax_year, v_quarter
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lock_tds_challans_mutation
  BEFORE UPDATE OR DELETE ON public.tds_challans
  FOR EACH ROW EXECUTE FUNCTION app.prevent_tds_challan_mutation_on_locked_quarter();

-- ---------------------------------------------------------------------
-- 4. Enable RLS on New Tables
-- ---------------------------------------------------------------------
ALTER TABLE public.idempotency_keys                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electronic_credit_reclaim_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_liability_itc_ledger         ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.idempotency_keys                 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.electronic_credit_reclaim_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_liability_itc_ledger         FORCE ROW LEVEL SECURITY;

CREATE POLICY p_idempotency_tenant ON public.idempotency_keys
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id())
  WITH CHECK (firm_id = app.current_firm_id());

CREATE POLICY p_reclaim_ledger_tenant ON public.electronic_credit_reclaim_ledger
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

CREATE POLICY p_rcm_ledger_tenant ON public.rcm_liability_itc_ledger
  FOR ALL TO synextax_app
  USING (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = app.current_firm_id() AND app.is_entity_visible(entity_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.idempotency_keys,
  public.electronic_credit_reclaim_ledger,
  public.rcm_liability_itc_ledger
TO synextax_app;

RESET ROLE;
