-- =====================================================================
-- SynexTax | Migration 0006 | GST Ledgers, IMS, Filings & Reconciliation
-- Target   : PostgreSQL 17 (AWS RDS Multi-AZ, ap-south-1)
-- =====================================================================
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 1. Sales Register / Outward Supplies (GSTR-1, GSTR-1A, IFF, e-Invoice)
-- ---------------------------------------------------------------------
CREATE TABLE public.gst_invoices_sales (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                 uuid NOT NULL REFERENCES public.firms(id),
  entity_id               uuid NOT NULL,
  gst_registration_id     uuid NOT NULL,
  invoice_num             varchar(32) NOT NULL,
  invoice_date            date NOT NULL,
  doc_type                varchar(8) NOT NULL CHECK (doc_type IN ('INV','CRN','DBN')),
  supply_type             varchar(16) NOT NULL DEFAULT 'B2B'
                          CHECK (supply_type IN ('B2B','B2CL','B2CS','EXPWP','EXPWOP','RCMDOM','RCMIMP','SEZWP','SEZWOP')),
  customer_gstin          varchar(15) CHECK (customer_gstin ~ '^[0-9]{2}[0-9A-Z]{13}$'),
  customer_legal_name     varchar(200),
  pos_state_code          char(2) NOT NULL,
  reverse_charge          boolean NOT NULL DEFAULT false,
  table_section           varchar(8) NOT NULL DEFAULT '4A'
                          CHECK (table_section IN ('4A','4B','6B','6C','7','8','9B','11A','11B','12')),
  taxable_value           numeric(18,2) NOT NULL DEFAULT 0.00,
  igst_rate               numeric(6,4) NOT NULL DEFAULT 0.0000,
  igst_amount             numeric(18,2) NOT NULL DEFAULT 0.00,
  cgst_rate               numeric(6,4) NOT NULL DEFAULT 0.0000,
  cgst_amount             numeric(18,2) NOT NULL DEFAULT 0.00,
  sgst_rate               numeric(6,4) NOT NULL DEFAULT 0.0000,
  sgst_amount             numeric(18,2) NOT NULL DEFAULT 0.00,
  cess_rate               numeric(6,4) NOT NULL DEFAULT 0.0000,
  cess_amount             numeric(18,2) NOT NULL DEFAULT 0.00,
  total_invoice_value     numeric(18,2) NOT NULL DEFAULT 0.00,

  -- Notification 03/2026-CT: Optional for CRN dated >= 2026-11-01; mandatory prior
  original_invoice_ref    varchar(32),
  original_invoice_date   date,

  -- Amendment tracking & revision numbers for GSTR-1A
  parent_record_id        uuid REFERENCES public.gst_invoices_sales(id),
  is_amendment            boolean NOT NULL DEFAULT false,
  amendment_period        varchar(7),
  revision_no             integer NOT NULL DEFAULT 0,

  -- Variable length statutory IDs for Jan 1, 2027 cutover (Advisories 687 & 688)
  ewb_number              varchar(32),
  cewb_number             varchar(32),
  irn                     char(64) CHECK (irn IS NULL OR irn ~ '^[0-9a-f]{64}$'),
  ack_no                  varchar(32),
  ack_date                timestamptz,
  qr_code_text            text,

  return_period           varchar(7) NOT NULL CHECK (return_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  filing_status           varchar(16) NOT NULL DEFAULT 'DRAFT'
                          CHECK (filing_status IN ('DRAFT','PENDING_APPROVAL','APPROVED','UPLOADED','FILED')),
  ims_buyer_action        public.ims_action NOT NULL DEFAULT 'NONE',
  ims_buyer_action_date   timestamptz,
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (firm_id, id),
  UNIQUE (firm_id, gst_registration_id, return_period, doc_type, invoice_num, revision_no),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, gst_registration_id) REFERENCES public.gst_registrations (firm_id, id)
);

