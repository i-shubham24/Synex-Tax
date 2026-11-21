-- =====================================================================
-- SynexTax | Migration 0015 | Details a TDS statement header needs
-- Protean's Form 140 batch header requires the deductor's and the
-- responsible person's address, PIN, state, email and phone. Addresses are
-- jsonb {line1, line2, line3, line4, district, state, pin}; the state is a
-- name and is mapped to Protean's own state code when the file is written.
-- =====================================================================
SET ROLE synextax_owner;

ALTER TABLE public.tan_registrations
  ADD COLUMN deductor_email       varchar(75),
  ADD COLUMN deductor_phone       varchar(10) CHECK (deductor_phone ~ '^[0-9]{10}$'),
  ADD COLUMN responsible_email    varchar(75),
  ADD COLUMN responsible_phone    varchar(10) CHECK (responsible_phone ~ '^[0-9]{10}$'),
  ADD COLUMN responsible_address  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN gstin                varchar(15) CHECK (gstin ~ '^[0-9]{2}[0-9A-Z]{13}$'),
  ADD COLUMN statement_file_seq   integer NOT NULL DEFAULT 0;

-- Payment mode of a challan: bank challan (C) or book adjustment (B).
ALTER TABLE public.tds_challans
  ADD COLUMN payment_mode char(1) NOT NULL DEFAULT 'C' CHECK (payment_mode IN ('C','B'));

RESET ROLE;
