-- =====================================================================
-- SynexTax | Migration 0033 | Client logins: messages, and keeping a client
-- login inside its own entities
--
-- 1. A conversation per firm and client entity. Messages are written by the
--    firm's team or by the client's own login. The body is stored encrypted
--    (AES-256-GCM, key held by the API, never by the database); the column
--    name ends in _ciphertext so the audit trigger leaves it out. Each message
--    has a read time per side. Attachments are files kept outside the
--    database, recorded here with size, type and SHA-256.
-- 2. A CLIENT login could read firm-wide rows of users, client assignments and
--    client groups, and write to entity rows it can see. For the tables the
--    client portal reads, restrictive policies below limit it to its own rows
--    and read access, and a trigger lets it only mark a checklist item as
--    received.
-- =====================================================================
SET ROLE synextax_owner;

-- ---------------------------------------------------------------------
-- 1. Conversations and messages
-- ---------------------------------------------------------------------
CREATE TABLE public.client_conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id          uuid NOT NULL REFERENCES public.firms(id),
  entity_id        uuid NOT NULL,
  last_message_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, id, entity_id),
  UNIQUE (firm_id, entity_id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id)
);

CREATE TABLE public.client_messages (
  id                 uuid PRIMARY KEY,
  firm_id            uuid NOT NULL REFERENCES public.firms(id),
  entity_id          uuid NOT NULL,
  conversation_id    uuid NOT NULL,
  sender_user_id     uuid NOT NULL,
  sender_side        varchar(6) NOT NULL CHECK (sender_side IN ('FIRM','CLIENT')),
  sender_name        varchar(150) NOT NULL,
  -- iv (12) | tag (16) | ciphertext; additional data binds it to firm, entity and message id.
  body_ciphertext    bytea NOT NULL CHECK (octet_length(body_ciphertext) BETWEEN 28 AND 20000),
  key_version        smallint NOT NULL DEFAULT 1 CHECK (key_version > 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  read_by_firm_at    timestamptz,
  read_by_client_at  timestamptz,
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, conversation_id, entity_id) REFERENCES public.client_conversations (firm_id, id, entity_id),
  FOREIGN KEY (firm_id, sender_user_id) REFERENCES public.users (firm_id, id),
  -- The sender has read their own message.
  CHECK (sender_side <> 'FIRM'   OR read_by_firm_at   IS NOT NULL),
  CHECK (sender_side <> 'CLIENT' OR read_by_client_at IS NOT NULL)
);
CREATE INDEX ix_client_messages_conv ON public.client_messages (firm_id, conversation_id, created_at);
CREATE INDEX ix_client_messages_unread_firm ON public.client_messages (firm_id, entity_id) WHERE read_by_firm_at IS NULL;
CREATE INDEX ix_client_messages_unread_client ON public.client_messages (firm_id, entity_id) WHERE read_by_client_at IS NULL;

CREATE TABLE public.client_message_attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id        uuid NOT NULL REFERENCES public.firms(id),
  entity_id      uuid NOT NULL,
  message_id     uuid NOT NULL,
  storage_key    varchar(200) NOT NULL UNIQUE,
  original_name  varchar(120) NOT NULL,
  mime_type      varchar(40) NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','application/pdf')),
  size_bytes     integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  sha256         char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by    uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, message_id) REFERENCES public.client_messages (firm_id, id),
  FOREIGN KEY (firm_id, uploaded_by) REFERENCES public.users (firm_id, id)
);
CREATE INDEX ix_client_message_attachments_msg ON public.client_message_attachments (firm_id, message_id);

