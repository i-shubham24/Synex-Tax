/* =====================================================================
 * SynexTax | Migration 0036 | Client logins see only the client portal
 * A CLIENT user reaches the database only through the client portal. Every
 * table with row-level security gets a restrictive policy that refuses the
 * CLIENT role, except the tables the portal itself reads or writes (whose
 * own policies, from 0033, limit a client to its own entities). Restrictive
 * policies combine with AND, so this only ever removes access.
 * ===================================================================== */
SET ROLE synextax_owner;

DO $$
DECLARE
  t record;
  portal_tables text[] := ARRAY[
    'public.firms', 'public.users', 'public.user_client_assignments', 'public.client_groups', 'public.entities',
    'public.doc_checklists', 'public.doc_checklist_items', 'public.doc_files', 'public.doc_folders',
    'public.client_documents', 'public.client_document_versions', 'public.client_document_opens',
    'public.client_conversations', 'public.client_messages', 'public.client_message_attachments',
    'public.gst_filings', 'public.tds_returns', 'public.fee_invoices', 'public.fee_receipts',
    'public.gst_registrations', 'public.tan_registrations'
  ];
BEGIN
  FOR t IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND c.relrowsecurity AND n.nspname IN ('public', 'audit')
  LOOP
    CONTINUE WHEN (t.schema_name || '.' || t.table_name) = ANY (portal_tables);
    EXECUTE format(
      'CREATE POLICY p_no_client_login ON %I.%I AS RESTRICTIVE FOR ALL TO synextax_app
         USING ((SELECT app.current_user_role()) IS DISTINCT FROM ''CLIENT'')
         WITH CHECK ((SELECT app.current_user_role()) IS DISTINCT FROM ''CLIENT'')',
      t.schema_name, t.table_name);
  END LOOP;
END;
$$;

RESET ROLE;
