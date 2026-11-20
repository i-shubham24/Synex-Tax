-- =====================================================================
-- SynexTax | Migration 0013 | Importing statements filed elsewhere
-- * tds_returns.source tells statements prepared in SynexTax apart from ones
--   imported from an e-TDS text file (filed outside, kept as CLOSED history).
-- * Form 140 (2025 Act) uses its own reason codes for lower or no deduction;
--   the 1961-era list no longer applies, so the code is kept as data and
--   validated by Protean's FVU.
-- =====================================================================
SET ROLE synextax_owner;

ALTER TABLE public.tds_returns
  ADD COLUMN source varchar(16) NOT NULL DEFAULT 'SYNEXTAX' CHECK (source IN ('SYNEXTAX','IMPORTED'));

ALTER TABLE public.tds_deductees DROP CONSTRAINT tds_deductees_reason_for_non_deduction_check;
ALTER TABLE public.tds_deductees
  ADD CONSTRAINT tds_deductees_reason_for_non_deduction_check CHECK (reason_for_non_deduction ~ '^[A-Z0-9]{1,8}$');

RESET ROLE;
