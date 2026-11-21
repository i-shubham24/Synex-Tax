-- =====================================================================
-- SynexTax | Migration 0022 | Which screens each team member can use
-- Client access is already per client (user_client_assignments and
-- is_entity_visible). This adds per-screen access: a list of modules on
-- each user. NULL means the defaults for the role; partners always have
-- every module. Only a partner can change it (p_users_write).
-- =====================================================================
SET ROLE synextax_owner;

ALTER TABLE public.users ADD COLUMN modules text[]
  CHECK (modules IS NULL OR modules <@ ARRAY['GST','TDS','PRACTICE','FEES','DOCUMENTS','AUDIT','CLIENTS']::text[]);

RESET ROLE;
