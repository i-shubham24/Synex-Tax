-- =====================================================================
-- SynexTax | Migration 0023 | Client upload links and document files
-- A firm sends a client a link for one document checklist. The client opens
-- it on a phone, photographs or picks each document, and the file lands
-- against the checklist item. The link is a random token; only its SHA-256
-- is stored. Links expire and can be revoked. Files are stored outside the
-- database; this table records where, their size, type and checksum.
-- =====================================================================
SET ROLE synextax_owner;

CREATE TABLE public.doc_upload_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id),
  entity_id     uuid NOT NULL,
  checklist_id  uuid NOT NULL,
  token_sha256  char(64) NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, checklist_id) REFERENCES public.doc_checklists (firm_id, id) ON DELETE CASCADE
);

CREATE TABLE public.doc_files (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id        uuid NOT NULL REFERENCES public.firms(id),
  entity_id      uuid NOT NULL,
  checklist_id   uuid NOT NULL,
  item_id        uuid NOT NULL,
  storage_key    varchar(200) NOT NULL UNIQUE,
  original_name  varchar(120) NOT NULL,
  mime_type      varchar(40) NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','application/pdf')),
  size_bytes     integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  sha256         char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_via   varchar(12) NOT NULL CHECK (uploaded_via IN ('PORTAL','STAFF')),
  upload_link_id uuid,
  uploaded_by    uuid,
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, checklist_id) REFERENCES public.doc_checklists (firm_id, id) ON DELETE CASCADE,
  FOREIGN KEY (firm_id, item_id) REFERENCES public.doc_checklist_items (firm_id, id) ON DELETE CASCADE
);
CREATE INDEX ix_doc_files_item ON public.doc_files (firm_id, item_id);

CREATE TRIGGER trg_audit_upload_links AFTER INSERT OR UPDATE OR DELETE ON public.doc_upload_links FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_doc_files    AFTER INSERT OR UPDATE OR DELETE ON public.doc_files        FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

ALTER TABLE public.doc_upload_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_files        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_upload_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.doc_files        FORCE ROW LEVEL SECURITY;

CREATE POLICY p_upload_links_tenant ON public.doc_upload_links FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
CREATE POLICY p_doc_files_tenant ON public.doc_files FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
-- The link resolver below reads only this table, before any firm is known.
CREATE POLICY p_upload_links_resolver ON public.doc_upload_links FOR SELECT TO synextax_rls_helper USING (true);

GRANT SELECT, INSERT, UPDATE ON public.doc_upload_links TO synextax_app;
GRANT SELECT, INSERT ON public.doc_files TO synextax_app;
GRANT SELECT ON public.doc_upload_links TO synextax_rls_helper;

-- Which firm, client and checklist a live link belongs to. Nothing else is revealed.
CREATE FUNCTION app.resolve_upload_link(p_token_sha256 text)
RETURNS TABLE (link_id uuid, firm_id uuid, entity_id uuid, checklist_id uuid, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app AS $$
  SELECT l.id, l.firm_id, l.entity_id, l.checklist_id, l.expires_at
  FROM public.doc_upload_links l
  WHERE l.token_sha256 = p_token_sha256 AND l.revoked_at IS NULL AND l.expires_at > now()
$$;
REVOKE ALL ON FUNCTION app.resolve_upload_link(text) FROM PUBLIC;
ALTER FUNCTION app.resolve_upload_link(text) OWNER TO synextax_rls_helper;

SET ROLE synextax_rls_helper;
GRANT EXECUTE ON FUNCTION app.resolve_upload_link(text) TO synextax_app;
SET ROLE synextax_owner;

RESET ROLE;
