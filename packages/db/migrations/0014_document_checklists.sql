-- =====================================================================
-- SynexTax | Migration 0014 | Document checklists (practice layer)
-- What a client still owes the firm for a service and period: sales and
-- purchase invoices for a GST month, payment details for a TDS quarter, and
-- so on. Items are marked by staff as received (on WhatsApp, email or paper),
-- accepted or rejected. Client self-upload arrives with file storage.
-- =====================================================================
SET ROLE synextax_owner;

CREATE TABLE public.doc_checklists (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id),
  entity_id     uuid NOT NULL,
  service       varchar(24) NOT NULL CHECK (service IN ('GST_MONTHLY','GST_QRMP_QUARTER','TDS_QUARTER','ITR_INDIVIDUAL','ITR_BUSINESS','CUSTOM')),
  period_label  varchar(32) NOT NULL,            -- e.g. "Oct 2026", "Q3 TY 2026-27"
  due_date      date NOT NULL,
  status        varchar(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETE','CANCELLED')),
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  UNIQUE (firm_id, entity_id, service, period_label),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id)
);

CREATE TABLE public.doc_checklist_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id),
  entity_id     uuid NOT NULL,
  checklist_id  uuid NOT NULL,
  position      smallint NOT NULL,
  label         varchar(160) NOT NULL,
  status        varchar(12) NOT NULL DEFAULT 'MISSING' CHECK (status IN ('MISSING','RECEIVED','ACCEPTED','REJECTED','NOT_NEEDED')),
  note          varchar(500),
  received_via  varchar(16) CHECK (received_via IN ('WHATSAPP','EMAIL','PAPER','PORTAL','OTHER')),
  updated_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, checklist_id) REFERENCES public.doc_checklists (firm_id, id) ON DELETE CASCADE
);
CREATE INDEX ix_doc_items_open ON public.doc_checklist_items (firm_id, status) WHERE status IN ('MISSING','REJECTED');

-- Reminders sent for a checklist (who, when, how), so the gap view can show the last chase.
CREATE TABLE public.doc_reminders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id),
  entity_id     uuid NOT NULL,
  checklist_id  uuid NOT NULL,
  channel       varchar(12) NOT NULL CHECK (channel IN ('WHATSAPP','EMAIL','SMS','CALL')),
  sent_by       uuid,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id),
  FOREIGN KEY (firm_id, entity_id) REFERENCES public.entities (firm_id, id),
  FOREIGN KEY (firm_id, checklist_id) REFERENCES public.doc_checklists (firm_id, id) ON DELETE CASCADE
);

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.doc_checklists      FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch BEFORE UPDATE ON public.doc_checklist_items FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_checklists      AFTER INSERT OR UPDATE OR DELETE ON public.doc_checklists      FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_checklist_items AFTER INSERT OR UPDATE OR DELETE ON public.doc_checklist_items FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();
CREATE TRIGGER trg_audit_doc_reminders   AFTER INSERT OR UPDATE OR DELETE ON public.doc_reminders       FOR EACH ROW EXECUTE FUNCTION app.capture_audit_event();

ALTER TABLE public.doc_checklists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_reminders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_checklists      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.doc_checklist_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.doc_reminders       FORCE ROW LEVEL SECURITY;

CREATE POLICY p_doc_checklists_tenant ON public.doc_checklists
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
CREATE POLICY p_doc_items_tenant ON public.doc_checklist_items
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));
CREATE POLICY p_doc_reminders_tenant ON public.doc_reminders
  FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND app.is_entity_visible(entity_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doc_checklists, public.doc_checklist_items, public.doc_reminders TO synextax_app;

RESET ROLE;
