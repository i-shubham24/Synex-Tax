from decimal import Decimal
from recon_worker.recon import (
    GstReconciliationEngine,
    Gstr2BInvoice,
    PurchaseInvoice,
    normalize_invoice_number,
)


def test_normalize_invoice_number():
    assert normalize_invoice_number("SALES/25-26/0412") == "SALES2526412"
    assert normalize_invoice_number("INV-2025-26-0099") == "INV252699"
    assert normalize_invoice_number("000123") == "123"
    assert normalize_invoice_number("SS 2210") == "SS2210"
    assert normalize_invoice_number("LDW/0117") == "LDW117"
    assert normalize_invoice_number("LDW/26-27/117") == "LDW2627117"


def test_4_pass_reconciliation():
    engine = GstReconciliationEngine()

    pr = [
        # 1. Exact match candidate
        PurchaseInvoice(
            id="pr-1",
            vendor_gstin="03AABFM5521R1Z8",
            vendor_name="Majha Yarn Traders",
            invoice_num="MYT/26-27/0412",
            invoice_date="2026-10-04",
            doc_type="INV",
            taxable_value=Decimal("240000.00"),
            igst_amount=Decimal("0.00"),
            cgst_amount=Decimal("6000.00"),
            sgst_amount=Decimal("6000.00"),
            total_tax=Decimal("12000.00"),
        ),
        # 2. Normalized invoice candidate (different leading zeros / delimiters)
        PurchaseInvoice(
            id="pr-2",
            vendor_gstin="03AADCL7713H1Z4",
            vendor_name="Ludhiana Dye Works",
            invoice_num="LDW/0117",
            invoice_date="2026-10-09",
            doc_type="INV",
            taxable_value=Decimal("85000.00"),
            igst_amount=Decimal("0.00"),
            cgst_amount=Decimal("7650.00"),
            sgst_amount=Decimal("7650.00"),
            total_tax=Decimal("15300.00"),
        ),
        # 3. Value mismatch candidate (taxable differs by ₹1,500)
        PurchaseInvoice(
            id="pr-3",
            vendor_gstin="24AAGCS9012P1ZO",
            vendor_name="Surat Synthetics",
            invoice_num="SS-2210",
            invoice_date="2026-10-12",
            doc_type="INV",
            taxable_value=Decimal("120000.00"),
            igst_amount=Decimal("6000.00"),
            cgst_amount=Decimal("0.00"),
            sgst_amount=Decimal("0.00"),
            total_tax=Decimal("6000.00"),
        ),
        # 4. In books but not in 2B
        PurchaseInvoice(
            id="pr-4",
            vendor_gstin="03AAHFJ3310M1Z2",
            vendor_name="Jalandhar Packaging",
            invoice_num="JP/889",
            invoice_date="2026-10-20",
            doc_type="INV",
            taxable_value=Decimal("32000.00"),
            igst_amount=Decimal("0.00"),
            cgst_amount=Decimal("2880.00"),
            sgst_amount=Decimal("2880.00"),
            total_tax=Decimal("5760.00"),
        ),
    ]

    r2b = [
        # Exact match
        Gstr2BInvoice(
            id="2b-1",
            supplier_gstin="03AABFM5521R1Z8",
            supplier_name="Majha Yarn Traders",
            doc_num="MYT/26-27/0412",
            doc_date="2026-10-04",
            doc_type="INV",
            taxable_value=Decimal("240000.00"),
            igst_amount=Decimal("0.00"),
            cgst_amount=Decimal("6000.00"),
            sgst_amount=Decimal("6000.00"),
            total_tax=Decimal("12000.00"),
            ims_action_status="A",
        ),
        # Normalized invoice match (LDW/117 matches LDW/0117)
        Gstr2BInvoice(
            id="2b-2",
            supplier_gstin="03AADCL7713H1Z4",
            supplier_name="Ludhiana Dye Works",
            doc_num="LDW-117",
            doc_date="2026-10-09",
            doc_type="INV",
            taxable_value=Decimal("85000.00"),
            igst_amount=Decimal("0.00"),
            cgst_amount=Decimal("7650.00"),
            sgst_amount=Decimal("7650.00"),
            total_tax=Decimal("15300.00"),
            ims_action_status="NONE",
        ),
        # Value mismatch (SS-2210)
        Gstr2BInvoice(
            id="2b-3",
            supplier_gstin="24AAGCS9012P1ZO",
            supplier_name="Surat Synthetics",
            doc_num="SS-2210",
            doc_date="2026-10-12",
            doc_type="INV",
            taxable_value=Decimal("118500.00"),
            igst_amount=Decimal("5925.00"),
            cgst_amount=Decimal("0.00"),
            sgst_amount=Decimal("0.00"),
            total_tax=Decimal("5925.00"),
            ims_action_status="NONE",
        ),
        # In 2B but not in books
        Gstr2BInvoice(
            id="2b-4",
            supplier_gstin="03AABFM5521R1Z8",
            supplier_name="Majha Yarn Traders",
            doc_num="MYT/26-27/0431",
            doc_date="2026-10-27",
            doc_type="INV",
            taxable_value=Decimal("60000.00"),
            igst_amount=Decimal("0.00"),
            cgst_amount=Decimal("1500.00"),
            sgst_amount=Decimal("1500.00"),
            total_tax=Decimal("3000.00"),
            ims_action_status="P",
        ),
    ]

    pairs, summary = engine.reconcile(pr, r2b)

    assert summary.total_purchase_count == 4
    assert summary.total_2b_count == 4
    assert summary.exact_matches_count == 1
    assert summary.fuzzy_matches_count == 1
    assert summary.value_mismatches_count == 1
    assert summary.purchase_not_in_2b_count == 1
    assert summary.vendor_not_in_pr_count == 1
    assert summary.ims_pending_actions_count == 1
    assert summary.total_itc_at_risk == Decimal("5760.00")
