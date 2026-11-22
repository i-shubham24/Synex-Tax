-- =====================================================================
-- SynexTax | Migration 0026 | Salary register
-- Employees of a deductor for a tax year: the salary structure, income
-- from an earlier employer, the regime chosen and the employee's Form 124
-- declaration. TDS already deducted comes from the Form 138 rows, so it is
-- not kept here. No Aadhaar or bank details are stored.
-- =====================================================================
SET ROLE synextax_owner;

CREATE TABLE public.salary_employees (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id               uuid NOT NULL REFERENCES public.firms(id),
  entity_id             uuid NOT NULL,
  tan_registration_id   uuid NOT NULL,
  tax_year              smallint NOT NULL CHECK (tax_year BETWEEN 2026 AND 2100),
  employee_pan          char(10) NOT NULL CHECK (employee_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$|^PANNOTAVBL$'),
  employee_name         varchar(75) NOT NULL,
  regime                char(3) NOT NULL DEFAULT 'NEW' CHECK (regime IN ('NEW','OLD')),
  age_band              varchar(12) NOT NULL DEFAULT 'BELOW_60' CHECK (age_band IN ('BELOW_60','SENIOR','SUPER_SENIOR')),
  metro_city            boolean NOT NULL DEFAULT false,
  monthly_gross         numeric(15,2) NOT NULL CHECK (monthly_gross >= 0),
  monthly_basic_da      numeric(15,2) NOT NULL DEFAULT 0 CHECK (monthly_basic_da >= 0),
  monthly_hra           numeric(15,2) NOT NULL DEFAULT 0 CHECK (monthly_hra >= 0),
  monthly_employer_nps  numeric(15,2) NOT NULL DEFAULT 0 CHECK (monthly_employer_nps >= 0),
  annual_perquisites    numeric(15,2) NOT NULL DEFAULT 0 CHECK (annual_perquisites >= 0),
  professional_tax      numeric(10,2) NOT NULL DEFAULT 0 CHECK (professional_tax >= 0),
  joined_on             date,
  previous_employer     jsonb,                  -- {salary, professionalTax, tds}
  form124               jsonb,                  -- the employee's declaration (see tax-engine Form124)
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, tan_registration_id, tax_year, employee_pan, employee_name),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, tan_registration_id) REFERENCES public.tan_registrations (firm_id, id)
);

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.salary_employees FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_salary_employees AFTER INSERT OR UPDATE OR DELETE ON public.salary_employees FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

ALTER TABLE public.salary_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_employees FORCE ROW LEVEL SECURITY;
CREATE POLICY p_salary_employees_tenant ON public.salary_employees FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_employees TO synextax_app;

RESET ROLE;
