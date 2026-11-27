-- =====================================================================
-- SynTax | Migration 0043 | Late-Nov 2026 Statutory Upgrades:
--   1. Input Goods vs Input Services ITC Split & Post-Nov-1 Services
--   2. LUT Renewal & Nov 5, 2026 Cancellation Tracking on GSTINs
--   3. RCMDOM / RCMIMP Tagging on Purchase Register
-- Target   : PostgreSQL 17
-- =====================================================================
SET ROLE synextax_owner;

ALTER TABLE public.gst_invoices_purchase
  ADD COLUMN IF NOT EXISTS hsn_sac_code varchar(16),
  ADD COLUMN IF NOT EXISTS input_type varchar(20) NOT NULL DEFAULT 'INPUT_GOODS'
    CHECK (input_type IN ('INPUT_GOODS', 'INPUT_SERVICES', 'CAPITAL_GOODS')),
  ADD COLUMN IF NOT EXISTS is_post_nov_2026_service boolean
    GENERATED ALWAYS AS (input_type = 'INPUT_SERVICES' AND invoice_date >= DATE '2026-11-01') STORED,
  ADD COLUMN IF NOT EXISTS rcm_category varchar(16) NOT NULL DEFAULT 'NONE'
    CHECK (rcm_category IN ('NONE', 'RCMDOM', 'RCMIMP'));

CREATE INDEX IF NOT EXISTS ix_purchase_input_type
  ON public.gst_invoices_purchase (firm_id, gst_registration_id, return_period, input_type);

ALTER TABLE public.gst_registrations
  ADD COLUMN IF NOT EXISTS lut_arn varchar(32),
  ADD COLUMN IF NOT EXISTS lut_valid_from date,
  ADD COLUMN IF NOT EXISTS lut_valid_to date,
  ADD COLUMN IF NOT EXISTS cancellation_status varchar(32) NOT NULL DEFAULT 'NONE'
    CHECK (cancellation_status IN ('NONE', 'APPLIED', 'QUERY_RAISED', 'AUTO_APPROVED', 'APPROVED', 'REJECTED')),
  ADD COLUMN IF NOT EXISTS cancellation_arn varchar(32),
  ADD COLUMN IF NOT EXISTS cancellation_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_approval_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason varchar(200);

RESET ROLE;
