-- =====================================================================
-- SynTax | Migration 0042 | IMS Hardening, IMPG Segregation,
--                             Rule 37A Reversal Register & PMT-06 Ledgers
-- Target   : PostgreSQL 17
-- =====================================================================
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 1. Preserve verbatim invoice numbers & persist separate match keys
-- ---------------------------------------------------------------------
ALTER TABLE public.gst_invoices_purchase
  ADD COLUMN IF NOT EXISTS normalized_invoice_key varchar(64),
  ADD COLUMN IF NOT EXISTS credit_category varchar(16) NOT NULL DEFAULT 'B2B'
    CHECK (credit_category IN ('B2B', 'IMPG', 'ISD')),
  ADD COLUMN IF NOT EXISTS boe_number varchar(32),
  ADD COLUMN IF NOT EXISTS boe_port_code varchar(16);

CREATE INDEX IF NOT EXISTS ix_purchase_norm_key
  ON public.gst_invoices_purchase (firm_id, gst_registration_id, return_period, normalized_invoice_key);

-- ---------------------------------------------------------------------
-- 2. GSTR-2B / IMS hardening: IMPG support, reset detection & downward amendments
-- ---------------------------------------------------------------------
DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.gst_2b_records'::regclass
       AND contype = 'c'
       AND (
         pg_get_constraintdef(oid) LIKE '%doc_type%'
         OR pg_get_constraintdef(oid) LIKE '%supplier_gstin%'
       )
  LOOP
    EXECUTE format('ALTER TABLE public.gst_2b_records DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.gst_2b_records
  ADD CONSTRAINT gst_2b_records_doc_type_check
    CHECK (doc_type IN ('INV', 'CRN', 'DBN', 'ISD', 'IMPG')),
  ADD CONSTRAINT gst_2b_records_supplier_gstin_check
    CHECK (doc_type = 'IMPG' OR supplier_gstin ~ '^[0-9]{2}[0-9A-Z]{13}$'),
  ADD COLUMN IF NOT EXISTS normalized_invoice_key varchar(64),
  ADD COLUMN IF NOT EXISTS credit_category varchar(16) NOT NULL DEFAULT 'B2B'
    CHECK (credit_category IN ('B2B', 'IMPG', 'ISD')),
  ADD COLUMN IF NOT EXISTS boe_port_code varchar(16),
  ADD COLUMN IF NOT EXISTS ims_previous_status public.ims_action NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS ims_reset_detected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_downward_amendment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_doc_num varchar(32),
  ADD COLUMN IF NOT EXISTS original_doc_date date,
  ADD COLUMN IF NOT EXISTS original_filing_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_tax_amount numeric(18,2);

CREATE INDEX IF NOT EXISTS ix_2b_norm_key
  ON public.gst_2b_records (firm_id, gst_registration_id, return_period, normalized_invoice_key);

-- ---------------------------------------------------------------------
-- 3. Rule 37A / Table 4(B)(2) Reversal & Table 4(D)(1) Reclaim Audit Register
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gst_itc_reversal_register (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id               uuid NOT NULL REFERENCES public.firms(id),
  entity_id             uuid NOT NULL,
  gst_registration_id   uuid NOT NULL,
  entry_type            varchar(16) NOT NULL CHECK (entry_type IN ('REVERSAL_4B2', 'RECLAIM_4D1')),
  rule_code             varchar(32) NOT NULL
                        CHECK (rule_code IN ('RULE_37', 'RULE_37A', 'RULE_42', 'RULE_43', 'IMS_PARTIAL', 'SEC_17_5', 'OTHER')),
  return_period         varchar(7) NOT NULL CHECK (return_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  entry_date            date NOT NULL DEFAULT current_date,
  supplier_gstin        varchar(15),
  doc_num               varchar(32),
  doc_date              date,
  igst_amount           numeric(18,2) NOT NULL DEFAULT 0.00 CHECK (igst_amount >= 0.00),
  cgst_amount           numeric(18,2) NOT NULL DEFAULT 0.00 CHECK (cgst_amount >= 0.00),
  sgst_amount           numeric(18,2) NOT NULL DEFAULT 0.00 CHECK (sgst_amount >= 0.00),
  cess_amount           numeric(18,2) NOT NULL DEFAULT 0.00 CHECK (cess_amount >= 0.00),
  parent_reversal_id    uuid REFERENCES public.gst_itc_reversal_register(id),
  rationale             text NOT NULL,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, gst_registration_id) REFERENCES public.gst_registrations (firm_id, id),
  CHECK (entry_type <> 'RECLAIM_4D1' OR parent_reversal_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_itc_rev_reg_period
  ON public.gst_itc_reversal_register (firm_id, gst_registration_id, return_period);
CREATE INDEX IF NOT EXISTS ix_itc_rev_parent
  ON public.gst_itc_reversal_register (firm_id, parent_reversal_id);

CREATE OR REPLACE FUNCTION app.validate_itc_reversal_register() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, audit AS $$
DECLARE
  v_parent public.gst_itc_reversal_register%ROWTYPE;
  v_reclaimed_igst numeric(18,2);
  v_reclaimed_cgst numeric(18,2);
  v_reclaimed_sgst numeric(18,2);
  v_reclaimed_cess numeric(18,2);
BEGIN
  IF NEW.entry_type = 'RECLAIM_4D1' THEN
    SELECT * INTO v_parent
    FROM public.gst_itc_reversal_register
    WHERE id = NEW.parent_reversal_id AND firm_id = NEW.firm_id;

    IF v_parent.id IS NULL OR v_parent.entry_type <> 'REVERSAL_4B2' OR v_parent.gst_registration_id <> NEW.gst_registration_id THEN
      RAISE EXCEPTION 'STATUTORY_RECLAIM_ERROR: Table 4(D)(1) reclaim must link to an exact Table 4(B)(2) reversal entry for the same GSTIN.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT
      COALESCE(SUM(igst_amount), 0),
      COALESCE(SUM(cgst_amount), 0),
      COALESCE(SUM(sgst_amount), 0),
      COALESCE(SUM(cess_amount), 0)
    INTO v_reclaimed_igst, v_reclaimed_cgst, v_reclaimed_sgst, v_reclaimed_cess
    FROM public.gst_itc_reversal_register
    WHERE parent_reversal_id = NEW.parent_reversal_id
      AND firm_id = NEW.firm_id
      AND entry_type = 'RECLAIM_4D1'
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF (v_reclaimed_igst + NEW.igst_amount) > v_parent.igst_amount
       OR (v_reclaimed_cgst + NEW.cgst_amount) > v_parent.cgst_amount
       OR (v_reclaimed_sgst + NEW.sgst_amount) > v_parent.sgst_amount
       OR (v_reclaimed_cess + NEW.cess_amount) > v_parent.cess_amount THEN
      RAISE EXCEPTION 'STATUTORY_RECLAIM_EXCEEDS_REVERSAL: Cumulative Table 4(D)(1) reclaim cannot exceed original Table 4(B)(2) reversal balance.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_itc_reversal
  BEFORE INSERT OR UPDATE ON public.gst_itc_reversal_register
  FOR EACH ROW EXECUTE FUNCTION app.validate_itc_reversal_register();

-- ---------------------------------------------------------------------
-- 4. GST PMT-06 Challan History Table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gst_pmt06_challans (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id               uuid NOT NULL REFERENCES public.firms(id),
  entity_id             uuid NOT NULL,
  gst_registration_id   uuid NOT NULL,
  return_period         varchar(7) NOT NULL CHECK (return_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  cpin                  varchar(20) NOT NULL,
  challan_date          date NOT NULL,
  bank_name             varchar(64),
  payment_mode          varchar(24) NOT NULL DEFAULT 'NET_BANKING',
  reason                varchar(32) NOT NULL DEFAULT 'MONTHLY_PAYMENT'
                        CHECK (reason IN ('QRMP_35_PCT', 'QRMP_SELF_ASSESSMENT', 'MONTHLY_PAYMENT', 'VOLUNTARY_DRC03')),
  igst_cash             numeric(18,2) NOT NULL DEFAULT 0.00 CHECK (igst_cash >= 0.00),
  cgst_cash             numeric(18,2) NOT NULL DEFAULT 0.00 CHECK (cgst_cash >= 0.00),
  sgst_cash             numeric(18,2) NOT NULL DEFAULT 0.00 CHECK (sgst_cash >= 0.00),
  cess_cash             numeric(18,2) NOT NULL DEFAULT 0.00 CHECK (cess_cash >= 0.00),
  interest_cash         numeric(18,2) NOT NULL DEFAULT 0.00 CHECK (interest_cash >= 0.00),
  late_fee_cash         numeric(18,2) NOT NULL DEFAULT 0.00 CHECK (late_fee_cash >= 0.00),
  status                varchar(16) NOT NULL DEFAULT 'PAID' CHECK (status IN ('GENERATED', 'PAID', 'FAILED')),
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (firm_id, id),
  UNIQUE (firm_id, gst_registration_id, cpin),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, gst_registration_id) REFERENCES public.gst_registrations (firm_id, id)
);

CREATE INDEX IF NOT EXISTS ix_gst_pmt06_reg_period
  ON public.gst_pmt06_challans (firm_id, gst_registration_id, return_period);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gst_itc_reversal_register', 'gst_pmt06_challans']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%s AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event()', t, t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY p_%s_tenant ON public.%I FOR ALL TO synextax_app
         USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
         WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))', t, t);
    EXECUTE format(
      'CREATE POLICY p_no_client_login ON public.%I AS RESTRICTIVE FOR ALL TO synextax_app
         USING ((SELECT app.current_user_role()) IS DISTINCT FROM ''CLIENT'')
         WITH CHECK ((SELECT app.current_user_role()) IS DISTINCT FROM ''CLIENT'')', t);
  END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.gst_itc_reversal_register, public.gst_pmt06_challans TO synextax_app;

RESET ROLE;
