-- =====================================================================
-- SynexTax | Migration 0017 | Deductee and collectee fields for Forms 144 and 143
-- Form 144 (non-residents) and Form 143 (TCS) records carry fields that
-- Form 140 does not: status or collectee code, regime opt-out, nature of
-- remittance, country, grossing up, Act or DTAA rate, Form 15CA reference,
-- details in the country of residence, residency and permanent establishment.
-- =====================================================================
SET ROLE synextax_owner;

ALTER TABLE public.tds_deductees
  ADD COLUMN payee_status_code       varchar(2) CHECK (payee_status_code ~ '^([1-9]|10)$'),
  ADD COLUMN opting_out_202          boolean NOT NULL DEFAULT false,
  ADD COLUMN remittance_nature       varchar(2) CHECK (remittance_nature ~ '^[0-9]{2}$'),
  ADD COLUMN country_code            varchar(3) CHECK (country_code ~ '^[0-9]{2,3}$'),
  ADD COLUMN grossed_up              boolean NOT NULL DEFAULT false,
  ADD COLUMN rate_basis              char(1) CHECK (rate_basis IN ('A','B')),
  ADD COLUMN form15ca_ack            varchar(26),
  ADD COLUMN form121_uin             varchar(26),
  ADD COLUMN residence_address       varchar(150),
  ADD COLUMN residence_email         varchar(75),
  ADD COLUMN residence_contact       varchar(15),
  ADD COLUMN residence_tax_id        varchar(25),
  ADD COLUMN non_resident            boolean NOT NULL DEFAULT false,
  ADD COLUMN permanent_establishment boolean;

RESET ROLE;
