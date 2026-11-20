"""Value parsers for dirty Indian accounting exports.

Money is always decimal.Decimal, never float. A float that arrives from an
Excel numeric cell is converted through its shortest repr (str(value)), which
is the value the user typed, and then rounded to paise.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

PAISE = Decimal("0.01")
ZERO = Decimal("0.00")


@dataclass(frozen=True)
class Parsed:
    """Result of parsing one cell. `changed` means the raw text needed cleaning."""

    value: object | None
    changed: bool = False
    error: str | None = None
    note: str | None = None


# ---------------------------------------------------------------------------
# Money
# ---------------------------------------------------------------------------

_CURRENCY_RE = re.compile(r"(₹|\bINR\b|\bRs\.?)", re.IGNORECASE)
_INDIAN_GROUPED = re.compile(r"^\d{1,2}(,\d{2})*,\d{3}$")  # 1,25,000  12,34,567
_WESTERN_GROUPED = re.compile(r"^\d{1,3}(,\d{3})+$")  # 125,000  1,234,567
_PLAIN_DIGITS = re.compile(r"^\d+$")
_INVISIBLE = dict.fromkeys(map(ord, "   ​‌‍﻿"), " ")


def quantize_money(value: Decimal) -> Decimal:
    return value.quantize(PAISE, rounding=ROUND_HALF_UP)


def format_money(value: Decimal | None) -> str | None:
    """Serialize money as a plain string with two decimals, for example "14250.50"."""
    if value is None:
        return None
    return str(quantize_money(value))


def format_inr(value: Decimal) -> str:
    """Human display with Indian digit grouping, for example "1,25,000.00"."""
    q = quantize_money(value)
    sign = "-" if q < 0 else ""
    whole, frac = f"{abs(q):.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return f"{sign}₹{whole}.{frac}"


def parse_amount(raw: object) -> Parsed:
    """Parse an amount cell into Decimal rounded to paise.

    Handles "1,25,000.00", "125,000.00", "₹ 2,500", "Rs. 2500", "(1,000)" as -1000,
    "-1000", a lone "-" (accounting zero), ints, floats from Excel and Decimals.
    """
    if raw is None:
        return Parsed(None)
    if isinstance(raw, bool):
        return Parsed(None, error="amount must be a number, not true or false")
    if isinstance(raw, Decimal):
        q = quantize_money(raw)
        return Parsed(q, changed=q != raw, note="rounded to paise" if q != raw else None)
    if isinstance(raw, int):
        return Parsed(quantize_money(Decimal(raw)))
    if isinstance(raw, float):
        if raw != raw or raw in (float("inf"), float("-inf")):
            return Parsed(None, error="amount is not a finite number")
        exact = Decimal(str(raw))
        q = quantize_money(exact)
        return Parsed(q, changed=q != exact, note="rounded to paise" if q != exact else None)

    text = str(raw).translate(_INVISIBLE).strip()
    if text == "":
        return Parsed(None)
    original = text
    if text in {"-", "--", "–", "nil", "Nil", "NIL"}:
        return Parsed(ZERO, changed=True, note="dash or nil read as zero")

    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1].strip()
    text = _CURRENCY_RE.sub("", text).strip()
    if text.startswith("-"):
        negative = not negative if text.startswith("-") else negative
        text = text[1:].strip()
    elif text.startswith("+"):
        text = text[1:].strip()
    if text.startswith("(") and text.endswith(")"):
        negative = True
        text = text[1:-1].strip()
    text = text.replace(" ", "")

    if "." in text:
        whole, _, frac = text.partition(".")
        if not frac.isdigit() and frac != "":
            return Parsed(None, error="could not read amount")
    else:
        whole, frac = text, ""
    if whole == "":
        whole = "0"
    if "," in whole:
        if not (_INDIAN_GROUPED.match(whole) or _WESTERN_GROUPED.match(whole)):
            return Parsed(None, error="amount has unusual digit grouping, check the commas")
        whole = whole.replace(",", "")
    if not _PLAIN_DIGITS.match(whole):
        return Parsed(None, error="could not read amount")
    try:
        value = Decimal(f"{whole}.{frac}" if frac else whole)
    except InvalidOperation:
        return Parsed(None, error="could not read amount")
    if negative:
        value = -value
    q = quantize_money(value)
    canonical = format_money(q)
    plain = original.replace(",", "") if False else original
    changed = plain not in {canonical, str(value), whole if not negative else f"-{whole}"}
    return Parsed(q, changed=changed, note="cleaned number format" if changed else None)


# ---------------------------------------------------------------------------
# Dates (Indian convention: day first, never month first)
# ---------------------------------------------------------------------------

EXCEL_EPOCH = date(1899, 12, 30)
MIN_YEAR, MAX_YEAR = 1990, 2100

_MONTHS = {
    "JAN": 1, "JANUARY": 1, "FEB": 2, "FEBRUARY": 2, "MAR": 3, "MARCH": 3, "APR": 4, "APRIL": 4,
    "MAY": 5, "JUN": 6, "JUNE": 6, "JUL": 7, "JULY": 7, "AUG": 8, "AUGUST": 8, "SEP": 9, "SEPT": 9,
    "SEPTEMBER": 9, "OCT": 10, "OCTOBER": 10, "NOV": 11, "NOVEMBER": 11, "DEC": 12, "DECEMBER": 12,
}

_TIME_SUFFIX = re.compile(r"[ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(\s*[AaPp][Mm])?$")
_DMY = re.compile(r"^(\d{1,2})([/\-.])(\d{1,2})\2(\d{2}|\d{4})$")
_YMD = re.compile(r"^(\d{4})([/\-.])(\d{1,2})\2(\d{1,2})$")
_D_MON_Y = re.compile(r"^(\d{1,2})[\s/\-.]*([A-Za-z]{3,9})[\s/\-.,]*(\d{2}|\d{4})$")
_MON_D_Y = re.compile(r"^([A-Za-z]{3,9})[\s/\-.]*(\d{1,2})(?:st|nd|rd|th)?,?[\s/\-.]*(\d{4})$")


def _year(y: str) -> int:
    return 2000 + int(y) if len(y) == 2 else int(y)


def _build(y: int, m: int, d: int) -> Parsed:
    if not (MIN_YEAR <= y <= MAX_YEAR):
        return Parsed(None, error=f"date year {y} is out of range")
    try:
        return Parsed(date(y, m, d))
    except ValueError:
        return Parsed(None, error="date is not a real calendar date")


def _from_serial(n: float) -> Parsed:
    if n != n or n < 1:
        return Parsed(None, error="could not read date")
    whole = int(n)
    try:
        d = EXCEL_EPOCH + timedelta(days=whole)
    except OverflowError:
        return Parsed(None, error="could not read date")
    if not (MIN_YEAR <= d.year <= MAX_YEAR):
        return Parsed(None, error="number is not a plausible Excel date")
    return Parsed(d, changed=True, note="converted Excel date serial")


def parse_date(raw: object) -> Parsed:
    if raw is None:
        return Parsed(None)
    if isinstance(raw, datetime):
        return Parsed(raw.date())
    if isinstance(raw, date):
        return Parsed(raw)
    if isinstance(raw, bool):
        return Parsed(None, error="could not read date")
    if isinstance(raw, (int, float, Decimal)):
        return _from_serial(float(raw))

    text = str(raw).translate(_INVISIBLE).strip()
    if not text:
        return Parsed(None)
    core = _TIME_SUFFIX.sub("", text).strip()

    parsed: Parsed | None = None
    if re.fullmatch(r"\d{5}(\.\d+)?", core):
        parsed = _from_serial(float(core))
    elif m := _YMD.match(core):
        parsed = _build(int(m.group(1)), int(m.group(3)), int(m.group(4)))
    elif m := _DMY.match(core):
        parsed = _build(_year(m.group(4)), int(m.group(3)), int(m.group(1)))
    elif m := _D_MON_Y.match(core):
        month = _MONTHS.get(m.group(2).upper())
        parsed = _build(_year(m.group(3)), month, int(m.group(1))) if month else None
    elif m := _MON_D_Y.match(core):
        month = _MONTHS.get(m.group(1).upper())
        parsed = _build(int(m.group(3)), month, int(m.group(2))) if month else None

    if parsed is None:
        return Parsed(None, error="could not read date, use dd/mm/yyyy")
    if parsed.error or parsed.value is None:
        return parsed
    iso = parsed.value.isoformat()
    changed = text != iso
    return Parsed(parsed.value, changed=changed, note=parsed.note or ("normalized date format" if changed else None))


# ---------------------------------------------------------------------------
# Financial year helpers (April to March)
# ---------------------------------------------------------------------------


def fy_start_year(d: date) -> int:
    return d.year if d.month >= 4 else d.year - 1


def fy_label(d: date) -> str:
    """"2025-26" for any date from 1 Apr 2025 to 31 Mar 2026."""
    start = fy_start_year(d)
    return f"{start}-{(start + 1) % 100:02d}"


def fy_token(d: date) -> str:
    """Compact token "2526" for FY 2025-26."""
    start = fy_start_year(d)
    return f"{start % 100:02d}{(start + 1) % 100:02d}"
