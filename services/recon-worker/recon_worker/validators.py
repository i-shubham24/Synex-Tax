"""Python ports of packages/tax-engine/src/validators.

Ported for parity, not reinvented:
  - gstin.ts        -> validate_gstin, calculate_gstin_checksum, GSTN_STATE_CODES
  - rule46.ts       -> validate_invoice_number_rule46
  - section17-5.ts  -> classify_section_17_5

Keep these in lock step with the TypeScript originals. If a rule changes there,
change it here and in tests/test_validators.py.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

GSTN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

GSTN_STATE_CODES: dict[str, str] = {
    "01": "Jammu & Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra & Nagar Haveli and Daman & Diu",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman & Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
    "97": "Other Territory",
    "99": "Centre Jurisdiction",
}

_GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


@dataclass(frozen=True)
class GstinResult:
    is_valid: bool
    state_code: str | None = None
    state_name: str | None = None
    error: str | None = None


def calculate_gstin_checksum(first14: str) -> str | None:
    """Official GSTN Mod-36 checksum character for the first 14 characters."""
    if not first14 or len(first14) != 14:
        return None
    upper = first14.upper()
    total = 0
    for i, ch in enumerate(upper):
        val = GSTN_ALPHABET.find(ch)
        if val == -1:
            return None
        factor = 1 if i % 2 == 0 else 2
        prod = val * factor
        total += prod // 36 + prod % 36
    return GSTN_ALPHABET[(36 - (total % 36)) % 36]


def validate_gstin(gstin: str | None) -> GstinResult:
    """Format, state code and Mod-36 checksum check of a 15 character GSTIN."""
    if not gstin:
        return GstinResult(False, error="GSTIN is required")
    trimmed = gstin.strip().upper()
    if len(trimmed) != 15:
        return GstinResult(False, error=f"GSTIN must be exactly 15 characters (received {len(trimmed)})")
    if not _GSTIN_REGEX.match(trimmed):
        return GstinResult(
            False,
            error="GSTIN format is invalid. Must match 2-digit state + 10-char PAN + 1-char entity + Z + 1-char checksum",
        )
    state_code = trimmed[:2]
    state_name = GSTN_STATE_CODES.get(state_code)
    if not state_name:
        return GstinResult(False, error=f"Invalid GST state code: {state_code}")
    expected = calculate_gstin_checksum(trimmed[:14])
    if expected != trimmed[14]:
        return GstinResult(
            False,
            state_code=state_code,
            state_name=state_name,
            error=f"GSTIN Mod-36 checksum failure: expected '{expected}', received '{trimmed[14]}'",
        )
    return GstinResult(True, state_code=state_code, state_name=state_name)


# ---------------------------------------------------------------------------
# Rule 46(b): consecutive serial number, max 16 characters, letters, digits,
# hyphen "-" and slash "/" only, unique for a financial year.
# ---------------------------------------------------------------------------

_RULE_46_REGEX = re.compile(r"^[A-Za-z0-9\-/]{1,16}$")


@dataclass(frozen=True)
class Rule46Result:
    is_valid: bool
    sanitized: str | None = None
    error: str | None = None


def validate_invoice_number_rule46(invoice_number: str | None) -> Rule46Result:
    if not invoice_number:
        return Rule46Result(False, error="Invoice number is mandatory")
    trimmed = invoice_number.strip()
    if not trimmed:
        return Rule46Result(False, error="Invoice number cannot be empty or whitespace")
    if len(trimmed) > 16:
        return Rule46Result(
            False,
            error=f"Invoice number exceeds statutory 16-character limit under Rule 46(b) (length: {len(trimmed)})",
        )
    if not _RULE_46_REGEX.match(trimmed):
        return Rule46Result(
            False,
            error=(
                "Invoice number violates Rule 46(b). Permitted characters: letters (A-Z, a-z), digits (0-9), "
                "hyphen (-), and forward slash (/) only. Spaces, dots, and underscores are prohibited on GSTN."
            ),
        )
    return Rule46Result(True, sanitized=trimmed)


# ---------------------------------------------------------------------------
# Section 17(5) blocked credit, routed to GSTR-3B Table 4(B)(1).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BlockedCreditResult:
    is_blocked: bool
    routing_table: str
    clause: str | None = None
    category: str | None = None
    warning_message: str | None = None


def classify_section_17_5(
    hsn_or_sac_code: str | None,
    *,
    is_used_for_further_supply: bool = False,
    is_used_for_staff_statutory_duty: bool = False,
    is_plant_and_machinery: bool = False,
) -> BlockedCreditResult:
    code = (hsn_or_sac_code or "").strip()

    # 17(5)(a) motor vehicles: HSN 8702, 8703, 8711
    if code.startswith(("8702", "8703", "8711")):
        if is_used_for_further_supply:
            return BlockedCreditResult(False, "Table_4_A_5")
        return BlockedCreditResult(
            True,
            "Table_4_B_1",
            clause="17(5)(a)",
            category="MOTOR_VEHICLE",
            warning_message=(
                "Motor vehicles with seating capacity <= 13 are blocked under Section 17(5)(a) unless used for "
                "further supply, passenger transport, or driving school."
            ),
        )

    # 17(5)(b) food, catering, beauty, health, club membership: SAC 9963, 9997, 9996
    if code.startswith(("9963", "9997", "9996")):
        if is_used_for_further_supply or is_used_for_staff_statutory_duty:
            return BlockedCreditResult(False, "Table_4_A_5")
        return BlockedCreditResult(
            True,
            "Table_4_B_1",
            clause="17(5)(b)",
            category="FOOD_BEVERAGE_CATERING_CLUB",
            warning_message=(
                "Food & beverages, outdoor catering, beauty, or club memberships are blocked under Section 17(5)(b) "
                "unless statutory employer obligation or outward supply of same category."
            ),
        )

    # 17(5)(c) works contract for immovable property: SAC 9954
    if code.startswith("9954"):
        if is_plant_and_machinery or is_used_for_further_supply:
            return BlockedCreditResult(False, "Table_4_A_5")
        return BlockedCreditResult(
            True,
            "Table_4_B_1",
            clause="17(5)(c)",
            category="WORKS_CONTRACT_IMMOVABLE_PROPERTY",
            warning_message=(
                "Works contract services for immovable property (other than plant & machinery) are blocked under "
                "Section 17(5)(c)."
            ),
        )

    return BlockedCreditResult(False, "Table_4_A_5")
