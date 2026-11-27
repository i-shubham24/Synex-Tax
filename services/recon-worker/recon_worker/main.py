from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from recon_worker.recon import (
    GstReconciliationEngine,
    Gstr2BInvoice,
    PurchaseInvoice,
    ReconMatchPair,
    ReconSummary,
)
from recon_worker.sanitizer import sanitize_purchase_register_bytes

app = FastAPI(
    title="SynexTax Recon Worker",
    description="Python 3.12 + FastAPI + Polars service for dirty Excel sanitization and 4-pass GSTR-2B reconciliation.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "HEALTHY", "service": "synextax-recon-worker", "version": "0.1.0"}


class PurchaseInvoiceInput(BaseModel):
    id: str
    vendor_gstin: str
    vendor_name: str | None = None
    invoice_num: str
    invoice_date: str
    doc_type: str = "INV"
    taxable_value: str
    igst_amount: str = "0.00"
    cgst_amount: str = "0.00"
    sgst_amount: str = "0.00"
    total_tax: str = "0.00"
    itc_eligibility: str = "ELIGIBLE"


class Gstr2BRecordInput(BaseModel):
    id: str
    supplier_gstin: str
    supplier_name: str | None = None
    doc_num: str
    doc_date: str
    doc_type: str = "INV"
    taxable_value: str
    igst_amount: str = "0.00"
    cgst_amount: str = "0.00"
    sgst_amount: str = "0.00"
    total_tax: str = "0.00"
    itc_available: bool = True
    gstr1_filing_date: str | None = None
    ims_action_status: str = "NONE"
    is_amended_post_acceptance: bool = False


class ReconRequest(BaseModel):
    tolerance_rupees: str = "5.00"
    tolerance_days: int = 2
    purchase_invoices: list[PurchaseInvoiceInput]
    portal_2b_records: list[Gstr2BRecordInput]


@app.post("/api/v1/recon")
def run_reconciliation(req: ReconRequest) -> dict[str, Any]:
    engine = GstReconciliationEngine(
        tolerance_rupees=Decimal(req.tolerance_rupees),
        tolerance_days=req.tolerance_days,
    )

    pr_list = [
        PurchaseInvoice(
            id=p.id,
            vendor_gstin=p.vendor_gstin,
            vendor_name=p.vendor_name,
            invoice_num=p.invoice_num,
            invoice_date=p.invoice_date,
            doc_type=p.doc_type,
            taxable_value=Decimal(p.taxable_value),
            igst_amount=Decimal(p.igst_amount),
            cgst_amount=Decimal(p.cgst_amount),
            sgst_amount=Decimal(p.sgst_amount),
            total_tax=Decimal(p.total_tax),
            itc_eligibility=p.itc_eligibility,
        )
        for p in req.purchase_invoices
    ]

    r2b_list = [
        Gstr2BInvoice(
            id=r.id,
            supplier_gstin=r.supplier_gstin,
            supplier_name=r.supplier_name,
            doc_num=r.doc_num,
            doc_date=r.doc_date,
            doc_type=r.doc_type,
            taxable_value=Decimal(r.taxable_value),
            igst_amount=Decimal(r.igst_amount),
            cgst_amount=Decimal(r.cgst_amount),
            sgst_amount=Decimal(r.sgst_amount),
            total_tax=Decimal(r.total_tax),
            itc_available=r.itc_available,
            gstr1_filing_date=r.gstr1_filing_date,
            ims_action_status=r.ims_action_status,
            is_amended_post_acceptance=r.is_amended_post_acceptance,
        )
        for r in req.portal_2b_records
    ]

    pairs, summary = engine.reconcile(pr_list, r2b_list)

    return {
        "summary": {
            "total_purchase_count": summary.total_purchase_count,
            "total_2b_count": summary.total_2b_count,
            "exact_matches_count": summary.exact_matches_count,
            "fuzzy_matches_count": summary.fuzzy_matches_count,
            "probable_matches_count": summary.probable_matches_count,
            "value_mismatches_count": summary.value_mismatches_count,
            "purchase_not_in_2b_count": summary.purchase_not_in_2b_count,
            "vendor_not_in_pr_count": summary.vendor_not_in_pr_count,
            "total_itc_claimed_pr": str(summary.total_itc_claimed_pr),
            "total_itc_available_2b": str(summary.total_itc_available_2b),
            "total_itc_at_risk": str(summary.total_itc_at_risk),
            "ims_pending_actions_count": summary.ims_pending_actions_count,
            "impg_count": summary.impg_count,
            "isd_count": summary.isd_count,
            "total_impg_itc": str(summary.total_impg_itc),
            "total_isd_itc": str(summary.total_isd_itc),
        },
        "pairs": [
            {
                "status": p.status,
                "confidence_score": p.confidence_score,
                "normalized_invoice_key": p.normalized_invoice_key,
                "purchase_invoice": {
                    "id": p.purchase_invoice.id,
                    "vendor_gstin": p.purchase_invoice.vendor_gstin,
                    "invoice_num": p.purchase_invoice.invoice_num,
                    "normalized_invoice_key": p.purchase_invoice.normalized_invoice_key,
                    "invoice_date": p.purchase_invoice.invoice_date,
                    "total_tax": str(p.purchase_invoice.total_tax),
                }
                if p.purchase_invoice
                else None,
                "portal_2b_record": {
                    "id": p.portal_2b_record.id,
                    "supplier_gstin": p.portal_2b_record.supplier_gstin,
                    "doc_num": p.portal_2b_record.doc_num,
                    "normalized_invoice_key": p.portal_2b_record.normalized_invoice_key,
                    "doc_date": p.portal_2b_record.doc_date,
                    "total_tax": str(p.portal_2b_record.total_tax),
                    "ims_action_status": p.portal_2b_record.ims_action_status,
                }
                if p.portal_2b_record
                else None,
                "difference_taxable": str(p.difference_taxable),
                "difference_tax": str(p.difference_tax),
                "is_amended_post_acceptance": p.is_amended_post_acceptance,
            }
            for p in pairs
        ],
    }


@app.post("/api/v1/sanitize")
async def sanitize_upload(file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    result = sanitize_purchase_register_bytes(content, file.filename or "upload.xlsx")

    return {
        "filename": file.filename,
        "total_rows_read": result.total_rows_read,
        "valid_rows_count": result.valid_rows_count,
        "error_rows_count": result.error_rows_count,
        "detected_headers": result.detected_headers,
        "invoices": [
            {
                "row_index": inv.row_index,
                "vendor_gstin": inv.vendor_gstin,
                "vendor_name": inv.vendor_name,
                "invoice_num": inv.invoice_num,
                "invoice_date": inv.invoice_date,
                "taxable_value": inv.taxable_value,
                "igst_amount": inv.igst_amount,
                "cgst_amount": inv.cgst_amount,
                "sgst_amount": inv.sgst_amount,
                "total_tax": inv.total_tax,
                "total_invoice_value": inv.total_invoice_value,
                "itc_eligibility": inv.itc_eligibility,
                "blocked_credit_clause": inv.blocked_credit_clause,
                "warnings": inv.warnings,
                "errors": inv.errors,
            }
            for inv in result.invoices
        ],
    }
