"""
Text extractors for Name, DOB, Gender, Address, Nominee, Pincode, Mobile.
"""

import re
from config import DOB_PATTERNS, DOB_QUALITY_RANK, GENDER_KEYWORDS
from utils import split_camel_case, fix_merged_tokens, strip_leading_name_from_address


def normalise_dob(raw: str) -> str:
    """Turn '14021960' → '14/02/1960'. Leave already-formatted values alone."""
    digits = re.sub(r'\D', '', raw)
    if len(digits) == 8:
        return f"{digits[:2]}/{digits[2:4]}/{digits[4:]}"
    return raw


def extract_dob(text: str) -> tuple:
    """Extract DOB from text. Returns (dob_string, quality)."""
    for pattern, quality in DOB_PATTERNS:
        match = re.search(pattern, text)
        if match:
            groups = match.groups()
            if len(groups) > 1:
                raw = ''.join(groups)
            else:
                raw = groups[0]
            digits_only = re.sub(r'\D', '', raw)
            if len(digits_only) == 8:
                return normalise_dob(raw), 'full'
            return raw, quality
    return "", "missing"


def extract_gender(text_upper: str) -> str:
    for keyword, label in GENDER_KEYWORDS:
        if keyword in text_upper:
            return label
    return ""


def clean_name(raw_name: str) -> str:
    if not raw_name:
        return ""
    name = raw_name
    name = re.sub(r'[Dd][O0][Bb]\s*[:/]?\s*\d[\d/.-]*', '', name)
    name = re.sub(r'[^\x00-\x7F]+', ' ', name)
    name = split_camel_case(name)
    name = re.sub(r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', '', name)
    name = re.sub(r'\d{6,}', '', name)
    name = re.sub(r'\b\d{4}\b', '', name)
    name = re.sub(r'\b[A-Za-z]\b', '', name)
    name = re.sub(r'\.{2,}', '', name)
    name = re.sub(r'\bDOB\b', '', name, flags=re.IGNORECASE)
    # Remove common non-name words
    name = re.sub(r'\b(?:Aadhaar|Government|India|Authority|Unique|Identification|'
                  r'Enrolment|No|QR|XML|Offline|Online|Authentication|Verify|Secure|'
                  r'Code|Download|Date|Issue)\b', '', name, flags=re.IGNORECASE)
    tokens = [t for t in name.split() if len(t) >= 2 and not re.match(r'^[^A-Za-z]+$', t)]
    name = ' '.join(tokens)
    name = name.strip(' .,;:-')
    return name.strip()


def parse_photo_area(lines: list) -> tuple:
    """Extract name, DOB, gender from photo area OCR lines."""
    name = ""
    dob = ""
    dob_quality = "missing"
    gender = ""
    
    if not lines:
        return name, dob, dob_quality, gender
    
    gender_lines = []
    remaining_lines = []
    
    for line in lines:
        g = extract_gender(line['text'].upper())
        if g:
            gender = g
            gender_lines.append(line)
        else:
            remaining_lines.append(line)
    
    dob_lines = []
    name_lines = []
    
    for line in remaining_lines:
        extracted_dob, quality = extract_dob(line['text'])
        if extracted_dob:
            if DOB_QUALITY_RANK[quality] < DOB_QUALITY_RANK.get(dob_quality, 3):
                dob = extracted_dob
                dob_quality = quality
            dob_lines.append(line)
        else:
            name_lines.append(line)
    
    if name_lines:
        name_lines.sort(key=lambda x: x['center_y'])
        valid_parts = []
        for line in name_lines:
            text = line['text'].strip()
            if len(text) > 2:
                text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
                valid_parts.append(text)
        raw_name = ' '.join(valid_parts)
    else:
        raw_name = ""
    
    name = clean_name(raw_name)
    return name, dob, dob_quality, gender


def fix_ocr_prefixes(text: str) -> str:
    fixes = [
        (r'(?<!\w)[Ss][/]?[Oo]\s*[:.]\s*', 'S/O: '),
        (r'(?<!\w)[Ss][Oo]\s*[:.]\s*', 'S/O: '),
        (r'(?<!\w)[Ss][Ii][Oo]\s*[:.]\s*', 'S/O: '),
        (r'(?<!\w)[Ss]\s*[:.]\s*', 'S/O: '),
        (r'(?<!\w)[Cc][Ii][Oo]\s*[:.]\s*', 'C/O: '),
        (r'(?<!\w)[Cc][Ll][Oo]\s*[:.]\s*', 'C/O: '),
        (r'(?<!\w)[Ww][Oo]\s*[:.]\s*', 'W/O: '),
        (r'(?<!\w)[Ww][Ll][Oo]\s*[:.]\s*', 'W/O: '),
        (r'(?<!\w)[Ww][Ll][Oo]\s*[:.]\s*', 'W/O: '),
        (r'(?<!\w)[Dd][Ii][Oo]\s*[:.]\s*', 'D/O: '),
        (r'(?<!\w)[Dd][Ll][Oo]\s*[:.]\s*', 'D/O: '),
        (r'(?<!\w)[Ww][/]?[Oo]\s*[:.]\s*', 'W/O: '),
        (r'(?<!\w)[Cc][/]?[Oo]\s*[:.]\s*', 'C/O: '),
        (r'(?<!\w)[Dd][/]?[Oo]\s*[:.]\s*', 'D/O: '),
        (r'(?<!\w)[Mm][/]?[Oo]\s*[:.]\s*', 'M/O: '),
        (r'(?<!\w)[Ff][/]?[Oo]\s*[:.]\s*', 'F/O: '),
    ]
    for pattern, replacement in fixes:
        text = re.sub(pattern, replacement, text)
    return text


def extract_nominee(text: str) -> str:
    # Pattern 1: Standard relation prefix + name
    pattern = (
        r'([CSWDMF]/O\s*:\s*'
        r'[A-Za-z][A-Za-z\s]{0,40}?)'
        r'(?:\s*$|\s*(?=\d|H\.|Plot|Flat|#|No\.|Door|,|;|\n))'
    )
    match = re.search(pattern, text, re.MULTILINE)
    if match:
        nominee = match.group(1).strip().rstrip(',;')
        if len(nominee.split()) >= 2:
            return nominee
    
    # Pattern 2: Merged prefix like "CIO Name" or "SIO Name" (missing slash)
    pattern2 = r'\b([CSWDMF][Ii]?[Oo]\s+[A-Za-z][A-Za-z\s]{1,30}?)' \
               r'(?=\s*\d|\s*H\.|\s*Plot|\s*Flat|\s*#|\s*No\.|\s*Door|\s*,|\s*;|\n|$)'
    match2 = re.search(pattern2, text, re.MULTILINE)
    if match2:
        nominee = match2.group(1).strip()
        nominee = re.sub(r'^(CIO|ClO|CI0|SIO|SI0|WlO|WIO|DlO|DI0|DIO)', lambda m: {
            'CIO': 'C/O:', 'ClO': 'C/O:', 'CI0': 'C/O:',
            'SIO': 'S/O:', 'SI0': 'S/O:',
            'WlO': 'W/O:', 'WIO': 'W/O:',
            'DlO': 'D/O:', 'DI0': 'D/O:', 'DIO': 'D/O:'
        }.get(m.group(1), m.group(1)), nominee)
        if len(nominee.split()) >= 2:
            return nominee
    
    return ""


def parse_address_block(full_text: str) -> tuple:
    """Extract address, nominee, pincode, mobile from address block text."""
    if not full_text:
        return "", "", "", "", {}
    
    text = full_text.strip()
    text = fix_ocr_prefixes(text)
    text = fix_merged_tokens(text)
    quality = {}
    
    # Extract mobile
    mobile = ""
    mobile_matches = re.findall(r'\b\d{10}\b', text)
    if mobile_matches:
        mobile = mobile_matches[-1]
        quality['mobile'] = 'ok'
    else:
        long_numbers = re.findall(r'\d{10,}', text)
        if long_numbers:
            mobile = long_numbers[-1][:10]
            quality['mobile'] = 'extracted_from_merged'
    
    # Extract pincode
    pincode = ""
    if mobile:
        mobile_pos = text.rfind(mobile)
        before_mob = text[:mobile_pos] if mobile_pos > 0 else text
        pc_matches = re.findall(r'\b\d{6}\b', before_mob)
        if pc_matches:
            pincode = pc_matches[-1]
            quality['pincode'] = 'before_mobile'
    
    if not pincode:
        state_pattern = (
            r'(?:Pradesh|Bengal|Rajasthan|Haryana|Kerala|Karnataka|'
            r'Tamil\s*Nadu|Gujarat|Maharashtra|Punjab|Bihar|'
            r'Madhya\s*Pradesh|Uttar\s*Pradesh|Odisha|Assam|Goa)'
            r'[-\s]*(\d{6})'
        )
        state_match = re.search(state_pattern, text, re.IGNORECASE)
        if state_match:
            pincode = state_match.group(1)
            quality['pincode'] = 'after_state'
    
    if not pincode:
        for num in reversed(re.findall(r'\b\d{6}\b', text)):
            if mobile and num in mobile:
                continue
            pincode = num
            quality['pincode'] = 'fallback'
            break
    
    # Extract nominee
    nominee = extract_nominee(text)
    quality['nominee'] = 'ok' if nominee else 'not_found'
    
    # Clean address
    address = text
    if mobile:
        address = address.rsplit(mobile, 1)[0]
    if pincode:
        address = address.rsplit(pincode, 1)[0]
    if nominee:
        address = address.replace(nominee, '', 1)
    
    address = re.sub(r'\s+', ' ', address)
    address = re.sub(r'[,;]+', ',', address)
    address = address.strip(' ,;-')
    address = re.sub(r'-\s*$', '', address)
    address = re.sub(r',\s*,', ',', address)
    address = strip_leading_name_from_address(address)
    
    return address, nominee, pincode, mobile, quality


def validate_name(name: str) -> str:
    if not name:
        return 'missing'
    words = name.split()
    if len(words) < 2 or len(name) < 5:
        return 'short'
    return 'ok'