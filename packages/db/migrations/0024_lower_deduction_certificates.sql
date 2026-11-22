-- =====================================================================
-- SynexTax | Migration 0024 | Lower or nil deduction certificates
-- A payee may hold a certificate from the Assessing Officer (section
-- 395(1) of the 2025 Act; section 197 before) to be taxed at a lower rate
-- or not at all, for named payments, up to an amount, within dates.
-- Statement rows with reason flag A rely on one; this register lets each
-- such row be checked against it.
-- =====================================================================
SET ROLE synextax_owner;

CREATE TABLE public.lower_deduction_certificates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id             uuid NOT NULL REFERENCES public.firms(id),
  entity_id           uuid NOT NULL,
  tan_registration_id uuid NOT NULL,
  certificate_no      varchar(15) NOT NULL CHECK (certificate_no ~ '^[A-Z0-9]{10}([A-Z0-9]{5})?$'),
  deductee_pan        char(10) NOT NULL CHECK (deductee_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  deductee_name       varchar(75) NOT NULL,
  section_code        varchar(8) NOT NULL,
  rate_percent        numeric(7,4) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  amount_limit        numeric(18,2) NOT NULL CHECK (amount_limit > 0),
  valid_from          date NOT NULL,
  valid_to            date NOT NULL,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, tan_registration_id, certificate_no),
  CHECK (valid_to >= valid_from),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, tan_registration_id) REFERENCES public.tan_registrations (firm_id, id)
);
CREATE INDEX ix_ldc_lookup ON public.lower_deduction_certificates (firm_id, tan_registration_id, deductee_pan);

CREATE TRIGGER trg_audit_ldc AFTER INSERT OR UPDATE OR DELETE ON public.lower_deduction_certificates FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

ALTER TABLE public.lower_deduction_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lower_deduction_certificates FORCE ROW LEVEL SECURITY;
CREATE POLICY p_ldc_tenant ON public.lower_deduction_certificates FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
GRANT SELECT, INSERT, DELETE ON public.lower_deduction_certificates TO synextax_app;

RESET ROLE;
