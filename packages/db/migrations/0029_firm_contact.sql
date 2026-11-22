-- =====================================================================
-- SynexTax | Migration 0029 | Firm contact details
-- The office phone and address a partner keeps in Settings; printed on fee
-- invoices and reminders later. Partners edit them under the existing
-- p_firm_write policy.
-- =====================================================================
SET ROLE synextax_owner;

ALTER TABLE public.firms
  ADD COLUMN contact_phone varchar(16) CHECK (contact_phone IS NULL OR contact_phone ~ '^\+91[6-9][0-9]{9}$|^0[1-9][0-9]{6,10}$'),
  ADD COLUMN address_line  varchar(200),
  ADD COLUMN address_city  varchar(80),
  ADD COLUMN address_pin   char(6) CHECK (address_pin IS NULL OR address_pin ~ '^[1-9][0-9]{5}$');

RESET ROLE;
