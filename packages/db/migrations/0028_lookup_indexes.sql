-- =====================================================================
-- SynexTax | Migration 0028 | Indexes for lookups the API makes often
-- Foreign keys PostgreSQL does not index on its own (cascading deletes and
-- joins scan the table without them), and the audit log's newest-first read.
-- =====================================================================
SET ROLE synextax_owner;

-- Audit log screen: WHERE firm_id = ... ORDER BY timestamp_ist DESC
CREATE INDEX ix_audit_logs_firm_time ON audit.immutable_audit_logs (firm_id, timestamp_ist DESC, id DESC);
CREATE INDEX ix_signing_logs_firm_time ON audit.signing_audit_logs (firm_id, signed_at DESC);

-- Checklist items and reminders by checklist (cascade from doc_checklists, portal reads)
CREATE INDEX ix_doc_items_checklist ON public.doc_checklist_items (firm_id, checklist_id);
CREATE INDEX ix_doc_reminders_checklist ON public.doc_reminders (firm_id, checklist_id);

-- Deductee rows by section allocation and by TAN (register screens, statement building)
CREATE INDEX ix_deductees_allocation ON public.tds_deductees (firm_id, section_allocation_id);
CREATE INDEX ix_deductees_tan ON public.tds_deductees (firm_id, tan_registration_id);

RESET ROLE;
