-- =====================================================================
-- SynexTax | Migration 0007 | Dual-Act TDS/TCS Engine & ITNS 281N Schema
-- Target   : PostgreSQL 17 (AWS RDS Multi-AZ, ap-south-1)
-- Dual-Act : Income-tax Act, 1961 (<= 2026-03-31) vs Income-tax Act, 2025 (>= 2026-04-01)
-- Critical : ITNS 281N multi-section challans (up to 20 sections), unified Form 143 TCS dates
-- =====================================================================
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 1. TDS/TCS Challans (ITNS 281 & ITNS 281N)
-- ---------------------------------------------------------------------
CREATE TABLE public.tds_challans (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                         uuid NOT NULL REFERENCES public.firms(id),
  entity_id                       uuid NOT NULL,
  tan_registration_id             uuid NOT NULL,
  challan_no                      varchar(16) NOT NULL,
  bsr_code                        char(7) NOT NULL CHECK (bsr_code ~ '^[0-9]{7}$'),
  deposit_date                    date NOT NULL,
  statutory_regime                public.statutory_regime NOT NULL,
  tax_year                        smallint NOT NULL,
  quarter                         varchar(2) NOT NULL CHECK (quarter IN ('Q1','Q2','Q3','Q4')),

  deductee_type_head              varchar(8) NOT NULL CHECK (deductee_type_head IN ('0020','0021')),
  residency_scope                 varchar(16) NOT NULL DEFAULT 'RESIDENT' CHECK (residency_scope IN ('RESIDENT','NON_RESIDENT')),
  minor_head                      varchar(4) NOT NULL DEFAULT '200' CHECK (minor_head IN ('200','400')),

  total_income_tax                numeric(18,2) NOT NULL DEFAULT 0.00,
  total_surcharge                 numeric(18,2) NOT NULL DEFAULT 0.00,
  total_cess                      numeric(18,2) NOT NULL DEFAULT 0.00,

  interest_allocation             numeric(18,2) NOT NULL DEFAULT 0.00,
  others_allocation               numeric(18,2) NOT NULL DEFAULT 0.00,
  fee_late_filing_427_234e        numeric(18,2) NOT NULL DEFAULT 0.00,
  total_challan_amount            numeric(18,2) NOT NULL DEFAULT 0.00,

  csi_matched                     boolean NOT NULL DEFAULT false,
  csi_cin                         varchar(32),
  csi_file_id                     uuid,
  version                         integer NOT NULL DEFAULT 1,
  status                          public.lifecycle_status NOT NULL DEFAULT 'ACTIVE',
  created_by                      uuid,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (firm_id, id),
  UNIQUE (firm_id, tan_registration_id, bsr_code, challan_no, deposit_date),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, tan_registration_id) REFERENCES public.tan_registrations (firm_id, id)
);

CREATE INDEX ix_tds_challans_tan ON public.tds_challans (firm_id, tan_registration_id, deposit_date);

-- ---------------------------------------------------------------------
-- 2. TDS Challan Section Allocations (Child Table)
-- ---------------------------------------------------------------------
CREATE TABLE public.tds_challan_section_allocations (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                         uuid NOT NULL REFERENCES public.firms(id),
  entity_id                       uuid NOT NULL,
  challan_id                      uuid NOT NULL,
  section_code                    varchar(16) NOT NULL,
  income_tax                      numeric(18,2) NOT NULL DEFAULT 0.00,
  surcharge                       numeric(18,2) NOT NULL DEFAULT 0.00,
  cess                            numeric(18,2) NOT NULL DEFAULT 0.00,
  total_section_amount            numeric(18,2) NOT NULL DEFAULT 0.00,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (firm_id, id),
  UNIQUE (firm_id, challan_id, section_code),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, challan_id) REFERENCES public.tds_challans (firm_id, id) ON DELETE CASCADE
);

CREATE INDEX ix_section_alloc_challan ON public.tds_challan_section_allocations (firm_id, challan_id);

CREATE FUNCTION app.validate_challan_section_allocations() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, audit AS $$
DECLARE
  v_regime public.statutory_regime;
  v_count  integer;
BEGIN
  SELECT statutory_regime INTO v_regime
  FROM public.tds_challans
  WHERE id = NEW.challan_id AND firm_id = NEW.firm_id;

  IF v_regime = 'IT_ACT_1961' THEN
    SELECT count(*) INTO v_count
    FROM public.tds_challan_section_allocations
    WHERE challan_id = NEW.challan_id AND firm_id = NEW.firm_id AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_count >= 1 THEN
      RAISE EXCEPTION 'STATUTORY_CHALLAN_VIOLATION: Under Income-tax Act, 1961 (ITNS 281), a challan can allocate to exactly 1 section code.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_regime = 'IT_ACT_2025' THEN
    SELECT count(*) INTO v_count
    FROM public.tds_challan_section_allocations
    WHERE challan_id = NEW.challan_id AND firm_id = NEW.firm_id AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_count >= 20 THEN
      RAISE EXCEPTION 'STATUTORY_CHALLAN_VIOLATION: Under Income-tax Act, 2025 (ITNS 281N), a single challan cannot exceed 20 section code allocations.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_challan_sections BEFORE INSERT OR UPDATE ON public.tds_challan_section_allocations
  FOR EACH ROW EXECUTE FUNCTION app.validate_challan_section_allocations();

