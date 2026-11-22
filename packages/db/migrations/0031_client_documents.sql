-- =====================================================================
-- SynexTax | Migration 0031 | Client documents and reminder automation
-- Documents: folders per client, documents with numbered versions (every
-- upload is a new version; a restore points a new version at an older
-- file), and a log of who opened which version. A document can be shared
-- with the client and held back until a named fee invoice is paid, unless
-- a partner waives the fee. The client portal reads these tables and calls
-- app.client_document_locked().
-- Automation: per-firm settings for document reminders that send
-- themselves, a pause per checklist, and a log of each step so a rerun of
-- the daily job never sends the same reminder twice.
-- =====================================================================
SET ROLE synextax_owner;

-- ------------------------------------------------------------- folders
CREATE TABLE public.doc_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id     uuid NOT NULL REFERENCES public.firms(id),
  entity_id   uuid NOT NULL,
  parent_id   uuid,
  name        varchar(80) NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  CHECK (parent_id IS NULL OR parent_id <> id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, parent_id) REFERENCES public.doc_folders (firm_id, id)
);
-- One name per level, ignoring case.
CREATE UNIQUE INDEX ux_doc_folders_name ON public.doc_folders (firm_id, entity_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- ----------------------------------------------------------- documents
CREATE TABLE public.client_documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id             uuid NOT NULL REFERENCES public.firms(id),
  entity_id           uuid NOT NULL,
  folder_id           uuid,
  title               varchar(160) NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  current_version     integer NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  shared_with_client  boolean NOT NULL DEFAULT false,
  locked_until_paid   boolean NOT NULL DEFAULT false,
  fee_invoice_id      uuid,
  fee_waived          boolean NOT NULL DEFAULT false,
  fee_waived_by       uuid,
  fee_waived_at       timestamptz,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  -- A lock always names the invoice that releases it.
  CHECK (NOT locked_until_paid OR fee_invoice_id IS NOT NULL),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, folder_id) REFERENCES public.doc_folders (firm_id, id),
  FOREIGN KEY (firm_id, fee_invoice_id) REFERENCES public.fee_invoices (firm_id, id)
);
CREATE INDEX ix_client_documents_entity ON public.client_documents (firm_id, entity_id, folder_id);

-- Versions are written once. A restore adds a version that points at an older version's file.
CREATE TABLE public.client_document_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id        uuid NOT NULL REFERENCES public.firms(id),
  document_id    uuid NOT NULL,
  version        integer NOT NULL CHECK (version >= 1),
  storage_key    varchar(200) NOT NULL,
  original_name  varchar(120) NOT NULL,
  mime_type      varchar(100) NOT NULL CHECK (mime_type IN (
                   'application/pdf','image/jpeg','image/png','image/webp',
                   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel',
                   'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword',
                   'text/csv','application/zip')),
  size_bytes     integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  sha256         char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by    uuid,
  uploaded_via   text NOT NULL DEFAULT 'FIRM' CHECK (uploaded_via IN ('FIRM','CLIENT')),
  restored_from  integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (document_id, version),
  FOREIGN KEY (firm_id, document_id) REFERENCES public.client_documents (firm_id, id)
);
CREATE INDEX ix_client_document_versions_key ON public.client_document_versions (storage_key);

-- Who opened (downloaded or previewed) which version, and when.
CREATE TABLE public.client_document_opens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id      uuid NOT NULL REFERENCES public.firms(id),
  document_id  uuid NOT NULL,
  version      integer NOT NULL CHECK (version >= 1),
  user_id      uuid,
  kind         varchar(10) NOT NULL DEFAULT 'DOWNLOAD' CHECK (kind IN ('DOWNLOAD','PREVIEW')),
  opened_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, document_id) REFERENCES public.client_documents (firm_id, id)
);
CREATE INDEX ix_client_document_opens_doc ON public.client_document_opens (firm_id, document_id, opened_at DESC);

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.doc_folders      FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.client_documents FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_doc_folders              AFTER INSERT OR UPDATE OR DELETE ON public.doc_folders              FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_client_documents         AFTER INSERT OR UPDATE OR DELETE ON public.client_documents         FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_client_document_versions AFTER INSERT OR UPDATE OR DELETE ON public.client_document_versions FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_client_document_opens    AFTER INSERT OR UPDATE OR DELETE ON public.client_document_opens    FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