CREATE INDEX ix_sales_reg_period ON public.gst_invoices_sales (firm_id, gst_registration_id, return_period);
CREATE INDEX ix_sales_customer ON public.gst_invoices_sales (firm_id, customer_gstin);

-- ---------------------------------------------------------------------
-- 2. Purchase Register / Inward Supplies (Reconciled against GSTR-2B)
-- ---------------------------------------------------------------------
CREATE TABLE public.gst_invoices_purchase (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                 uuid NOT NULL REFERENCES public.firms(id),
  entity_id               uuid NOT NULL,
  gst_registration_id     uuid NOT NULL,
  vendor_gstin            varchar(15) NOT NULL CHECK (vendor_gstin ~ '^[0-9]{2}[0-9A-Z]{13}$'),
  vendor_trade_name       varchar(200),
  invoice_num             varchar(32) NOT NULL,
  invoice_date            date NOT NULL,
  doc_type                varchar(8) NOT NULL CHECK (doc_type IN ('INV','CRN','DBN')),
  pos_state_code          char(2) NOT NULL,
  reverse_charge          boolean NOT NULL DEFAULT false,
  taxable_value           numeric(18,2) NOT NULL DEFAULT 0.00,
  igst_amount             numeric(18,2) NOT NULL DEFAULT 0.00,
  cgst_amount             numeric(18,2) NOT NULL DEFAULT 0.00,
  sgst_amount             numeric(18,2) NOT NULL DEFAULT 0.00,
  cess_amount             numeric(18,2) NOT NULL DEFAULT 0.00,
  total_invoice_value     numeric(18,2) NOT NULL DEFAULT 0.00,

  itc_eligibility         varchar(24) NOT NULL DEFAULT 'ELIGIBLE'
                          CHECK (itc_eligibility IN ('ELIGIBLE','INELIGIBLE_17_5','INELIGIBLE_RULE_42_43','INELIGIBLE_OTHER')),
  itc_reversal_amount     numeric(18,2) NOT NULL DEFAULT 0.00,

  -- Notification 03/2026-CT: Optional for CRN dated >= 2026-11-01
  original_invoice_ref    varchar(32),
  original_invoice_date   date,

  parent_record_id        uuid REFERENCES public.gst_invoices_purchase(id),
  is_amendment            boolean NOT NULL DEFAULT false,
  amendment_period        varchar(7),
  revision_no             integer NOT NULL DEFAULT 0,

  recon_status            varchar(24) NOT NULL DEFAULT 'UNRECONCILED'
                          CHECK (recon_status IN ('EXACT_MATCH','FUZZY_MATCH','MANUAL_MATCH','MISMATCH_VALUE','VENDOR_NOT_IN_2B','PURCHASE_NOT_IN_PR','UNRECONCILED')),
  matched_2b_id           uuid,
  matched_at              timestamptz,
  return_period           varchar(7) NOT NULL CHECK (return_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (firm_id, id),
  UNIQUE (firm_id, gst_registration_id, return_period, doc_type, vendor_gstin, invoice_num, revision_no),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, gst_registration_id) REFERENCES public.gst_registrations (firm_id, id)
);

CREATE INDEX ix_purchase_reg_period ON public.gst_invoices_purchase (firm_id, gst_registration_id, return_period);
CREATE INDEX ix_purchase_vendor ON public.gst_invoices_purchase (firm_id, vendor_gstin);

-- ---------------------------------------------------------------------
-- Enforce Notification 03/2026-CT Credit Note rules
-- ---------------------------------------------------------------------
CREATE FUNCTION app.validate_credit_note_statutory_rules() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, audit AS $$
BEGIN
  IF NEW.doc_type = 'CRN' THEN
    IF NEW.invoice_date < DATE '2026-11-01' AND (NEW.original_invoice_ref IS NULL OR btrim(NEW.original_invoice_ref) = '') THEN
      RAISE EXCEPTION 'STATUTORY_VIOLATION: Credit Notes dated prior to 1-Nov-2026 require original_invoice_ref under Section 15(3)(b) legacy rules.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sales_crn_check BEFORE INSERT OR UPDATE ON public.gst_invoices_sales
  FOR EACH ROW EXECUTE FUNCTION app.validate_credit_note_statutory_rules();