-- ---------------------------------------------------------------------
-- 3. TDS Deductee Records (Protean Literals: PANNOTAVBL, PANAPPLIED, PANINVALID)
-- ---------------------------------------------------------------------
CREATE TABLE public.tds_deductees (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                         uuid NOT NULL REFERENCES public.firms(id),
  entity_id                       uuid NOT NULL,
  tan_registration_id             uuid NOT NULL,
  challan_id                      uuid NOT NULL,
  section_allocation_id           uuid NOT NULL,
  
  -- Supports standard 10-char PAN or Protean statutory non-PAN literals
  deductee_pan                    varchar(10) NOT NULL
                                  CHECK (deductee_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'
                                      OR deductee_pan IN ('PANNOTAVBL','PANAPPLIED','PANINVALID')),
  deductee_name                   varchar(150) NOT NULL,
  pan_status                      varchar(16) NOT NULL DEFAULT 'OPERATIVE'
                                  CHECK (pan_status IN ('OPERATIVE','INOPERATIVE','INVALID','UNAVAILABLE')),
  payment_credit_date             date NOT NULL,
  amount_paid                     numeric(18,2) NOT NULL DEFAULT 0.00,
  tds_rate                        numeric(6,4) NOT NULL,
  tds_deducted                    numeric(18,2) NOT NULL DEFAULT 0.00,
  surcharge_amount                numeric(18,2) NOT NULL DEFAULT 0.00,
  cess_amount                     numeric(18,2) NOT NULL DEFAULT 0.00,
  total_tds_deposited             numeric(18,2) NOT NULL DEFAULT 0.00,
  deduction_date                  date NOT NULL,
  certificate_no                  varchar(32),
  reason_for_non_deduction        varchar(8) CHECK (reason_for_non_deduction IN ('A','B','C','Y','S','T','Z')),
  
  parent_record_id                uuid REFERENCES public.tds_deductees(id),
  correction_batch_id             varchar(16),
  created_by                      uuid,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, tan_registration_id) REFERENCES public.tan_registrations (firm_id, id),
  FOREIGN KEY (firm_id, challan_id) REFERENCES public.tds_challans (firm_id, id),
  FOREIGN KEY (firm_id, section_allocation_id) REFERENCES public.tds_challan_section_allocations (firm_id, id)
);

CREATE INDEX ix_deductees_challan ON public.tds_deductees (firm_id, challan_id);
CREATE INDEX ix_deductees_pan ON public.tds_deductees (firm_id, deductee_pan);

-- ---------------------------------------------------------------------
-- 4. TDS Returns (Statements) - Supports Multiple Correction Batches (C1..Cn)
-- ---------------------------------------------------------------------
CREATE TABLE public.tds_returns (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                         uuid NOT NULL REFERENCES public.firms(id),
  entity_id                       uuid NOT NULL,
  tan_registration_id             uuid NOT NULL,
  statutory_regime                public.statutory_regime NOT NULL,
  tax_year                        smallint NOT NULL,
  quarter                         varchar(2) NOT NULL CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
  form_code                       varchar(8) NOT NULL,
  return_type                     varchar(12) NOT NULL DEFAULT 'ORIGINAL' CHECK (return_type IN ('ORIGINAL','CORRECTION')),
  correction_no                   integer NOT NULL DEFAULT 0,
  workflow_status                 public.filing_workflow_status NOT NULL DEFAULT 'DRAFT',

  statutory_due_date              date NOT NULL,
  is_nil_return                   boolean NOT NULL DEFAULT false,

  correction_window_expires_at    date NOT NULL,

  previous_token_number_15digit   char(15) CHECK (previous_token_number_15digit IS NULL OR previous_token_number_15digit ~ '^[0-9]{15}$'),
  latest_accepted_token_15digit   char(15) CHECK (latest_accepted_token_15digit IS NULL OR latest_accepted_token_15digit ~ '^[0-9]{15}$'),

  total_deductees                 integer NOT NULL DEFAULT 0,
  total_amount_paid               numeric(18,2) NOT NULL DEFAULT 0.00,
  total_tax_deducted              numeric(18,2) NOT NULL DEFAULT 0.00,
  total_tax_deposited             numeric(18,2) NOT NULL DEFAULT 0.00,
  late_fee_sec_234e_427           numeric(18,2) NOT NULL DEFAULT 0.00,

  fvu_job_id                      uuid,
  fvu_generated_at                timestamptz,
  signed_by_user_id               uuid,
  filed_at                        timestamptz,
  version                         integer NOT NULL DEFAULT 1,
  created_by                      uuid,          -- maker; set from the verified context, immutable
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (firm_id, id),
  UNIQUE (firm_id, tan_registration_id, statutory_regime, tax_year, quarter, form_code, return_type, correction_no),
  FOREIGN KEY (firm_id, created_by) REFERENCES public.users (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, tan_registration_id) REFERENCES public.tan_registrations (firm_id, id),
  FOREIGN KEY (firm_id, signed_by_user_id) REFERENCES public.users (firm_id, id)
);

