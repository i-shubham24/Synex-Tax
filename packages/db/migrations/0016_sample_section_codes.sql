-- =====================================================================
-- SynexTax | Migration 0016 | Official Form 140 section codes in early trial data
-- Trial workspaces created before 20 Nov 2026 were seeded with placeholder
-- section labels ("393(1)-194C" and similar). Protean's Form 140 file format
-- uses four-digit codes (Annexure 2), so those rows are converted:
--   194J -> 1027 (professional fees), 194I -> 1009 (rent),
--   194C -> 1023 for individuals and HUFs, 1024 for everyone else.
-- Runs as the migration superuser because the rows belong to many firms.
-- Matches nothing in a database that never had the placeholders.
-- =====================================================================

UPDATE public.tds_challan_section_allocations SET section_code = '1027' WHERE section_code = '393(1)-194J';
UPDATE public.tds_challan_section_allocations SET section_code = '1009' WHERE section_code = '393(1)-194I';

-- Contractors who are not individuals or HUFs move to a 1024 allocation on the same challan.
INSERT INTO public.tds_challan_section_allocations (firm_id, entity_id, challan_id, section_code, income_tax, total_section_amount)
SELECT a.firm_id, a.entity_id, a.challan_id, '1024', sum(d.total_tds_deposited), sum(d.total_tds_deposited)
FROM public.tds_challan_section_allocations a
JOIN public.tds_deductees d ON d.section_allocation_id = a.id
WHERE a.section_code = '393(1)-194C'
  AND d.deductee_pan NOT IN ('PANNOTAVBL', 'PANAPPLIED', 'PANINVALID')
  AND substr(d.deductee_pan, 4, 1) NOT IN ('P', 'H')
GROUP BY a.firm_id, a.entity_id, a.challan_id;

UPDATE public.tds_deductees d
SET section_allocation_id = n.id
FROM public.tds_challan_section_allocations a, public.tds_challan_section_allocations n
WHERE d.section_allocation_id = a.id
  AND a.section_code = '393(1)-194C'
  AND n.challan_id = a.challan_id
  AND n.firm_id = a.firm_id
  AND n.section_code = '1024'
  AND d.deductee_pan NOT IN ('PANNOTAVBL', 'PANAPPLIED', 'PANINVALID')
  AND substr(d.deductee_pan, 4, 1) NOT IN ('P', 'H');

UPDATE public.tds_challan_section_allocations a
SET section_code = '1023',
    income_tax = (SELECT COALESCE(sum(total_tds_deposited), 0) FROM public.tds_deductees WHERE section_allocation_id = a.id),
    total_section_amount = (SELECT COALESCE(sum(total_tds_deposited), 0) FROM public.tds_deductees WHERE section_allocation_id = a.id)
WHERE a.section_code = '393(1)-194C';