CREATE TRIGGER trg_purchase_crn_check BEFORE INSERT OR UPDATE ON public.gst_invoices_purchase
  FOR EACH ROW EXECUTE FUNCTION app.validate_credit_note_statutory_rules();

-- ---------------------------------------------------------------------
-- 3. Auto-drafted GSTR-2B Records (Ingested via GSP)
-- ---------------------------------------------------------------------
CREATE TABLE public.gst_2b_records (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                     uuid NOT NULL REFERENCES public.firms(id),
  entity_id                   uuid NOT NULL,
  gst_registration_id         uuid NOT NULL,
  return_period               varchar(7) NOT NULL CHECK (return_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  supplier_gstin              varchar(15) NOT NULL CHECK (supplier_gstin ~ '^[0-9]{2}[0-9A-Z]{13}$'),
  supplier_trade_name         varchar(200),
  doc_type                    varchar(8) NOT NULL CHECK (doc_type IN ('INV','CRN','DBN','ISD')),
  doc_num                     varchar(32) NOT NULL,
  doc_date                    date NOT NULL,
  taxable_value               numeric(18,2) NOT NULL DEFAULT 0.00,
  igst_amount                 numeric(18,2) NOT NULL DEFAULT 0.00,
  cgst_amount                 numeric(18,2) NOT NULL DEFAULT 0.00,
  sgst_amount                 numeric(18,2) NOT NULL DEFAULT 0.00,
  cess_amount                 numeric(18,2) NOT NULL DEFAULT 0.00,
  itc_available               boolean NOT NULL DEFAULT true,
  itc_ineligibility_reason    varchar(32),
  gstr1_filing_date           date,
  gstr1_filing_period         varchar(7),
  ims_action_status           public.ims_action NOT NULL DEFAULT 'NONE',
  ims_action_taken_at         timestamptz,
  ims_pending_period_count    smallint NOT NULL DEFAULT 0,
  raw_payload                 jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (firm_id, id),
  UNIQUE (firm_id, gst_registration_id, return_period, doc_type, supplier_gstin, doc_num),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, gst_registration_id) REFERENCES public.gst_registrations (firm_id, id)
);

CREATE INDEX ix_2b_records_period ON public.gst_2b_records (firm_id, gst_registration_id, return_period);
CREATE INDEX ix_2b_records_supplier ON public.gst_2b_records (firm_id, supplier_gstin);

-- ---------------------------------------------------------------------
-- 4. IMS Action Queue (Invoice Management System Actions)
-- ---------------------------------------------------------------------
CREATE TABLE public.ims_action_queue (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                     uuid NOT NULL REFERENCES public.firms(id),
  entity_id                   uuid NOT NULL,
  gst_registration_id         uuid NOT NULL,
  record_2b_id                uuid NOT NULL,
  action                      public.ims_action NOT NULL,
  previous_action             public.ims_action NOT NULL DEFAULT 'NONE',
  doc_type                    varchar(8) NOT NULL CHECK (doc_type IN ('INV','CRN','DBN')),
  is_credit_note              boolean GENERATED ALWAYS AS (doc_type = 'CRN') STORED,
  itc_reversal_amount         numeric(18,2) NOT NULL DEFAULT 0.00,
  action_period               varchar(7) NOT NULL CHECK (action_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  action_source               varchar(24) NOT NULL DEFAULT 'UI_PORTAL'
                              CHECK (action_source IN ('UI_PORTAL','AUTO_EXPIRY_14TH','OFFLINE_JSON_IMPORT')),
  sync_status                 varchar(16) NOT NULL DEFAULT 'QUEUED'
                              CHECK (sync_status IN ('QUEUED','SYNCED_GSTN','FAILED')),
  synced_at                   timestamptz,
  gstn_response_error         text,
  version                     integer NOT NULL DEFAULT 1,
  created_by                  uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, gst_registration_id) REFERENCES public.gst_registrations (firm_id, id),
  FOREIGN KEY (firm_id, record_2b_id) REFERENCES public.gst_2b_records (firm_id, id)
);

