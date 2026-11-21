-- =====================================================================
-- SynexTax | Migration 0018 | Which statement form a deductee row belongs to
-- A challan is per TAN and quarter, and under the 2025 Act one challan can
-- carry several sections, so a quarter's rows for Forms 138, 140, 144 and
-- 143 cannot be told apart by challan. Section codes do not settle it either:
-- Forms 140 and 144 share eleven codes. Each row now records its form.
-- Rows saved before this migration keep NULL and are placed by section code.
-- =====================================================================
SET ROLE synextax_owner;

ALTER TABLE public.tds_deductees
  ADD COLUMN form_code varchar(8) CHECK (form_code IN ('138', '140', '143', '144', '24Q', '26Q', '27Q', '27EQ'));

CREATE INDEX ix_deductees_form ON public.tds_deductees (firm_id, challan_id, form_code);

RESET ROLE;
