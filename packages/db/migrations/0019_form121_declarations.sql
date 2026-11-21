-- =====================================================================
-- SynexTax | Migration 0019 | Form 121 declaration register
-- Payees who declare that their income is below the taxable limit give the
-- deductor a declaration (Form 121 under the 2025 Act, section 393(6);
-- Forms 15G and 15H before). A statement row with reason flag B says no tax
-- was deducted because of such a declaration, so the deductor must hold one.
-- This register records the declarations received, to check flag B rows
-- against. No Aadhaar number or other identity document is stored.
-- =====================================================================
SET ROLE synextax_owner;

CREATE TABLE public.form121_declarations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id                 uuid NOT NULL REFERENCES public.firms(id),
  entity_id               uuid NOT NULL,
  tan_registration_id     uuid NOT NULL,
  tax_year                smallint NOT NULL CHECK (tax_year BETWEEN 2000 AND 2100),
  declarant_pan           char(10) NOT NULL CHECK (declarant_pan ~ '^[A-Z]{3}[ABGHJLPT][A-Z][0-9]{4}[A-Z]$'),
  declarant_name          varchar(75) NOT NULL,
  identification_no       varchar(26) CHECK (identification_no IS NULL OR identification_no ~ '^[A-Z0-9]{26}$'),
  received_on             date NOT NULL,
  senior_citizen          boolean NOT NULL DEFAULT false,
  income_nature           varchar(120),
  estimated_income        numeric(15,2) NOT NULL DEFAULT 0 CHECK (estimated_income >= 0),
  estimated_total_income  numeric(15,2) NOT NULL DEFAULT 0 CHECK (estimated_total_income >= 0),
  status                  varchar(12) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','WITHDRAWN')),
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  -- Senior citizen declarations are only for individuals.
  CHECK (NOT senior_citizen OR substr(declarant_pan, 4, 1) = 'P'),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, tan_registration_id) REFERENCES public.tan_registrations (firm_id, id)
);
CREATE UNIQUE INDEX ux_form121_identification ON public.form121_declarations (firm_id, tan_registration_id, identification_no) WHERE identification_no IS NOT NULL;
CREATE INDEX ix_form121_lookup ON public.form121_declarations (firm_id, tan_registration_id, tax_year, declarant_pan);

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.form121_declarations FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_form121 AFTER INSERT OR UPDATE OR DELETE ON public.form121_declarations FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

ALTER TABLE public.form121_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form121_declarations FORCE ROW LEVEL SECURITY;

CREATE POLICY p_form121_tenant ON public.form121_declarations
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

GRANT SELECT, INSERT, UPDATE ON public.form121_declarations TO synextax_app;

RESET ROLE;