CREATE INDEX ix_ims_queue_sync ON public.ims_action_queue (firm_id, gst_registration_id, sync_status);

CREATE FUNCTION app.validate_ims_credit_note_pending_cap() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, audit AS $$
DECLARE
  v_pending_count smallint;
BEGIN
  IF NEW.is_credit_note AND NEW.action = 'P' THEN
    SELECT ims_pending_period_count INTO v_pending_count
    FROM public.gst_2b_records
    WHERE id = NEW.record_2b_id AND firm_id = NEW.firm_id;

    IF v_pending_count >= 1 THEN
      RAISE EXCEPTION 'STATUTORY_IMS_LIMIT: Credit Notes cannot remain in PENDING status for more than 1 tax period. Action must be Accept (A) or Reject (R).'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ims_cn_cap BEFORE INSERT OR UPDATE ON public.ims_action_queue
  FOR EACH ROW EXECUTE FUNCTION app.validate_ims_credit_note_pending_cap();

-- ---------------------------------------------------------------------
-- 5. GST Return Filings (GSTR-1, GSTR-1A, GSTR-3B, CMP-08, GSTR-4, GSTR-6)
-- ---------------------------------------------------------------------
CREATE TABLE public.gst_filings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                     uuid NOT NULL REFERENCES public.firms(id),
  entity_id                   uuid NOT NULL,
  gst_registration_id         uuid NOT NULL,
  return_period               varchar(7) NOT NULL CHECK (return_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  return_type                 varchar(12) NOT NULL
                              CHECK (return_type IN ('GSTR1','GSTR1A','GSTR3B','IFF','CMP08','GSTR4','GSTR6','GSTR7','GSTR9','GSTR9C')),
  workflow_status             public.filing_workflow_status NOT NULL DEFAULT 'DRAFT',
  statutory_due_date          date NOT NULL,

  -- Pure immutable calculation without non-deterministic current_date
  expiry_date_3yr             date GENERATED ALWAYS AS (statutory_due_date + INTERVAL '3 years') STORED,

  is_tables_3_1_3_2_locked    boolean NOT NULL DEFAULT true,
  gstr1a_reconciliation_status varchar(24) NOT NULL DEFAULT 'NOT_APPLICABLE'
                              CHECK (gstr1a_reconciliation_status IN ('NOT_APPLICABLE','PENDING','CONFIRMED_BEFORE_3B')),

  -- IMS Post-14th Lock: Explicit timestamp tracking prevents status-transition deadlocks
  post_14th_ims_modified      boolean NOT NULL DEFAULT false,
  last_ims_modified_at        timestamptz,
  recompute_gstr2b_required   boolean NOT NULL DEFAULT false,
  recompute_gstr2b_completed_at timestamptz,

  gross_tax_liability         numeric(18,2) NOT NULL DEFAULT 0.00,
  total_itc_claimed           numeric(18,2) NOT NULL DEFAULT 0.00,
  net_cash_paid               numeric(18,2) NOT NULL DEFAULT 0.00,
  arn                         varchar(32),
  filed_at                    timestamptz,
  signoff_method              public.signoff_method,
  signed_by_user_id           uuid,
  dsc_id                      uuid,
  submission_payload          jsonb,
  gstn_ack_payload            jsonb,
  version                     integer NOT NULL DEFAULT 1,
  created_by                  uuid,          -- maker; set from the verified context, immutable
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (firm_id, id),
  UNIQUE (firm_id, gst_registration_id, return_period, return_type),
  FOREIGN KEY (firm_id, created_by) REFERENCES public.users (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, gst_registration_id) REFERENCES public.gst_registrations (firm_id, id),
  FOREIGN KEY (firm_id, signed_by_user_id) REFERENCES public.users (firm_id, id),
  FOREIGN KEY (firm_id, dsc_id) REFERENCES public.dsc_inventory (firm_id, id)
);