-- A message is never edited: only the read times change, each once, and each
-- side marks only its own read time.
CREATE FUNCTION app.guard_client_message_update() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_role public.user_role := app.current_user_role();
BEGIN
  IF (to_jsonb(NEW) - 'read_by_firm_at' - 'read_by_client_at') IS DISTINCT FROM (to_jsonb(OLD) - 'read_by_firm_at' - 'read_by_client_at') THEN
    RAISE EXCEPTION 'MESSAGE_IMMUTABLE: a sent message cannot be changed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.read_by_firm_at IS NOT NULL AND NEW.read_by_firm_at IS DISTINCT FROM OLD.read_by_firm_at
     OR OLD.read_by_client_at IS NOT NULL AND NEW.read_by_client_at IS DISTINCT FROM OLD.read_by_client_at THEN
    RAISE EXCEPTION 'MESSAGE_IMMUTABLE: a read time is set once.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_role = 'CLIENT' AND NEW.read_by_firm_at IS DISTINCT FROM OLD.read_by_firm_at THEN
    RAISE EXCEPTION 'MESSAGE_IMMUTABLE: a client marks only its own read time.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_role IS DISTINCT FROM 'CLIENT' AND NEW.read_by_client_at IS DISTINCT FROM OLD.read_by_client_at THEN
    RAISE EXCEPTION 'MESSAGE_IMMUTABLE: the firm cannot mark a message read for the client.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_client_message BEFORE UPDATE ON public.client_messages FOR EACH ROW EXECUTE FUNCTION app.guard_client_message_update();
CREATE TRIGGER trg_audit_client_conversations AFTER INSERT OR UPDATE OR DELETE ON public.client_conversations       FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_client_messages      AFTER INSERT OR UPDATE OR DELETE ON public.client_messages            FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_client_msg_files     AFTER INSERT OR UPDATE OR DELETE ON public.client_message_attachments FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

ALTER TABLE public.client_conversations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_conversations       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.client_messages            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.client_message_attachments FORCE ROW LEVEL SECURITY;

CREATE POLICY p_client_conversations_tenant ON public.client_conversations FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_client_messages_read ON public.client_messages FOR SELECT TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
-- A message is sent as the signed-in user, on the side their role belongs to.
CREATE POLICY p_client_messages_send ON public.client_messages FOR INSERT TO synextax_app
  WITH CHECK (
    firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id)
    AND sender_user_id = (SELECT app.current_user_id())
    AND sender_side = CASE (SELECT app.current_user_role()) WHEN 'CLIENT' THEN 'CLIENT' WHEN 'PARTNER' THEN 'FIRM' WHEN 'MANAGER' THEN 'FIRM' WHEN 'STAFF' THEN 'FIRM' END
  );
CREATE POLICY p_client_messages_mark_read ON public.client_messages FOR UPDATE TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

CREATE POLICY p_client_msg_files_read ON public.client_message_attachments FOR SELECT TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
CREATE POLICY p_client_msg_files_add ON public.client_message_attachments FOR INSERT TO synextax_app
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id)
              AND uploaded_by = (SELECT app.current_user_id()));

GRANT SELECT, INSERT, UPDATE ON public.client_conversations TO synextax_app;
GRANT SELECT, INSERT ON public.client_message_attachments TO synextax_app;
GRANT SELECT, INSERT ON public.client_messages TO synextax_app;
GRANT UPDATE (read_by_firm_at, read_by_client_at) ON public.client_messages TO synextax_app;

-- ---------------------------------------------------------------------
-- 2. A CLIENT login stays inside its own rows
-- Restrictive policies are ANDed with the existing ones, so team members are
-- unaffected. app.current_user_role() is NULL for signed system jobs, which
-- therefore pass.
-- ---------------------------------------------------------------------

-- The firm's team list and other people's assignments are not a client's business.
CREATE POLICY p_users_client_self ON public.users AS RESTRICTIVE FOR SELECT TO synextax_app
  USING ((SELECT app.current_user_role()) IS DISTINCT FROM 'CLIENT' OR id = (SELECT app.current_user_id()));
CREATE POLICY p_uca_client_self ON public.user_client_assignments AS RESTRICTIVE FOR SELECT TO synextax_app
  USING ((SELECT app.current_user_role()) IS DISTINCT FROM 'CLIENT' OR user_id = (SELECT app.current_user_id()));
-- Only the groups that hold an entity the client can see (entities are filtered by their own policy).
CREATE POLICY p_client_groups_client_read ON public.client_groups AS RESTRICTIVE FOR SELECT TO synextax_app
  USING ((SELECT app.current_user_role()) IS DISTINCT FROM 'CLIENT'
         OR EXISTS (SELECT 1 FROM public.entities e WHERE e.firm_id = client_groups.firm_id AND e.client_group_id = client_groups.id));

