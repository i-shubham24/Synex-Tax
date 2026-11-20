"""4-Pass GSTR-2B Fuzzy Reconciliation Engine.

Implements the deterministic statutory 4-pass matching algorithm:
  Pass 1: Exact Match (same GSTIN, exact invoice number, exact date, exact tax amounts).
  Pass 2: Fuzzy Match (normalized invoice number matches, amounts within ₹1 Section 170 rounding tolerance).
  Pass 3: Value Mismatch (normalized invoice number matches, but taxable or tax amounts differ).
  Pass 4: Probable Match (Levenshtein similarity >= 0.85 on invoice number for same GSTIN).

All money calculations use decimal.Decimal; never float.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from recon_worker.parsing import PAISE, ZERO, quantize_money


@dataclass
class PurchaseInvoice:
    id: str
    vendor_gstin: str
    vendor_name: str | None
    invoice_num: str
    invoice_date: str  # YYYY-MM-DD
    doc_type: str  # INV, CRN, DBN
    taxable_value: Decimal
    igst_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    total_tax: Decimal
    itc_eligibility: str = "ELIGIBLE"  # ELIGIBLE, INELIGIBLE_17_5, INELIGIBLE_OTHER


@dataclass
class Gstr2BInvoice:
    id: str
    supplier_gstin: str
    supplier_name: str | None
    doc_num: str
    doc_date: str  # YYYY-MM-DD
    doc_type: str  # INV, CRN, DBN
    taxable_value: Decimal
    igst_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    total_tax: Decimal
    itc_available: bool = True
    gstr1_filing_date: str | None = None
    ims_action_status: str = "NONE"  # A, R, P, NONE
    is_amended_post_acceptance: bool = False
    original_invoice_ref: str | None = None
    original_taxable_value: Decimal | None = None
    original_total_tax: Decimal | None = None


@dataclass
class ReconMatchPair:
    status: str  # EXACT_MATCH, FUZZY_MATCH, PROBABLE_MATCH, MISMATCH_VALUE, PURCHASE_NOT_IN_2B, VENDOR_NOT_IN_PR
    confidence_score: float
    purchase_invoice: PurchaseInvoice | None = None
    portal_2b_record: Gstr2BInvoice | None = None
    difference_taxable: Decimal = ZERO
    difference_tax: Decimal = ZERO
    is_amended_post_acceptance: bool = False
    amendment_delta: dict[str, str] | None = None


@dataclass
class ReconSummary:
    total_purchase_count: int
    total_2b_count: int
    exact_matches_count: int
    fuzzy_matches_count: int
    probable_matches_count: int
    value_mismatches_count: int
    purchase_not_in_2b_count: int
    vendor_not_in_pr_count: int
    total_itc_claimed_pr: Decimal
    total_itc_available_2b: Decimal
    total_itc_at_risk: Decimal
    ims_pending_actions_count: int


def normalize_fy_tokens(input_str: str) -> str:
    s = re.sub(r"\b20(2[4-9])-?(2[5-9])\b", r"\1\2", input_str)
    s = re.sub(r"\b(2[4-9])-?(2[5-9])\b", r"\1\2", s)
    return s


def normalize_invoice_number(raw_num: str) -> str:
    if not raw_num:
        return ""
    normalized = normalize_fy_tokens(raw_num.strip().upper())
    segments = [seg for seg in re.split(r"[^A-Z0-9]+", normalized) if seg]
    clean_segments = []
    for seg in segments:
        if re.match(r"^2[4-9]2[5-9]$", seg):
            clean_segments.append(seg)
        elif re.match(r"^0+[0-9]+$", seg):
            clean_segments.append(seg.lstrip("0") or "0")
        else:
            clean_segments.append(re.sub(r"([A-Z])0+([1-9][0-9]*)", r"\1\2", seg))
    return "".join(clean_segments)


def parse_iso_date(d_str: str) -> date:
    try:
        return datetime.strptime(d_str.strip(), "%Y-%m-%d").date()
    except Exception:
        return date(2000, 1, 1)


def levenshtein_ratio(s1: str, s2: str) -> float:
    if s1 == s2:
        return 1.0
    if not s1 or not s2:
        return 0.0
    m, n = len(s1), len(s2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if s1[i - 1] == s2[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    distance = dp[m][n]
    max_len = max(m, n)
    return 1.0 - (distance / max_len)


class GstReconciliationEngine:
    def __init__(self, tolerance_rupees: Decimal = Decimal("5.00"), tolerance_days: int = 2):
        self.tolerance_rupees = tolerance_rupees
        self.tolerance_days = tolerance_days

    def reconcile(
        self,
        purchase_invoices: list[PurchaseInvoice],
        portal_2b_records: list[Gstr2BInvoice],
    ) -> tuple[list[ReconMatchPair], ReconSummary]:
        pairs: list[ReconMatchPair] = []
        unmatched_pr = list(purchase_invoices)
        unmatched_2b = list(portal_2b_records)

        # -------------------------------------------------------------
        # PASS 1: Exact Match (GSTIN + Invoice Num + Date + Tax)
        # -------------------------------------------------------------
        pr_remaining_p1: list[PurchaseInvoice] = []
        for pr in unmatched_pr:
            matched_idx = -1
            for idx, r2b in enumerate(unmatched_2b):
                if (
                    pr.vendor_gstin.upper() == r2b.supplier_gstin.upper()
                    and pr.invoice_num.strip().upper() == r2b.doc_num.strip().upper()
                    and pr.invoice_date == r2b.doc_date
                    and abs(pr.taxable_value - r2b.taxable_value) <= PAISE
                    and abs(pr.total_tax - r2b.total_tax) <= PAISE
                ):
                    matched_idx = idx
                    break

            if matched_idx >= 0:
                r2b = unmatched_2b.pop(matched_idx)
                pairs.append(
                    ReconMatchPair(
                        status="EXACT_MATCH",
                        confidence_score=1.0,
                        purchase_invoice=pr,
                        portal_2b_record=r2b,
                        difference_taxable=pr.taxable_value - r2b.taxable_value,
                        difference_tax=pr.total_tax - r2b.total_tax,
                        is_amended_post_acceptance=r2b.is_amended_post_acceptance,
                    )
                )
            else:
                pr_remaining_p1.append(pr)

        # -------------------------------------------------------------
        # PASS 2: Fuzzy Normalized Invoice Match (Rounding <= Rs 1.00)
        # -------------------------------------------------------------
        pr_remaining_p2: list[PurchaseInvoice] = []
        for pr in pr_remaining_p1:
            norm_pr = normalize_invoice_number(pr.invoice_num)
            matched_idx = -1
            for idx, r2b in enumerate(unmatched_2b):
                norm_2b = normalize_invoice_number(r2b.doc_num)
                if (
                    pr.vendor_gstin.upper() == r2b.supplier_gstin.upper()
                    and norm_pr == norm_2b
                    and norm_pr != ""
                    and abs(pr.total_tax - r2b.total_tax) <= Decimal("1.00")
                    and abs(pr.taxable_value - r2b.taxable_value) <= Decimal("1.00")
                ):
                    matched_idx = idx
                    break

            if matched_idx >= 0:
                r2b = unmatched_2b.pop(matched_idx)
                pairs.append(
                    ReconMatchPair(
                        status="FUZZY_MATCH",
                        confidence_score=0.95,
                        purchase_invoice=pr,
                        portal_2b_record=r2b,
                        difference_taxable=pr.taxable_value - r2b.taxable_value,
                        difference_tax=pr.total_tax - r2b.total_tax,
                        is_amended_post_acceptance=r2b.is_amended_post_acceptance,
                    )
                )
            else:
                pr_remaining_p2.append(pr)

        # -------------------------------------------------------------
        # PASS 3: Value Mismatch (Normalized number matches, amounts differ)
        # -------------------------------------------------------------
        pr_remaining_p3: list[PurchaseInvoice] = []
        for pr in pr_remaining_p2:
            norm_pr = normalize_invoice_number(pr.invoice_num)
            matched_idx = -1
            for idx, r2b in enumerate(unmatched_2b):
                norm_2b = normalize_invoice_number(r2b.doc_num)
                if pr.vendor_gstin.upper() == r2b.supplier_gstin.upper() and norm_pr == norm_2b and norm_pr != "":
                    matched_idx = idx
                    break

            if matched_idx >= 0:
                r2b = unmatched_2b.pop(matched_idx)
                pairs.append(
                    ReconMatchPair(
                        status="MISMATCH_VALUE",
                        confidence_score=0.80,
                        purchase_invoice=pr,
                        portal_2b_record=r2b,
                        difference_taxable=pr.taxable_value - r2b.taxable_value,
                        difference_tax=pr.total_tax - r2b.total_tax,
                        is_amended_post_acceptance=r2b.is_amended_post_acceptance,
                    )
                )
            else:
                pr_remaining_p3.append(pr)

        # -------------------------------------------------------------
        # PASS 4: Probable Match (Levenshtein similarity >= 0.85)
        # -------------------------------------------------------------
        pr_remaining_p4: list[PurchaseInvoice] = []
        for pr in pr_remaining_p3:
            matched_idx = -1
            best_score = 0.0
            for idx, r2b in enumerate(unmatched_2b):
                if pr.vendor_gstin.upper() != r2b.supplier_gstin.upper():
                    continue
                score = levenshtein_ratio(pr.invoice_num.upper(), r2b.doc_num.upper())
                if score >= 0.85 and score > best_score:
                    best_score = score
                    matched_idx = idx

            if matched_idx >= 0:
                r2b = unmatched_2b.pop(matched_idx)
                pairs.append(
                    ReconMatchPair(
                        status="PROBABLE_MATCH",
                        confidence_score=best_score,
                        purchase_invoice=pr,
                        portal_2b_record=r2b,
                        difference_taxable=pr.taxable_value - r2b.taxable_value,
                        difference_tax=pr.total_tax - r2b.total_tax,
                        is_amended_post_acceptance=r2b.is_amended_post_acceptance,
                    )
                )
            else:
                pr_remaining_p4.append(pr)

        # Remaining PR -> PURCHASE_NOT_IN_2B
        for pr in pr_remaining_p4:
            pairs.append(
                ReconMatchPair(
                    status="PURCHASE_NOT_IN_2B",
                    confidence_score=0.0,
                    purchase_invoice=pr,
                    difference_taxable=pr.taxable_value,
                    difference_tax=pr.total_tax,
                )
            )

        # Remaining 2B -> VENDOR_NOT_IN_PR
        for r2b in unmatched_2b:
            pairs.append(
                ReconMatchPair(
                    status="VENDOR_NOT_IN_PR",
                    confidence_score=0.0,
                    portal_2b_record=r2b,
                    difference_taxable=-r2b.taxable_value,
                    difference_tax=-r2b.total_tax,
                    is_amended_post_acceptance=r2b.is_amended_post_acceptance,
                )
            )

        # Calculate summary metrics
        exact_c = sum(1 for p in pairs if p.status == "EXACT_MATCH")
        fuzzy_c = sum(1 for p in pairs if p.status == "FUZZY_MATCH")
        prob_c = sum(1 for p in pairs if p.status == "PROBABLE_MATCH")
        mismatch_c = sum(1 for p in pairs if p.status == "MISMATCH_VALUE")
        pr_only_c = sum(1 for p in pairs if p.status == "PURCHASE_NOT_IN_2B")
        v_only_c = sum(1 for p in pairs if p.status == "VENDOR_NOT_IN_PR")

        claimed = sum((p.purchase_invoice.total_tax for p in pairs if p.purchase_invoice), ZERO)
        avail_2b = sum((p.portal_2b_record.total_tax for p in pairs if p.portal_2b_record and p.portal_2b_record.itc_available), ZERO)
        at_risk = sum((p.purchase_invoice.total_tax for p in pairs if p.status == "PURCHASE_NOT_IN_2B" and p.purchase_invoice), ZERO)
        pending_ims = sum(1 for p in pairs if p.portal_2b_record and p.portal_2b_record.ims_action_status == "P")

        summary = ReconSummary(
            total_purchase_count=len(purchase_invoices),
            total_2b_count=len(portal_2b_records),
            exact_matches_count=exact_c,
            fuzzy_matches_count=fuzzy_c,
            probable_matches_count=prob_c,
            value_mismatches_count=mismatch_c,
            purchase_not_in_2b_count=pr_only_c,
            vendor_not_in_pr_count=v_only_c,
            total_itc_claimed_pr=quantize_money(claimed),
            total_itc_available_2b=quantize_money(avail_2b),
            total_itc_at_risk=quantize_money(at_risk),
            ims_pending_actions_count=pending_ims,
        )

        return pairs, summary