ALTER TABLE public.doc_folders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_document_opens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_folders              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.client_documents         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.client_document_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.client_document_opens    FORCE ROW LEVEL SECURITY;

CREATE POLICY p_doc_folders_tenant ON public.doc_folders FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
-- A client login sees only the documents the firm has shared (and adds only shared ones).
CREATE POLICY p_client_documents_tenant ON public.client_documents FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id)
         AND (shared_with_client OR app.current_user_role() IS DISTINCT FROM 'CLIENT'))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id)
         AND (shared_with_client OR app.current_user_role() IS DISTINCT FROM 'CLIENT'));
-- Versions and opens follow the document: visible when the document is visible to the caller.
CREATE POLICY p_client_document_versions_tenant ON public.client_document_versions FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND EXISTS (SELECT 1 FROM public.client_documents d WHERE d.id = document_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND EXISTS (SELECT 1 FROM public.client_documents d WHERE d.id = document_id));
-- Anyone who may open a document is logged; only partners (and signed jobs) read the log.
CREATE POLICY p_client_document_opens_insert ON public.client_document_opens FOR INSERT TO synextax_app
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND EXISTS (SELECT 1 FROM public.client_documents d WHERE d.id = document_id));
CREATE POLICY p_client_document_opens_read ON public.client_document_opens FOR SELECT TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id())
         AND (app.current_user_role() = 'PARTNER' OR (app.current_actor_kind() = 'SYSTEM_JOB' AND app.current_user_id() IS NULL))
         AND EXISTS (SELECT 1 FROM public.client_documents d WHERE d.id = document_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doc_folders TO synextax_app;
GRANT SELECT, INSERT, UPDATE ON public.client_documents TO synextax_app;
GRANT SELECT, INSERT ON public.client_document_versions, public.client_document_opens TO synextax_app;

-- True when the client's share of the invoice is settled. Receipts are not tied to invoices, so
-- they settle the client's issued invoices oldest first, as the fee ledger does.
CREATE FUNCTION app.fee_invoice_paid(p_invoice_id uuid) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, public, app AS $$
  SELECT i.status = 'ISSUED'
     AND (SELECT COALESCE(sum(r.amount), 0) FROM public.fee_receipts r WHERE r.firm_id = i.firm_id AND r.entity_id = i.entity_id)
      >= (SELECT sum(o.total) FROM public.fee_invoices o
          WHERE o.firm_id = i.firm_id AND o.entity_id = i.entity_id AND o.status = 'ISSUED'
            AND (o.invoice_date, o.created_at, o.id) <= (i.invoice_date, i.created_at, i.id))
  FROM public.fee_invoices i WHERE i.id = p_invoice_id
$$;

-- True when the client may not open the document yet: it is locked until a fee invoice is paid,
-- the partner has not waived the fee, and the invoice is not fully paid. A document the caller
-- cannot see counts as locked. A cancelled invoice keeps the lock until the firm links another.
CREATE FUNCTION app.client_document_locked(p_document_id uuid) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, public, app AS $$
  SELECT COALESCE(
    (SELECT d.locked_until_paid AND NOT d.fee_waived AND NOT COALESCE(app.fee_invoice_paid(d.fee_invoice_id), false)
     FROM public.client_documents d WHERE d.id = p_document_id),
    true)
$$;
REVOKE ALL ON FUNCTION app.fee_invoice_paid(uuid), app.client_document_locked(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.fee_invoice_paid(uuid), app.client_document_locked(uuid) TO synextax_app;

-- ---------------------------------------------------------- automation
CREATE TABLE public.practice_automation_settings (
  id               uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,   -- the audit trail keys rows by id
  firm_id          uuid PRIMARY KEY REFERENCES public.firms(id),
  client_days      smallint[] NOT NULL DEFAULT '{1,5}' CHECK (cardinality(client_days) <= 4 AND 1 <= ALL (client_days) AND 60 >= ALL (client_days)),
  firm_note_day    smallint DEFAULT 10 CHECK (firm_note_day IS NULL OR firm_note_day BETWEEN 1 AND 90),
  channels         text[] NOT NULL DEFAULT '{EMAIL,WHATSAPP}' CHECK (channels <@ ARRAY['EMAIL','WHATSAPP']::text[]),
  paused           boolean NOT NULL DEFAULT false,
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Per checklist: the day it first went to the client (a reminder or an upload link from the
-- firm; the schedule counts from it, and null means not sent yet) and a pause.
CREATE TABLE public.practice_checklist_automation (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id),
  entity_id     uuid NOT NULL,
  checklist_id  uuid NOT NULL,
  sent_on       date,
  paused        boolean NOT NULL DEFAULT false,
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, checklist_id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, checklist_id) REFERENCES public.doc_checklists (firm_id, id) ON DELETE CASCADE
);

-- One row per checklist and step. The job claims a step by inserting it before sending, so a
-- rerun finds it and sends nothing. A failed step is retried, at most once a day.
CREATE TABLE public.practice_automation_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id),
  entity_id     uuid NOT NULL,
  checklist_id  uuid NOT NULL,
  kind          varchar(8) NOT NULL CHECK (kind IN ('CLIENT','FIRM')),
  step_day      smallint NOT NULL CHECK (step_day BETWEEN 1 AND 90),
  run_on        date NOT NULL,
  outcome       varchar(12) NOT NULL DEFAULT 'PENDING' CHECK (outcome IN ('PENDING','SENT','NO_CONTACT','NOT_SET_UP','FAILED','NOTED')),
  channels      text[] NOT NULL DEFAULT '{}',
  detail        varchar(300),
  outstanding   smallint,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, checklist_id, kind, step_day),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, checklist_id) REFERENCES public.doc_checklists (firm_id, id) ON DELETE CASCADE
);
CREATE INDEX ix_automation_log_recent ON public.practice_automation_log (firm_id, run_on DESC);

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.practice_automation_settings  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.practice_checklist_automation FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.practice_automation_log       FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_automation_settings  AFTER INSERT OR UPDATE OR DELETE ON public.practice_automation_settings  FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_checklist_automation AFTER INSERT OR UPDATE OR DELETE ON public.practice_checklist_automation FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_automation_log       AFTER INSERT OR UPDATE OR DELETE ON public.practice_automation_log       FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

