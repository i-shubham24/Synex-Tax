/* =====================================================================
 * SynexTax | Migration 0039 | Saved income tax returns
 * One return per client and assessment year: the form, the regime, the
 * figures on the ITR page (input), the computed or filed summary, the
 * status (DRAFT, READY, FILED) with the acknowledgement number and date of
 * filing, and notes to the return. The PAN, bank account and other details
 * typed into a form are not stored here; the client's PAN stays on
 * public.entities.
 * ===================================================================== */
SET ROLE synextax_owner;

CREATE TABLE public.itr_returns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id           uuid NOT NULL REFERENCES public.firms(id),
  entity_id         uuid NOT NULL,
  assessment_year   char(7) NOT NULL CHECK (assessment_year IN ('2022-23','2023-24','2024-25','2025-26','2026-27')),
  form              varchar(5) NOT NULL CHECK (form IN ('ITR-1','ITR-2','ITR-3','ITR-4','ITR-5','ITR-6','ITR-U')),
  regime            char(3) NOT NULL DEFAULT 'NEW' CHECK (regime IN ('NEW','OLD')),
  input             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(input) = 'object' AND pg_column_size(input) <= 262144),
  summary           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(summary) = 'object'),
  status            varchar(5) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','READY','FILED')),
  ack_number        varchar(15) CHECK (ack_number ~ '^[0-9]{15}$'),
  filed_on          date CHECK (filed_on BETWEEN DATE '2022-04-01' AND DATE '2100-12-31'),
  notes             text CHECK (char_length(notes) <= 4000),
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, entity_id, assessment_year),
  CHECK (status <> 'FILED' OR (ack_number IS NOT NULL AND filed_on IS NOT NULL)),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id)
);

CREATE INDEX idx_itr_returns_ay ON public.itr_returns (firm_id, assessment_year, status);

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.itr_returns FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_itr_returns AFTER INSERT OR UPDATE OR DELETE ON public.itr_returns FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

ALTER TABLE public.itr_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itr_returns FORCE ROW LEVEL SECURITY;
CREATE POLICY p_itr_returns_tenant ON public.itr_returns FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
/* Client logins never reach saved returns (as 0036 does for every firm work table). */
CREATE POLICY p_no_client_login ON public.itr_returns AS RESTRICTIVE FOR ALL TO synextax_app
  USING ((SELECT app.current_user_role()) IS DISTINCT FROM 'CLIENT')
  WITH CHECK ((SELECT app.current_user_role()) IS DISTINCT FROM 'CLIENT');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.itr_returns TO synextax_app;

RESET ROLE;