-- Read only for a client: client groups, entities, checklists, returns and fee invoices.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['client_groups','entities','doc_checklists','gst_filings','tds_returns','fee_invoices','fee_receipts','doc_upload_links'] LOOP
    EXECUTE format($f$CREATE POLICY p_%1$s_client_no_insert ON public.%1$I AS RESTRICTIVE FOR INSERT TO synextax_app
                     WITH CHECK ((SELECT app.current_user_role()) IS DISTINCT FROM 'CLIENT')$f$, t);
    EXECUTE format($f$CREATE POLICY p_%1$s_client_no_update ON public.%1$I AS RESTRICTIVE FOR UPDATE TO synextax_app
                     USING ((SELECT app.current_user_role()) IS DISTINCT FROM 'CLIENT')$f$, t);
    EXECUTE format($f$CREATE POLICY p_%1$s_client_no_delete ON public.%1$I AS RESTRICTIVE FOR DELETE TO synextax_app
                     USING ((SELECT app.current_user_role()) IS DISTINCT FROM 'CLIENT')$f$, t);
  END LOOP;
END $$;

-- Checklist items: a client cannot add or remove them, and may change one only
-- by marking a needed (or sent back) item as received through the portal.
CREATE POLICY p_doc_items_client_no_insert ON public.doc_checklist_items AS RESTRICTIVE FOR INSERT TO synextax_app
  WITH CHECK ((SELECT app.current_user_role()) IS DISTINCT FROM 'CLIENT');
CREATE POLICY p_doc_items_client_no_delete ON public.doc_checklist_items AS RESTRICTIVE FOR DELETE TO synextax_app
  USING ((SELECT app.current_user_role()) IS DISTINCT FROM 'CLIENT');

CREATE FUNCTION app.guard_client_item_update() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF app.current_user_role() IS DISTINCT FROM 'CLIENT' THEN
    RETURN NEW;
  END IF;
  IF OLD.status NOT IN ('MISSING','REJECTED') OR NEW.status <> 'RECEIVED' OR NEW.received_via IS DISTINCT FROM 'PORTAL'
     OR (to_jsonb(NEW) - 'status' - 'received_via' - 'updated_at' - 'updated_by') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'received_via' - 'updated_at' - 'updated_by') THEN
    RAISE EXCEPTION 'CLIENT_READ_ONLY: a client can only send a document for an item that is still needed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.updated_by := app.current_user_id();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_client_item BEFORE UPDATE ON public.doc_checklist_items FOR EACH ROW EXECUTE FUNCTION app.guard_client_item_update();

-- Shared documents (0031): a client never changes whether a document is shared
-- or held back for a fee, nor which invoice releases it.
CREATE FUNCTION app.guard_client_document_lock() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app AS $$
DECLARE
  c_keys constant text[] := ARRAY['shared_with_client','locked_until_paid','fee_invoice_id','fee_waived','fee_waived_by','fee_waived_at'];
BEGIN
  IF app.current_user_role() IS DISTINCT FROM 'CLIENT' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE((to_jsonb(NEW) ->> 'fee_waived')::boolean, false) THEN
      RAISE EXCEPTION 'CLIENT_READ_ONLY: a client cannot waive a fee.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(c_keys) k WHERE to_jsonb(NEW) -> k IS DISTINCT FROM to_jsonb(OLD) -> k) THEN
    RAISE EXCEPTION 'CLIENT_READ_ONLY: a client cannot change how a document is shared or released.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
DO $$
BEGIN
  IF to_regclass('public.client_documents') IS NOT NULL THEN
    CREATE TRIGGER trg_guard_client_document_lock BEFORE INSERT OR UPDATE ON public.client_documents
      FOR EACH ROW EXECUTE FUNCTION app.guard_client_document_lock();
  END IF;
END $$;

-- Files a client adds are portal uploads under its own name.
CREATE POLICY p_doc_files_client_own ON public.doc_files AS RESTRICTIVE FOR INSERT TO synextax_app
  WITH CHECK ((SELECT app.current_user_role()) IS DISTINCT FROM 'CLIENT'
              OR (uploaded_via = 'PORTAL' AND uploaded_by = (SELECT app.current_user_id()) AND upload_link_id IS NULL));

RESET ROLE;