ALTER TABLE public.practice_automation_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_checklist_automation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_automation_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_automation_settings  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.practice_checklist_automation FORCE ROW LEVEL SECURITY;
ALTER TABLE public.practice_automation_log       FORCE ROW LEVEL SECURITY;

CREATE POLICY p_automation_settings_tenant ON public.practice_automation_settings FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()));
CREATE POLICY p_checklist_automation_tenant ON public.practice_checklist_automation FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
CREATE POLICY p_automation_log_tenant ON public.practice_automation_log FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

GRANT SELECT, INSERT, UPDATE ON public.practice_automation_settings, public.practice_checklist_automation, public.practice_automation_log TO synextax_app;

-- The daily job's list of firms to visit, before any firm is known. Only ids are revealed.
CREATE FUNCTION app.automation_firm_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app AS $$
  SELECT f.id FROM public.firms f WHERE f.status = 'ACTIVE' ORDER BY f.id
$$;
REVOKE ALL ON FUNCTION app.automation_firm_ids() FROM PUBLIC;
ALTER FUNCTION app.automation_firm_ids() OWNER TO synextax_rls_helper;

SET ROLE synextax_rls_helper;
GRANT EXECUTE ON FUNCTION app.automation_firm_ids() TO synextax_app;
SET ROLE synextax_owner;

RESET ROLE;
