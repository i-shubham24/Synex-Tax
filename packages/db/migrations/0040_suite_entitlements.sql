-- =====================================================================
-- SynTax | Migration 0040 | Modular product suite entitlements
-- Target : PostgreSQL 17
--
-- Adds enabled_suites to firms. A firm in its trial may use every suite;
-- after that enabled_suites decides (apps/api/src/security/modules.ts).
-- The default includes DIRECT (Income tax) because those screens are
-- built and existing firms already use them.
-- (Was 0011_suite_entitlements.sql, a second 0011. Every statement here
-- is safe to run again on a database that already applied that file.)
-- =====================================================================
SET ROLE synextax_owner;

ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS enabled_suites text[] NOT NULL DEFAULT ARRAY['GST','TDS','SIGN','DESK','DIRECT']
  CHECK (enabled_suites <@ ARRAY['GST','TDS','SIGN','DESK','DIRECT','LITIGATE']::text[]);

ALTER TABLE public.firms
  ALTER COLUMN enabled_suites SET DEFAULT ARRAY['GST','TDS','SIGN','DESK','DIRECT'];

-- Firms created under the old default keep the Income tax screens they had.
UPDATE public.firms
   SET enabled_suites = enabled_suites || ARRAY['DIRECT']
 WHERE enabled_suites = ARRAY['GST','TDS','SIGN','DESK'];

RESET ROLE;