CREATE INDEX ix_tds_returns_tan ON public.tds_returns (firm_id, tan_registration_id, tax_year, quarter);

CREATE FUNCTION app.compute_tds_statutory_due_date(
  p_regime public.statutory_regime,
  p_form_code text,
  p_tax_year smallint,
  p_quarter text
) RETURNS date
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, public, app, audit AS $$
BEGIN
  IF p_regime = 'IT_ACT_1961' THEN
    IF p_form_code = '27EQ' THEN
      CASE p_quarter
        WHEN 'Q1' THEN RETURN make_date(p_tax_year, 7, 15);
        WHEN 'Q2' THEN RETURN make_date(p_tax_year, 10, 15);
        WHEN 'Q3' THEN RETURN make_date(p_tax_year + 1, 1, 15);
        WHEN 'Q4' THEN RETURN make_date(p_tax_year + 1, 5, 15);
      END CASE;
    ELSE
      CASE p_quarter
        WHEN 'Q1' THEN RETURN make_date(p_tax_year, 7, 31);
        WHEN 'Q2' THEN RETURN make_date(p_tax_year, 10, 31);
        WHEN 'Q3' THEN RETURN make_date(p_tax_year + 1, 1, 31);
        WHEN 'Q4' THEN RETURN make_date(p_tax_year + 1, 5, 31);
      END CASE;
    END IF;
  ELSE
    CASE p_quarter
      WHEN 'Q1' THEN RETURN make_date(p_tax_year, 7, 31);
      WHEN 'Q2' THEN RETURN make_date(p_tax_year, 10, 31);
      WHEN 'Q3' THEN RETURN make_date(p_tax_year + 1, 1, 31);
      WHEN 'Q4' THEN RETURN make_date(p_tax_year + 1, 5, 31);
    END CASE;
  END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------
-- 5. Dockerized FVU Jobs
-- ---------------------------------------------------------------------
CREATE TABLE public.tds_fvu_jobs (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                         uuid NOT NULL REFERENCES public.firms(id),
  entity_id                       uuid NOT NULL,
  return_id                       uuid NOT NULL,
  fvu_version                     varchar(8) NOT NULL CHECK (fvu_version IN ('1.2','9.5','2.191')),
  docker_image                    varchar(64) NOT NULL,
  input_file_s3                   varchar(512) NOT NULL,
  csi_file_s3                     varchar(512),
  output_fvu_s3                   varchar(512),
  error_file_s3                   varchar(512),
  status                          varchar(24) NOT NULL DEFAULT 'QUEUED'
                                  CHECK (status IN ('QUEUED','RUNNING','SUCCESS','VALIDATION_FAILED','SYSTEM_ERROR')),
  error_summary                   jsonb,
  execution_duration_ms           integer,
  started_at                      timestamptz,
  completed_at                    timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, return_id) REFERENCES public.tds_returns (firm_id, id)
);

CREATE INDEX ix_fvu_jobs_return ON public.tds_fvu_jobs (firm_id, return_id, status);

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.tds_challans                   FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.tds_challan_section_allocations FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.tds_deductees                  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.tds_returns                    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.tds_fvu_jobs                   FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER trg_audit_challans AFTER INSERT OR UPDATE OR DELETE ON public.tds_challans FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_returns  AFTER INSERT OR UPDATE OR DELETE ON public.tds_returns  FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_deductees   AFTER INSERT OR UPDATE OR DELETE ON public.tds_deductees                  FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_allocations AFTER INSERT OR UPDATE OR DELETE ON public.tds_challan_section_allocations FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

-- ---------------------------------------------------------------------
-- Form 144 (non-resident payments, Income-tax Act 2025) remittance code
-- registry. Global, read-only reference data. Rows are loaded from the
-- official Protean / ITD return utility for each FVU release; nothing is
-- seeded here so no unverified code can reach a statement.
-- ---------------------------------------------------------------------
CREATE TABLE public.tds_remittance_tax_codes (
  regime            public.statutory_regime NOT NULL,
  form_code         varchar(8)  NOT NULL,
  code              varchar(8)  NOT NULL,
  description       text        NOT NULL,
  legacy_code_1961  varchar(8),            -- Form 27Q nature-of-remittance code it replaces, when one maps
  section_ref       varchar(32),
  fvu_version       varchar(8),
  effective_from    date,
  effective_to      date,
  source_ref        text,                  -- utility / notification the row was taken from
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (regime, form_code, code),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
GRANT SELECT ON public.tds_remittance_tax_codes TO synextax_app;

RESET ROLE;
