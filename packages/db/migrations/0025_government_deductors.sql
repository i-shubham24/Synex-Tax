-- =====================================================================
-- SynexTax | Migration 0025 | Government deductor details
-- Government deductors give their state (State Government bodies), their
-- ministry (Central Government bodies) and, when tax is paid by book
-- adjustment, the AIN of the PAO, Treasury Office or CDDO. These go in
-- fields 54, 57, 58 and 68 of the statement's batch header.
-- =====================================================================
SET ROLE synextax_owner;

ALTER TABLE public.tan_registrations
  ADD COLUMN govt_state_code char(2) CHECK (govt_state_code IS NULL OR govt_state_code ~ '^[0-9]{2}$'),
  ADD COLUMN ministry_code   char(2) CHECK (ministry_code IS NULL OR ministry_code ~ '^[0-9]{2}$'),
  ADD COLUMN ministry_other  varchar(150),
  -- ain already exists (migration 0003); now it is checked.
  ADD CONSTRAINT tan_registrations_ain_format CHECK (ain IS NULL OR ain ~ '^[A-Z0-9]{7}$');

RESET ROLE;
