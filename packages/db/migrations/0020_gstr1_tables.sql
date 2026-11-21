-- =====================================================================
-- SynexTax | Migration 0020 | GSTR-1 tables 5 and 6A on sales invoices
-- Sales to unregistered buyers across states above Rs 1,00,000 go to
-- table 5 (B2CL) and exports to table 6A. The original check allowed
-- neither, so an imported sales register could not record them.
-- =====================================================================
SET ROLE synextax_owner;

ALTER TABLE public.gst_invoices_sales DROP CONSTRAINT gst_invoices_sales_table_section_check;
ALTER TABLE public.gst_invoices_sales ADD CONSTRAINT gst_invoices_sales_table_section_check
  CHECK (table_section IN ('4A','4B','5','6A','6B','6C','7','8','9B','11A','11B','12'));

-- One sales register import is one batch; the screen shows which batch a row came from.
ALTER TABLE public.gst_invoices_sales ADD COLUMN import_batch uuid;

RESET ROLE;
