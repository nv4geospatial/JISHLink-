"""
Verhoeff checksum validation for Aadhaar numbers.
"""

VERHOEFF_TABLE_D = (
    (0,1,2,3,4,5,6,7,8,9),
    (1,2,3,4,0,6,7,8,9,5),
    (2,3,4,0,1,7,8,9,5,6),
    (3,4,0,1,2,8,9,5,6,7),
    (4,0,1,2,3,9,5,6,7,8),
    (5,9,8,7,6,0,4,3,2,1),
    (6,5,9,8,7,1,0,4,3,2),
    (7,6,5,9,8,2,1,0,4,3),
    (8,7,6,5,9,3,2,1,0,4),
    (9,8,7,6,5,4,3,2,1,0),
)

VERHOEFF_TABLE_P = (
    (0,1,2,3,4,5,6,7,8,9),
    (1,5,7,6,2,8,3,0,9,4),
    (5,8,0,3,7,9,6,1,4,2),
    (8,9,1,6,0,4,3,5,2,7),
    (9,2,6,3,1,5,8,7,4,0),
    (2,7,1,9,4,6,8,0,3,5),
    (7,0,4,6,9,1,3,2,5,8),
    (0,3,5,7,8,2,9,4,6,1),
    (3,6,9,0,5,7,2,8,1,4),
    (6,4,2,8,0,5,1,7,9,3),
)

VERHOEFF_TABLE_INV = (0,4,3,2,1,5,6,7,8,9)


def verhoeff_checksum(aadhaar_11_digits: str) -> int:
    """Compute the 12th checksum digit for an 11-digit Aadhaar number."""
    c = 0
    for i, ch in enumerate(reversed(aadhaar_11_digits)):
        c = VERHOEFF_TABLE_D[c][VERHOEFF_TABLE_P[i % 8][int(ch)]]
    return VERHOEFF_TABLE_INV[c]


def validate_aadhaar(aadhaar_12_digits: str) -> bool:
    """Validate full 12-digit Aadhaar using Verhoeff algorithm."""
    if len(aadhaar_12_digits) != 12 or not aadhaar_12_digits.isdigit():
        return False
    return verhoeff_checksum(aadhaar_12_digits[:11]) == int(aadhaar_12_digits[11])


def extract_aadhaar_with_validation(ocr_text: str) -> tuple:
    """
    Extract 12-digit Aadhaar from OCR text, validate with Verhoeff.
    Returns (formatted_number, status) where status is:
      'valid' - checksum passes
      'invalid_checksum' - 12 digits found but checksum fails
      'computed_checksum' - 11 digits found, 12th computed
      'not_found' - no 11+ digit sequence found
    """
    import re
    digits = re.sub(r'\D', '', ocr_text)

    # Try exactly 12 consecutive digits
    for match in re.finditer(r'\d{12}', digits):
        candidate = match.group()
        if validate_aadhaar(candidate):
            formatted = f"{candidate[:4]} {candidate[4:8]} {candidate[8:]}"
            return formatted, "valid"
        else:
            return candidate, "invalid_checksum"

    # Try 11-digit + compute checksum
    for match in re.finditer(r'\d{11}', digits):
        candidate_11 = match.group()
        checksum = verhoeff_checksum(candidate_11)
        candidate_12 = candidate_11 + str(checksum)
        formatted = f"{candidate_12[:4]} {candidate_12[4:8]} {candidate_12[8:]}"
        return formatted, "computed_checksum"

    return "", "not_found"