-- =====================================================================
-- SynTax | Migration 0041 | Reconciliation statuses from the shared matcher
-- Target : PostgreSQL 17
--
-- The GST recon route now stores what the shared matcher decides
-- (workers/queue-worker/src/recon/reconciliationEngine.ts), which has two
-- statuses the old check did not allow:
--   PROBABLE_MATCH    same number and values, 2B dates it in another month
--   MISMATCH_DOCTYPE  same number, invoice in the books but a note in 2B
-- PURCHASE_NOT_IN_PR stays allowed for rows the old route wrote (it meant
-- "not in 2B"); new runs write VENDOR_NOT_IN_2B for those.
-- =====================================================================
SET ROLE synextax_owner;

DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.gst_invoices_purchase'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%recon_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.gst_invoices_purchase DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.gst_invoices_purchase
  ADD CONSTRAINT gst_invoices_purchase_recon_status_check
  CHECK (recon_status IN (
    'EXACT_MATCH', 'FUZZY_MATCH', 'PROBABLE_MATCH', 'MANUAL_MATCH',
    'MISMATCH_VALUE', 'MISMATCH_DOCTYPE', 'VENDOR_NOT_IN_2B',
    'PURCHASE_NOT_IN_PR', 'UNRECONCILED'
  ));

RESET ROLE;
