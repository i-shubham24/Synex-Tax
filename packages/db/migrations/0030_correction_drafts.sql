-- =====================================================================
-- SynexTax | Migration 0030 | TDS correction drafts with versions
-- A draft holds the work on one correction: the TRACES consolidated file
-- for a TAN, form, tax year and quarter, and the changes as JSON (see
-- tax-engine CorrectionEdits). Every save adds a version; a revert adds a
-- version too, so the version table only grows. The consolidated file is
-- kept on a version only when it differs from the one before, so a draft
-- row stays small and its audit entries stay readable.
-- Partners and managers write; partners, managers and staff assigned to
-- the client read (the TDS screen permission is checked by the API).
-- Deleting a draft hides it (deleted_at); its versions stay.
-- =====================================================================
SET ROLE synextax_owner;

CREATE TABLE public.tds_correction_drafts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id               uuid NOT NULL REFERENCES public.firms(id),
  entity_id             uuid NOT NULL,
  tan_registration_id   uuid NOT NULL,
  tan                   char(10) NOT NULL CHECK (tan ~ '^[A-Z]{4}[0-9]{5}[A-Z]$'),
  form                  varchar(3) NOT NULL CHECK (form IN ('138','140','143','144')),
  tax_year              smallint NOT NULL CHECK (tax_year BETWEEN 2026 AND 2100),
  quarter               smallint NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  title                 varchar(120),
  deductor_name         varchar(75),
  current_version       integer NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  conso_sha256          char(64) NOT NULL CHECK (conso_sha256 ~ '^[0-9a-f]{64}$'),
  edits                 jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(edits) = 'object'),
  options               jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(options) = 'object'),  -- {originalToken, previousToken}
  created_by            uuid,
  updated_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  deleted_by            uuid,
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, tan_registration_id) REFERENCES public.tan_registrations (firm_id, id)
);
-- One open draft per TAN, form, tax year and quarter.
CREATE UNIQUE INDEX ux_tds_correction_drafts_open
  ON public.tds_correction_drafts (firm_id, tan_registration_id, form, tax_year, quarter) WHERE deleted_at IS NULL;
CREATE INDEX ix_tds_correction_drafts_entity ON public.tds_correction_drafts (firm_id, entity_id);

CREATE TABLE public.tds_correction_draft_versions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id               uuid NOT NULL REFERENCES public.firms(id),
  entity_id             uuid NOT NULL,
  draft_id              uuid NOT NULL,
  version               integer NOT NULL CHECK (version >= 1),
  edits                 jsonb NOT NULL CHECK (jsonb_typeof(edits) = 'object'),
  options               jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(options) = 'object'),
  conso_text            text CHECK (conso_text IS NULL OR octet_length(conso_text) <= 10485760),  -- only when it changed
  conso_sha256          char(64) NOT NULL CHECK (conso_sha256 ~ '^[0-9a-f]{64}$'),
  note                  varchar(200),
  reverted_from         integer CHECK (reverted_from IS NULL OR reverted_from >= 1),
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, draft_id, version),
  CHECK (version > 1 OR conso_text IS NOT NULL),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, draft_id) REFERENCES public.tds_correction_drafts (firm_id, id)
);

-- Versions are never changed or removed, whoever asks.
CREATE FUNCTION app.refuse_version_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY: correction draft versions cannot be changed or deleted.' USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.tds_correction_drafts FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_tds_correction_drafts AFTER INSERT OR UPDATE OR DELETE ON public.tds_correction_drafts FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_append_only BEFORE UPDATE OR DELETE ON public.tds_correction_draft_versions FOR EACH ROW EXECUTE FUNCTION app.refuse_version_change();
CREATE TRIGGER trg_audit_tds_correction_draft_versions AFTER INSERT ON public.tds_correction_draft_versions FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

ALTER TABLE public.tds_correction_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tds_correction_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY p_tds_correction_drafts_read ON public.tds_correction_drafts FOR SELECT TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id)
         AND (SELECT app.current_user_role()) IN ('PARTNER','MANAGER','STAFF'));
CREATE POLICY p_tds_correction_drafts_insert ON public.tds_correction_drafts FOR INSERT TO synextax_app
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id)
              AND (SELECT app.current_user_role()) IN ('PARTNER','MANAGER'));
CREATE POLICY p_tds_correction_drafts_update ON public.tds_correction_drafts FOR UPDATE TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id)
         AND (SELECT app.current_user_role()) IN ('PARTNER','MANAGER'))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id)
              AND (SELECT app.current_user_role()) IN ('PARTNER','MANAGER'));
GRANT SELECT, INSERT, UPDATE ON public.tds_correction_drafts TO synextax_app;

ALTER TABLE public.tds_correction_draft_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tds_correction_draft_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY p_tds_correction_draft_versions_read ON public.tds_correction_draft_versions FOR SELECT TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id)
         AND (SELECT app.current_user_role()) IN ('PARTNER','MANAGER','STAFF'));
CREATE POLICY p_tds_correction_draft_versions_insert ON public.tds_correction_draft_versions FOR INSERT TO synextax_app
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id)
              AND (SELECT app.current_user_role()) IN ('PARTNER','MANAGER'));
GRANT SELECT, INSERT ON public.tds_correction_draft_versions TO synextax_app;

RESET ROLE;