CREATE INDEX ix_filings_reg_period ON public.gst_filings (firm_id, gst_registration_id, return_period, return_type);
CREATE INDEX ix_filings_status ON public.gst_filings (firm_id, workflow_status);

-- View dynamically computes 3-year expiry without violating table immutability
CREATE VIEW public.v_gst_return_expiry_radar WITH (security_invoker = true) AS
SELECT f.firm_id, f.id AS filing_id, f.gst_registration_id, f.return_period, f.return_type,
       f.statutory_due_date, f.expiry_date_3yr,
       (current_date > f.expiry_date_3yr) AS is_3yr_expired,
       (f.expiry_date_3yr - current_date) AS days_until_permanent_lock,
       e.legal_name, g.gstin
FROM public.gst_filings f
JOIN public.entities e ON e.firm_id = f.firm_id AND e.id = f.entity_id
JOIN public.gst_registrations g ON g.firm_id = f.firm_id AND g.id = f.gst_registration_id
WHERE f.workflow_status <> 'FILED'
  AND (f.expiry_date_3yr - current_date) <= 90;

-- Enforce GSTR-3B Submission Hard Locks with last_ims_modified_at comparison
CREATE FUNCTION app.validate_gstr3b_filing_guards() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, audit AS $$
BEGIN
  -- Checked when a GSTR-3B moves into PORTAL_SAVED or FILED, not on later edits of a filed row (ack payloads).
  IF NEW.return_type = 'GSTR3B' AND NEW.workflow_status IN ('PORTAL_SAVED','FILED')
     AND (TG_OP = 'INSERT' OR OLD.workflow_status IS DISTINCT FROM NEW.workflow_status) THEN
    -- Check 3-year cliff dynamically
    IF current_date > NEW.expiry_date_3yr THEN
      RAISE EXCEPTION 'PORTAL_LOCK_EXPIRED: Cannot file GSTR-3B for % as 3 years have elapsed since statutory due date %.', NEW.return_period, NEW.statutory_due_date
        USING ERRCODE = 'check_violation';
    END IF;

    -- Check Post-14th Recompute Lock using explicit last_ims_modified_at
    IF NEW.recompute_gstr2b_required THEN
      IF NEW.recompute_gstr2b_completed_at IS NULL OR
         (NEW.last_ims_modified_at IS NOT NULL AND NEW.recompute_gstr2b_completed_at < NEW.last_ims_modified_at) THEN
        RAISE EXCEPTION 'IMS_RECOMPUTE_LOCK: GSTR-3B cannot be signed or filed. IMS actions were modified post-14th. Recompute GSTR-2B must be completed first.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gstr3b_guards BEFORE INSERT OR UPDATE ON public.gst_filings
  FOR EACH ROW EXECUTE FUNCTION app.validate_gstr3b_filing_guards();

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.gst_invoices_sales    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.gst_invoices_purchase FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.gst_2b_records        FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.ims_action_queue      FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.gst_filings           FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER trg_audit_sales    AFTER INSERT OR UPDATE OR DELETE ON public.gst_invoices_sales    FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_purchase AFTER INSERT OR UPDATE OR DELETE ON public.gst_invoices_purchase FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_filings  AFTER INSERT OR UPDATE OR DELETE ON public.gst_filings           FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_ims      AFTER INSERT OR UPDATE OR DELETE ON public.ims_action_queue      FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

RESET ROLE;
