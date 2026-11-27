"""Dirty Excel & Accounting Export Sanitizer.

Handles real-world messy exports from Tally, Busy, Marg, and custom Excel sheets:
  - Scans for header row (skips title blocks, firm headers, merged cells).
  - Tolerates variations in column names (e.g. 'Party GSTIN', 'Supplier Tin', 'Bill No', 'Vch Date').
  - Cleans Indian numbering format ('1,25,000.00'), currency symbols ('₹', 'INR'), and trailing spaces.
  - Normalizes mixed date formats ('04/10/2026', '4-Oct-26', '2026.10.04') to ISO YYYY-MM-DD.
  - Applies tax-engine validators (<50ms): GSTIN format & Mod-36 checksum, Rule 46 invoice constraints.
  - Classifies Section 17(5) blocked credits.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

import openpyxl
from recon_worker.parsing import (
    format_money,
    parse_amount,
    parse_date,
    quantize_money,
)
from recon_worker.recon import normalize_invoice_number
from recon_worker.validators import (
    classify_section_17_5,
    validate_gstin,
    validate_invoice_number_rule46,
)

COLUMN_SYNONYMS: dict[str, list[str]] = {
    "vendor_gstin": ["gstin", "gstin/uin", "party gstin", "supplier gstin", "supplier tin", "tin", "gst no", "party gst"],
    "vendor_name": ["party name", "supplier name", "party", "particulars", "vendor", "vendor name", "name of party"],
    "invoice_num": ["invoice no", "inv no", "invoice number", "bill no", "voucher no", "vch no", "doc no"],
    "invoice_date": ["invoice date", "inv date", "date", "bill date", "vch date", "voucher date"],
    "taxable_value": ["taxable value", "taxable amt", "taxable amount", "taxable", "assessable value", "net amount"],
    "igst_amount": ["igst", "igst amount", "integrated tax", "igst amt"],
    "cgst_amount": ["cgst", "cgst amount", "central tax", "cgst amt"],
    "sgst_amount": ["sgst", "sgst amount", "state tax", "sgst amt", "utgst"],
    "total_invoice_value": ["total invoice value", "total amount", "invoice value", "grand total", "total", "bill amount"],
    "hsn_code": ["hsn", "hsn/sac", "hsn code", "sac code", "sac"],
}


@dataclass
class SanitizedInvoice:
    row_index: int
    vendor_gstin: str
    vendor_name: str | None
    invoice_num: str
    invoice_date: str
    taxable_value: str
    igst_amount: str
    cgst_amount: str
    sgst_amount: str
    total_tax: str
    total_invoice_value: str
    normalized_invoice_key: str = ""
    doc_type: str = "INV"
    itc_eligibility: str = "ELIGIBLE"
    blocked_credit_clause: str | None = None
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


@dataclass
class SanitizeResult:
    total_rows_read: int
    valid_rows_count: int
    error_rows_count: int
    invoices: list[SanitizedInvoice]
    detected_headers: dict[str, str]


def _match_column(col_name: str) -> str | None:
    norm = col_name.strip().lower()
    for canonical, synonyms in COLUMN_SYNONYMS.items():
        if norm == canonical or any(syn in norm for syn in synonyms):
            return canonical
    return None


def sanitize_purchase_register_bytes(file_bytes: bytes, filename: str) -> SanitizeResult:
    """Parses Excel bytes (.xlsx/.xls) into sanitized, validated purchase invoice records."""
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return SanitizeResult(total_rows_read=0, valid_rows_count=0, error_rows_count=0, invoices=[], detected_headers={})

    # Scan first 20 rows to locate header row
    header_row_idx = -1
    col_map: dict[int, str] = {}
    detected_headers: dict[str, str] = {}

    for r_idx, r in enumerate(rows[:20]):
        matches = {}
        for c_idx, cell in enumerate(r):
            if cell is not None and isinstance(cell, str):
                matched = _match_column(cell)
                if matched:
                    matches[c_idx] = matched
        # Header row usually has at least 3 recognizable tax columns (e.g. gstin, invoice no, taxable/amount)
        if len(matches) >= 3:
            header_row_idx = r_idx
            col_map = matches
            for c_idx, canonical in matches.items():
                detected_headers[canonical] = str(r[c_idx])
            break

    if header_row_idx < 0:
        # Fallback: assume row 0
        header_row_idx = 0
        for c_idx, cell in enumerate(rows[0]):
            if cell:
                matched = _match_column(str(cell))
                if matched:
                    col_map[c_idx] = matched
                    detected_headers[matched] = str(cell)

    invoices: list[SanitizedInvoice] = []
    error_count = 0

    for r_idx, r in enumerate(rows[header_row_idx + 1 :], start=header_row_idx + 2):
        # Skip completely empty rows
        if not any(r):
            continue

        row_dict: dict[str, Any] = {}
        for c_idx, canonical in col_map.items():
            if c_idx < len(r):
                row_dict[canonical] = r[c_idx]

        raw_gstin = str(row_dict.get("vendor_gstin") or "").strip().upper()
        raw_inv = str(row_dict.get("invoice_num") or "").strip()
        raw_date = row_dict.get("invoice_date")
        raw_taxable = row_dict.get("taxable_value")
        raw_igst = row_dict.get("igst_amount")
        raw_cgst = row_dict.get("cgst_amount")
        raw_sgst = row_dict.get("sgst_amount")
        raw_name = row_dict.get("vendor_name")
        raw_hsn = str(row_dict.get("hsn_code") or "").strip()

        # If neither GSTIN nor invoice number exists, it is likely a footer or subtotal row
        if not raw_gstin and not raw_inv:
            continue

        warnings: list[str] = []
        errors: list[str] = []

        # 1. GSTIN parsing & validation
        clean_gstin = re.sub(r"[^A-Z0-9]", "", raw_gstin)
        if clean_gstin != raw_gstin and raw_gstin:
            warnings.append(f"Cleaned special characters from GSTIN: {raw_gstin} -> {clean_gstin}")
        gstin_val = validate_gstin(clean_gstin)
        if not gstin_val.is_valid:
            errors.append(f"Invalid GSTIN: {gstin_val.error}")

        # 2. Invoice Number parsing & validation
        clean_inv = raw_inv.strip()
        rule46_val = validate_invoice_number_rule46(clean_inv)
        if not rule46_val.is_valid:
            errors.append(f"Invoice Number Rule 46 error: {rule46_val.error}")

        # 3. Date parsing
        date_parse = parse_date(raw_date)
        clean_date = date_parse.value.isoformat() if isinstance(date_parse.value, (date,)) else "2026-10-01"
        if date_parse.changed and date_parse.note:
            warnings.append(f"Standardized date: {date_parse.note}")
        if date_parse.error:
            errors.append(f"Date error: {date_parse.error}")

        # 4. Money parsing
        taxable_p = parse_amount(raw_taxable)
        igst_p = parse_amount(raw_igst)
        cgst_p = parse_amount(raw_cgst)
        sgst_p = parse_amount(raw_sgst)

        taxable_dec = taxable_p.value if isinstance(taxable_p.value, Decimal) else Decimal("0.00")
        igst_dec = igst_p.value if isinstance(igst_p.value, Decimal) else Decimal("0.00")
        cgst_dec = cgst_p.value if isinstance(cgst_p.value, Decimal) else Decimal("0.00")
        sgst_dec = sgst_p.value if isinstance(sgst_p.value, Decimal) else Decimal("0.00")

        total_tax_dec = igst_dec + cgst_dec + sgst_dec
        total_inv_dec = taxable_dec + total_tax_dec

        # 5. Section 17(5) blocked credit tagger
        blocked = classify_section_17_5(hsn_or_sac=raw_hsn, description=str(raw_name or ""))
        itc_eligibility = "INELIGIBLE_17_5" if blocked.is_blocked else "ELIGIBLE"
        blocked_clause = blocked.clause if blocked.is_blocked else None
        if blocked.is_blocked:
            warnings.append(f"Section 17(5) Blocked Credit: {blocked.description} ({blocked.clause})")

        if errors:
            error_count += 1

        inv = SanitizedInvoice(
            row_index=r_idx,
            vendor_gstin=clean_gstin,
            vendor_name=raw_name.strip() if isinstance(raw_name, str) else None,
            invoice_num=clean_inv,
            normalized_invoice_key=normalize_invoice_number(clean_inv),
            invoice_date=clean_date,
            taxable_value=format_money(taxable_dec) or "0.00",
            igst_amount=format_money(igst_dec) or "0.00",
            cgst_amount=format_money(cgst_dec) or "0.00",
            sgst_amount=format_money(sgst_dec) or "0.00",
            total_tax=format_money(total_tax_dec) or "0.00",
            total_invoice_value=format_money(total_inv_dec) or "0.00",
            doc_type="INV",
            itc_eligibility=itc_eligibility,
            blocked_credit_clause=blocked_clause,
            warnings=warnings,
            errors=errors,
        )
        invoices.append(inv)

    return SanitizeResult(
        total_rows_read=len(invoices),
        valid_rows_count=len(invoices) - error_count,
        error_rows_count=error_count,
        invoices=invoices,
        detected_headers=detected_headers,
    )
