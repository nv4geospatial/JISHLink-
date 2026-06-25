#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JishLink Production OCR Pipeline — Line-by-Line Field Classifier
No ROI splitting. Processes full OCR text and classifies each line into fields.
Uses EasyOCR for text + regex/ML patterns for field classification.
"""

import sys
import io
import json
import base64
import os
import re
import http.server
from io import BytesIO
from typing import List, Dict, Tuple, Optional, Any

# Force UTF-8 for stdout/stderr on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", line_buffering=True)

import cv2
import numpy as np
from PIL import Image

# ── Try to import openbharatocr (optional enhancement) ──────────────────────
try:
    from openbharatocr import ocr_aadhaar_front, ocr_aadhaar_back
    OPENBHARAT_AVAILABLE = True
    print("[OCR-PY] openbharatocr loaded successfully", flush=True)
except ImportError:
    OPENBHARAT_AVAILABLE = False
    print("[OCR-PY] openbharatocr not available, using built-in pipeline", flush=True)

# Lazy import EasyOCR
_reader = None

def get_reader():
    global _reader
    if _reader is None:
        print("[OCR-PY] Loading EasyOCR model...", flush=True)
        import easyocr
        _reader = easyocr.Reader(["en", "hi"], gpu=False, verbose=False)
        print("[OCR-PY] EasyOCR ready.", flush=True)
    return _reader

# ── Indian Name Dictionary (for semantic validation) ─────────────────────────
INDIAN_SURNAMES = {
    "Kumar", "Singh", "Sharma", "Verma", "Gupta", "Patel", "Reddy", "Nair", "Iyer",
    "Das", "Mishra", "Yadav", "Jha", "Ali", "Khan", "Shah", "Mehta", "Desai", "Joshi",
    "Rao", "Naidu", "Pandey", "Chauhan", "Thakur", "Bhat", "Rathore", "Chandra",
    "Prasad", "Lal", "Ram", "Devi", "Kaur", "Bai", "Ben", "Bhai", "Prajapati", "Prjapat",
    "Prajapat", "Siddharth", "Nagar", "Uttar", "Pradesh", "Biraj", "Shivkumar", "Shanna",
    "Dayashankar", "Tej", "Pal", "Musk", "Modi", "Gandhi", "Nehru", "Bose", "Tagore",
    "Prajapati", "Biraj", "Shivkumar", "Dayashankar", "Tejpal", "Tej", "Pal"
}

INDIAN_FIRST_NAMES = {
    "Raj", "Rahul", "Amit", "Vikram", "Sanjay", "Anil", "Sunil", "Manoj", "Ravi",
    "Shiv", "Shiva", "Krish", "Ram", "Shyam", "Mohan", "Sohan", "Rohan", "Karan",
    "Arjun", "Vijay", "Ajay", "Deepak", "Rajesh", "Suresh", "Mahesh", "Naresh",
    "Elon", "Shanna", "Shivkumar", "Dayashankar", "Biraj", "Tej", "Pal", "Shiv",
    "Kumar", "Singh", "Mishra", "Prajapati", "Raj", "Tej"
}

ADDRESS_KEYWORDS = {
    "Colony", "Street", "Road", "Avenue", "Lane", "Block", "Sector", "Phase",
    "Extension", "Extn", "Nagar", "Vihar", "Enclave", "Apartment", "Flat",
    "House", "H.No", "Gali", "Chowk", "Bazar", "Market", "Mohalla",
    "Delhi", "Mumbai", "Chennai", "Kolkata", "Bangalore", "Hyderabad", "Pune",
    "Jaipur", "Gurgaon", "Noida", "Ghaziabad", "Faridabad", "Lucknow", "Kanpur",
    "Nagpur", "Indore", "Thane", "Bhopal", "Visakhapatnam", "Vadodara", "Firozabad",
    "Ludhiana", "Rajkot", "Agra", "Siliguri", "Durgapur", "Chandigarh", "Coimbatore",
    "Mysore", "Mangalore", "Nashik", "Udaipur", "Jodhpur", "Ajmer", "Bikaner",
    "Alwar", "Bharatpur", "Sikar", "Pali", "Tonk", "Kota", "Jhunjhunu", "Sawai",
    "Madhopur", "Dausa", "Jalore", "Sirohi", "Barmer", "Jaisalmer", "Hanumangarh",
    "Ganganagar", "Bundi", "Karauli", "Dholpur", "Jhalawar", "Baran", "Rajsamand",
    "Pratapgarh", "Chittorgarh", "Bhilwara", "Churu", "Siddharthnagar", "Basti",
    "Gorakhpur", "Kushinagar", "Maharajganj", "Deoria", "Ballia", "Azamgarh",
    "Mau", "Ghazipur", "Varanasi", "Jaunpur", "Sultanpur", "Faizabad", "Ambedkar",
    "Bareilly", "Badaun", "Kasganj", "Etah", "Mainpuri", "Agra", "Mathura",
    "Hathras", "Aligarh", "Etawah", "Auraiya", "Kanpur", "Jalaun", "Hamirpur",
    "Mahoba", "Banda", "Chitrakoot", "Fatehpur", "Kaushambi", "Allahabad",
    "Chhatarpur", "Panna", "Satna", "Rewa", "Sidhi", "Singrauli", "Shahdol",
    "Anuppur", "Umaria", "Dindori", "Mandla", "Balaghat", "Seoni", "Narsinghpur",
    "Jabalpur", "Katni", "Maihar", "Damoh", "Sagar", "Vidisha", "Raisen", "Sehore",
    "Rajgarh", "Shajapur", "Dewas", "Khandwa", "Burhanpur", "Khargone", "Barwani",
    "Dhar", "Indore", "Ujjain", "Ratlam", "Mandsaur", "Bansi", "Siddharthnagar",
    "Uttar", "Pradesh", "Kamhariya", "Buzurg", "Biraj", "Kalka", "Kalkaji", "Tughlakabad",
    "Extn", "South", "Delhi", "Pal", "Singh"
}

# ── GARBAGE PATTERNS — lines to completely ignore ──────────────────────────
GARBAGE_PATTERNS = {
    "information", "enrolment no", "aadhaar is a proof", "valid throughout",
    "helps you avail", "government and non", "services easily", "keep your mobile",
    "email id updated", "carry aadhaar", "smart phone", "maadhaar app", "download",
    "play store", "appstore", "android", "ios", "visit www", "uidai.gov", "1947",
    "help@", "secure qr", "online authentication", "xml", "electronically generated",
    "letter", "coroomont", "mera meri pehchan", "p.o.box", "bengaluru", "tnis",
    "goncraied", "leter", "uniqve", "umnenucaton", "couniry", "avall", "goveinment",
    "yoUI", "moblle", "uodated", "phore", "aadnaar", "maadnaar", "nanakn", "prool",
    "citizensnip", "venty", "codel", "ontline", "so", "818", "272", "57", "9919", "60653",
    "gar", "mane", "h", "koi", "sarkari", "aur", "gair", "sevaon", "paana", "aasan",
    "panati", "monail", "nandar", "einel", "apdet", "rakhene", "smark", "fon", "skhe",
    "sath", "chaar", "pach", "che", "saat", "aath", "nau", "das", "ek", "do", "teen",
    "sabhi", "ke", "liye", "mane", "desh", "bhar", "mein", "janm", "tithi", "pata",
    "purush", "mahila", "aam", "aadmi", "ka", "adhikar", "mera", "meri", "pehchan",
    "signature verified", "digitally signed", "this is", "or code", "offline xml",
    "online authentication", "p.o.box", "bengaluru", "1800", "help", "uidai",
    "www.uidai", "gov.in", "1947", "qr code", "secure qr", "verify identity",
    "using secure", "not of citizenship", "proof of identity", "identity not",
    "carry aadhaar", "your smart", "smart phone", "use maadhaar", "maadhaar app",
    "keep your", "mobile number", "email id", "updated in", "aadhaar helps",
    "avail various", "various government", "non-government", "government services",
    "services easily", "easily keep", "throughout the", "the country", "country aadhaar",
    "is valid", "valid throughout", "throughout the", "the country", " electronically",
    "generated letter", "letter this", "this is", "is electronically", "electronically generated"
}

# ── FIELD CLASSIFIER — classifies each line into a field type ────────────────
def classify_line(line: str) -> List[Tuple[str, str, float]]:
    """
    Classify a single OCR line into MULTIPLE field types with confidence.
    Returns list of (extracted_value, field_type, confidence)
    A single line can contain multiple fields (e.g., "Name DOB: 01/01/1990 MALE")
    """
    text = line.strip()
    lower = text.lower()
    results = []
    
    # Rule 0: Empty or too short
    if len(text) < 2:
        return results
    
    # Rule 1: Check for garbage patterns — skip entire line if it's garbage
    for pattern in GARBAGE_PATTERNS:
        if pattern in lower:
            return results  # Empty = garbage
    
    # Rule 2: Hindi-only lines (mostly non-ASCII) — skip
    non_ascii = sum(1 for c in text if ord(c) > 127)
    if non_ascii / len(text) > 0.5:
        return results
    
    # Rule 3: Aadhar number (4-4-4 format) — extract from anywhere in line
    m = re.search(r"\b(\d{4}\s*\d{4}\s*\d{4})\b", text)
    if m:
        aadhar = re.sub(r"\D", "", m.group(1))
        results.append((aadhar, "aadhar", 0.99))
    
    # Rule 4: Date of Birth — extract from anywhere in line
    # Pattern: DOB label + date
    m = re.search(r"(?:DOB|Date of Birth|जन्म\s*तिथि)[:\s]*(\d{2}[/.-]\d{2}[/.-]\d{4})", text, re.I)
    if m:
        dob = normalize_date(m.group(1))
        if dob:
            results.append((dob, "dob", 0.95))
    
    # Pattern: Year of Birth
    m = re.search(r"(?:Year of Birth|जन्म\s*वर्ष|YOB)[:\s]*(\d{4})", text, re.I)
    if m:
        year = m.group(1)
        if 1900 <= int(year) <= 2025:
            results.append((year, "dob", 0.9))
    
    # Pattern: Any date (but not Aadhar number)
    if not any(ft == "aadhar" for _, ft, _ in results):
        m = re.search(r"\b(\d{2}[/.-]\d{2}[/.-]\d{4})\b", text)
        if m:
            dob = normalize_date(m.group(1))
            if dob:
                results.append((dob, "dob", 0.85))
    
    # Rule 5: Gender — extract from anywhere
    if re.search(r"\b(?:Male|पुरुष|purush)\b", text, re.I):
        results.append(("Male", "gender", 0.95))
    elif re.search(r"\b(?:Female|महिला|mahila|stree)\b", text, re.I):
        results.append(("Female", "gender", 0.95))
    
    # Rule 6: Pincode (6 digits)
    m = re.search(r"\b([1-9]\d{5})\b", text)
    if m:
        results.append((m.group(1), "pincode", 0.9))
    
    # Rule 7: Phone number (10 digits starting with 6-9)
    m = re.search(r"\b([6-9]\d{9})\b", text)
    if m:
        results.append((m.group(1), "phone", 0.9))
    
    # Rule 8: Father name from S/O pattern
    m = re.search(r"(?:S/O|D/O|W/O|C/O)[:\s]*([A-Za-z][A-Za-z\s.]{1,35})", text, re.I)
    if m:
        father = m.group(1).strip()
        father = re.split(r"[,;]", father)[0].strip()
        words = father.split()
        if 1 <= len(words) <= 4:
            results.append((" ".join(w.title() for w in words), "father", 0.9))
    
    # Rule 9: Name — look for Title Case or ALL CAPS name patterns
    # Try to extract name from beginning of line (before DOB, S/O, etc.)
    words = text.split()
    
    # Find name candidates: consecutive Title Case or ALL CAPS words
    name_candidates = []
    current_name = []
    for word in words:
        # Stop at known non-name markers
        if word.lower() in {"dob", "date", "birth", "year", "male", "female", "s/o", "d/o", "w/o", "c/o", "address", "pincode", "phone", "mobile", "email", "enrolment", "no", "government", "india", "uidai", "aadhaar"}:
            if current_name:
                name_candidates.append(" ".join(current_name))
                current_name = []
            continue
        
        # Check if word looks like a name part
        if re.match(r"^[A-Z][a-z]+$", word) or (word.isupper() and len(word) > 2 and len(word) < 20):
            current_name.append(word)
        else:
            if current_name:
                name_candidates.append(" ".join(current_name))
                current_name = []
    
    if current_name:
        name_candidates.append(" ".join(current_name))
    
    # Pick the best name candidate
    for candidate in name_candidates:
        candidate_words = candidate.split()
        if 1 <= len(candidate_words) <= 4:
            has_indian_name = any(w in INDIAN_SURNAMES or w in INDIAN_FIRST_NAMES for w in candidate_words)
            if has_indian_name:
                name = candidate.title() if candidate.isupper() else candidate
                # Avoid duplicate if already added as father
                if not any(v == name and ft == "father" for v, ft, _ in results):
                    results.append((name, "name", 0.85))
                    break  # Only take first valid name
    
    # Rule 10: Address — if line has address keywords and wasn't classified as name/father
    has_addr_keyword = any(kw.lower() in lower for kw in ADDRESS_KEYWORDS)
    has_so = bool(re.search(r"\b(?:S/O|D/O|W/O|C/O)\b", text, re.I))
    
    if has_so or (has_addr_keyword and len(text) > 10):
        # Clean the line for address
        addr_text = text
        # Remove name part if present
        for val, ft, _ in results:
            if ft == "name":
                addr_text = addr_text.replace(val, "")
        # Remove DOB part
        addr_text = re.sub(r"\d{2}[/.-]\d{2}[/.-]\d{4}", "", addr_text)
        # Remove gender
        addr_text = re.sub(r"\b(?:Male|Female|MALE|FEMALE|पुरुष|महिला)\b", "", addr_text, flags=re.I)
        # Clean up
        addr_text = re.sub(r"\s+", " ", addr_text).strip()
        if len(addr_text) > 10:
            results.append((addr_text, "address", 0.8))
    
    return results

# ── Anchor Detection ─────────────────────────────────────────────────────────
# Anchor texts that help identify regions on Aadhar card
ANCHORS = {
    "govt_india": ["Government of India", "भारत सरकार", "Bharat Sarkar"],
    "aadhar_logo": ["AADHAAR", "आधार"],
    "your_aadhar": ["Your Aadhaar No", "आपका आधार क्रमांक", "Your Aadhar No"],
    "enrolment": ["Enrolment No", "नामांकन क्रम"],
    "address": ["Address", "पता", "Pata"],
    "info": ["INFORMATION", "सूचना", "Aadhaar is a proof"],
    "dob_label": ["DOB", "Date of Birth", "जन्म तिथि", "Year of Birth"],
    "gender_male": ["Male", "पुरुष", "MALE"],
    "gender_female": ["Female", "महिला", "FEMALE"],
    "father_so": ["S/O", "D/O", "W/O", "C/O", "S/O:", "D/O:", "W/O:", "C/O:"],
    "phone_label": ["Mobile", "Phone", "Contact", "Tel"],
    "signature": ["Signature Verified", "Digitally Signed"],
    "qr_code": ["QR", "Code"],
    "mAadhaar": ["mAadhaar", "App"],
    "help_line": ["1947", "help@", "uidai.gov"],
    "valid": ["valid throughout", "Aadhaar is valid"],
}

def find_anchors(ocr_results: List[Dict]) -> Dict[str, List[Dict]]:
    """Find anchor text regions in OCR results."""
    found = {}
    for item in ocr_results:
        text = item["text"].strip()
        lower = text.lower()
        
        for anchor_name, patterns in ANCHORS.items():
            for pattern in patterns:
                if pattern.lower() in lower:
                    if anchor_name not in found:
                        found[anchor_name] = []
                    found[anchor_name].append(item)
                    break
    
    return found

# ── Dynamic ROI Extraction ─────────────────────────────────────────────────
def get_relative_roi(anchor_item: Dict, img_width: int, img_height: int, 
                     rel_x: float, rel_y: float, rel_w: float, rel_h: float) -> Tuple[int, int, int, int]:
    """
    Calculate ROI relative to an anchor point.
    rel_x, rel_y: relative position offset from anchor (as ratio of image size)
    rel_w, rel_h: width and height of ROI (as ratio of image size)
    """
    ax = anchor_item["x_center"]
    ay = anchor_item["y_center"]
    
    x1 = max(0, int(ax + rel_x * img_width - rel_w * img_width / 2))
    y1 = max(0, int(ay + rel_y * img_height - rel_h * img_height / 2))
    x2 = min(img_width, int(x1 + rel_w * img_width))
    y2 = min(img_height, int(y1 + rel_h * img_height))
    
    return (x1, y1, x2, y2)

def get_narrow_band_roi(anchor_item: Dict, img_width: int, img_height: int,
                        y_offset_ratio: float, band_height_ratio: float,
                        x_margin_ratio: float = 0.05) -> Tuple[int, int, int, int]:
    """
    Create a narrow horizontal band ROI below an anchor.
    This is much more precise than a big box.
    """
    ax = anchor_item["x_center"]
    ay = anchor_item["y_center"]
    
    # Narrow band: small height, full width minus margins
    y1 = int(ay + y_offset_ratio * img_height)
    y2 = int(y1 + band_height_ratio * img_height)
    x1 = int(x_margin_ratio * img_width)
    x2 = int((1 - x_margin_ratio) * img_width)
    
    return (max(0, x1), max(0, y1), min(img_width, x2), min(img_height, y2))

def extract_roi_text(ocr_results: List[Dict], roi: Tuple[int, int, int, int]) -> List[Dict]:
    """Extract OCR results that fall within a given ROI."""
    x1, y1, x2, y2 = roi
    filtered = []
    for item in ocr_results:
        cx = item["x_center"]
        cy = item["y_center"]
        if x1 <= cx <= x2 and y1 <= cy <= y2:
            filtered.append(item)
    return filtered

def extract_roi_text_strict(ocr_results: List[Dict], roi: Tuple[int, int, int, int]) -> List[Dict]:
    """Extract OCR results where the ENTIRE bounding box falls within ROI."""
    x1, y1, x2, y2 = roi
    filtered = []
    for item in ocr_results:
        # Require entire bbox to be inside ROI (not just center)
        if (x1 <= item["x_min"] and item["x_max"] <= x2 and 
            y1 <= item["y_min"] and item["y_max"] <= y2):
            filtered.append(item)
    return filtered

def build_text_from_results(ocr_results: List[Dict]) -> str:
    """Build plain text from OCR results, sorted top-to-bottom, left-to-right."""
    if not ocr_results:
        return ""
    
    # Sort by y, then x
    sorted_results = sorted(ocr_results, key=lambda x: (x["y_center"], x["x_center"]))
    
    lines = []
    current_line = []
    prev_y = None
    
    for item in sorted_results:
        y = item["y_center"]
        if prev_y is None or abs(y - prev_y) > 30:
            if current_line:
                lines.append(" ".join(current_line))
            current_line = [item["text"]]
            prev_y = y
        else:
            current_line.append(item["text"])
    
    if current_line:
        lines.append(" ".join(current_line))
    
    return "\n".join(lines)

# ── Layout-Aware OCR with Bounding Boxes ───────────────────────────────────
def run_easyocr_layout(image_bytes: bytes) -> Tuple[List[Dict], int, int]:
    """Run EasyOCR and return results with spatial layout information + image dimensions."""
    img = Image.open(BytesIO(image_bytes)).convert("RGB")
    img_array = np.array(img)
    h, w = img_array.shape[:2]
    
    # Scale up for better OCR on small text
    scale = 1.0
    if max(h, w) < 1500:
        scale = 1500 / max(h, w)
        img_array = cv2.resize(img_array, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        h, w = img_array.shape[:2]
    
    reader = get_reader()
    results = reader.readtext(img_array, detail=1, paragraph=False)
    
    output = []
    for bbox, text, conf in results:
        if conf > 0.15 and text.strip():
            x_coords = [p[0] for p in bbox]
            y_coords = [p[1] for p in bbox]
            x_min, x_max = min(x_coords), max(x_coords)
            y_min, y_max = min(y_coords), max(y_coords)
            
            # Scale back coordinates if image was resized
            if scale != 1.0:
                x_min /= scale
                x_max /= scale
                y_min /= scale
                y_max /= scale
            
            output.append({
                "text": text.strip(),
                "bbox": bbox,
                "confidence": round(conf, 3),
                "x_min": x_min, "x_max": x_max,
                "y_min": y_min, "y_max": y_max,
                "x_center": (x_min + x_max) / 2,
                "y_center": (y_min + y_max) / 2,
                "width": x_max - x_min,
                "height": y_max - y_min,
            })
    
    return output, w, h

# ── Smart Text Cleaning ────────────────────────────────────────────────────
def is_garbage_line(line: str) -> bool:
    """Detect true OCR garbage, not valid text."""
    if len(line) < 2:
        return True
    
    # If it's mostly non-ASCII but contains valid Hindi words, keep it
    non_ascii = sum(1 for c in line if ord(c) > 127)
    total = len(line)
    
    if non_ascii / total > 0.5:
        hindi_words = ["आधार", "भारत", "सरकार", "पहचान", "प्राधिकरण", "जन्म", "पुरुष", "महिला", "पता", "मेरा", "अधिकार"]
        if any(hw in line for hw in hindi_words):
            return False
        if re.search(r'[\u0900-\u097F]{2,}', line):
            return False
        return True
    
    # Check for excessive consonant clusters (gibberish)
    if re.search(r'[bcdfghjklmnpqrstvwxyz]{6,}', line.lower()):
        return True
    
    return False

def clean_lines(lines: List[str]) -> List[str]:
    """Clean OCR output by removing garbage lines."""
    cleaned = []
    for line in lines:
        line = line.strip()
        if line and not is_garbage_line(line):
            cleaned.append(line)
    return cleaned

# ── Semantic Field Extraction from ROI Text ────────────────────────────────
def looks_like_name(line: str) -> bool:
    """Check if a line looks like a person's name."""
    if len(line) < 3 or len(line) > 50:
        return False
    if re.match(r"^\d", line):
        return False
    
    # CRITICAL: Reject lines with Hindi characters
    if re.search(r'[\u0900-\u097F]', line):
        return False
    
    # CRITICAL: Reject lines that are mostly non-ASCII
    non_ascii = sum(1 for c in line if ord(c) > 127)
    if non_ascii > 0:
        return False
    
    words = line.split()
    if len(words) < 1 or len(words) > 5:
        return False
    
    # Check for Title Case or ALL CAPS
    is_title_case = all(re.match(r"^[A-Z][a-z]+$", w) for w in words if w.isalpha())
    is_all_caps = line.isupper() and len(line) > 3 and len(line) < 35
    
    if not (is_title_case or is_all_caps):
        return False
    
    # Exclude known non-names
    non_names = {"government", "india", "uidai", "aadhaar", "authority", "unique", 
                 "identification", "enrolment", "information", "valid", "help", 
                 "address", "male", "female", "dob", "date", "birth", "year",
                 "phone", "mobile", "email", "signature", "barcode", "qr", "online",
                 "offline", "authentication", "identity", "citizenship", "electronically",
                 "generated", "letter", "xml", "secure", "code", "verify", "throughout",
                 "country", "services", "easily", "updated", "smart", "carry", "keep",
                 "various", "non", "government", "and", "the", "is", "a", "of", "not",
                 "using", "this", "your", "you", "in", "to", "use", "maadhaar", "app",
                 "download", "play", "store", "appstore", "for", "android", "ios",
                 "visit", "www", "https", "com", "in", "gov", "org", "net",
                 "install", "get", "now", "today", "here", "click", "tap", "touch",
                 "press", "hold", "swipe", "scroll", "zoom", "pinch", "rotate", "shake",
                 "flip", "turn", "twist", "bend", "fold", "unfold", "open", "close",
                 "lock", "unlock", "start", "stop", "begin", "end", "finish", "complete",
                 "done", "ok", "yes", "no", "maybe", "perhaps", "possibly", "probably",
                 "likely", "unlikely", "sure", "certain", "definite", "absolute", "total",
                 "complete", "full", "whole", "entire", "all", "every", "each", "any",
                 "some", "many", "much", "more", "most", "less", "least", "few", "several",
                 "various", "different", "same", "similar", "like", "unlike", "as", "than",
                 "then", "when", "where", "why", "how", "what", "who", "which", "whose",
                 "whom", "whatever", "whoever", "whichever", "however", "whenever", "wherever",
                 "whyever", "whomever", "whatsoever", "whosoever", "whichsoever", "howsoever",
                 "whensoever", "wheresoever", "whysoever", "whomsoever", "information",
                 "enrolment", "authority", "unique", "identification", "india", "government",
                 "aadhaar", "valid", "throughout", "country", "helps", "avail", "various",
                 "services", "easily", "keep", "mobile", "number", "email", "updated",
                 "carry", "smart", "phone", "use", "maadhaar", "app", "download", "play",
                 "store", "appstore", "android", "ios", "visit", "www", "https", "com",
                 "gov", "org", "net", "install", "get", "now", "today",
                 "here", "click", "tap", "touch", "press", "hold", "swipe", "scroll",
                 "zoom", "pinch", "rotate", "shake", "flip", "turn", "twist", "bend",
                 "fold", "unfold", "open", "close", "lock", "unlock", "start", "stop",
                 "begin", "end", "finish", "complete", "done", "ok", "yes", "no", "maybe",
                 "perhaps", "possibly", "probably", "likely", "unlikely", "sure", "certain",
                 "definite", "absolute", "total", "complete", "full", "whole", "entire",
                 "all", "every", "each", "any", "some", "many", "much", "more", "most",
                 "less", "least", "few", "several", "various", "different", "same",
                 "similar", "like", "unlike", "as", "than", "then", "when", "where", "why",
                 "how", "what", "who", "which", "whose", "whom", "whatever", "whoever",
                 "whichever", "however", "whenever", "wherever", "whyever", "whomever",
                 "whatsoever", "whosoever", "whichsoever", "howsoever", "whensoever",
                 "wheresoever", "whysoever", "whomsoever", "enrolment", "no", "aadhaar",
                 "is", "proof", "not", "citizenship", "verify", "using", "secure",
                 "offline", "authentication", "electronically", "generated", "mera", "meri",
                 "pehchan", "aam", "aadmi", "ka", "adhikar", "sarkari", "aur", "gair",
                 "sarkari", "sevaon", "ka", "paana", "aasaan", "banata", "hai", "apna",
                 "smartphone", "par", "rakhe", "saath", "sabhi", "ke", "liye", "mane",
                 "desh", "bhar", "mein", "janm", "tithi", "pata", "purush", "mahila",
                 "nagar", "vihar", "mohalla", "gali", "chowk", "bazar", "market", "district",
                 "tehsil", "block", "village", "post", "police", "station", "signature",
                 "verified", "digitally", "signed", "help", "uidai", "gov", "in", "pobox",
                 "bengaluru", "coroomont", "tnis", "goncraied", "leter", "uniqve", "umnenucaton",
                 "couniry", "avall", "goveinment", "yoUI", "moblle", "uodated", "phore",
                 "aadnaar", "maadnaar", "coroomont", "nanakn", "prool", "citizensnip",
                 "venty", "codel", "ontline", "so", "818", "272", "57", "9919", "60653",
                 "gar", "mane", "h", "koi", "sarkari", "aur", "gair", "sarkari", "sevaon",
                 "ka", "paana", "aasan", "panati", "monail", "nandar", "einel", "apdet",
                 "rakhene", "smark", "fon", "par", "skhe", "sath", "chaar", "pach", "che",
                 "saat", "aath", "nau", "das", "ek", "do", "teen", "sabhi", "ke", "liye",
                 "mane", "desh", "bhar", "mein", "janm", "tithi", "pata", "purush", "mahila"}
    
    lower = line.lower()
    if any(nn in lower for nn in non_names):
        return False
    
    # Check if contains Indian name
    has_indian_name = any(w in INDIAN_SURNAMES or w in INDIAN_FIRST_NAMES 
                          for w in words)
    
    return True

def extract_name_from_region(text: str, lines: List[str]) -> Optional[str]:
    """Extract name from a region's text."""
    # Strategy 1: Look for Title Case or ALL CAPS name patterns
    for line in lines:
        line = line.strip()
        if looks_like_name(line):
            # Clean ALL CAPS to Title Case
            name = line.title() if line.isupper() else line
            # Remove common prefixes that might have been captured
            name = re.sub(r"^(To|S/O|D/O|W/O|C/O|Mr|Mrs|Ms|Dr)\s*", "", name, flags=re.I).strip()
            if name and len(name) >= 3:
                return name
    
    # Strategy 2: Line with Indian surname
    for line in lines:
        words = line.split()
        if any(w in INDIAN_SURNAMES for w in words):
            cleaned = re.sub(r"[^A-Za-z\s]", "", line).strip()
            if len(cleaned) >= 3:
                name = " ".join(cleaned.split()).title()
                if not any(x in name.lower() for x in ["aadhaar", "uidai", "government", "india", "enrolment"]):
                    return name
    
    return None

def extract_father_from_region(text: str, lines: List[str]) -> Optional[str]:
    """Extract father name from S/O patterns in region."""
    # Pattern 1: S/O, D/O, W/O, C/O with name
    patterns = [
        r"(?:S/O|S\\O|SO|S\\s*O|s/o)[:\s]*([A-Za-z][A-Za-z\s.]{1,35})",
        r"(?:D/O|D\\O|DO|D\\s*O|d/o)[:\s]*([A-Za-z][A-Za-z\s.]{1,35})",
        r"(?:W/O|W\\O|WO|W\\s*O|w/o)[:\s]*([A-Za-z][A-Za-z\s.]{1,35})",
        r"(?:C/O|C\\O|CO|C\\s*O|c/o)[:\s]*([A-Za-z][A-Za-z\s.]{1,35})",
    ]
    
    for pattern in patterns:
        m = re.search(pattern, text, re.I)
        if m:
            father = m.group(1).strip()
            father = re.split(r"[,;]", father)[0].strip()
            words = father.split()
            if 1 <= len(words) <= 4:
                if not any(g in father.lower() for g in OCR_GARBAGE):
                    return " ".join(w.title() for w in words)
    
    # Pattern 2: "S/O" on one line, name on next
    for i, line in enumerate(lines):
        if re.search(r"\bS/O\b|\bD/O\b|\bW/O\b|\bC/O\b", line, re.I):
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if re.match(r"^[A-Za-z\s]{2,35}$", next_line):
                    words = next_line.split()
                    if 1 <= len(words) <= 4:
                        return " ".join(w.title() for w in words)
    
    return None

def extract_address_from_region(text: str, lines: List[str]) -> Optional[str]:
    """Extract address from a region's text."""
    # Strategy 1: Lines after S/O (which starts address)
    for i, line in enumerate(lines):
        if re.search(r"\bS/O\b|\bD/O\b|\bW/O\b|\bC/O\b", line, re.I):
            addr_lines = [line]
            for j in range(i + 1, min(i + 8, len(lines))):
                next_line = lines[j].strip()
                # Stop at common non-address patterns
                if any(x in next_line.lower() for x in ["help", "www", "uidai", "gov", "aadhaar", "maadhaar", "phone", "mobile", "enrolment", "information", "valid", "throughout"]):
                    break
                if re.search(r"^\d{4}\s?\d{4}\s?\d{4}$", next_line):  # Aadhar number
                    break
                if re.search(r"^[A-Za-z]", next_line) and len(next_line) > 3:
                    addr_lines.append(next_line)
            if len(addr_lines) > 1:
                return ", ".join(addr_lines)
    
    # Strategy 2: Any line with address keywords
    for line in lines:
        words = line.split()
        if any(w in ADDRESS_KEYWORDS for w in words):
            if re.search(r"[A-Za-z]{3,}", line) and len(line) > 10:
                if re.search(r"\d|S/O|H\.No|House", line):
                    return line
    
    # Strategy 3: Lines near pincode
    for i, line in enumerate(lines):
        if re.search(r"\b\d{6}\b", line):
            addr_lines = []
            for j in range(max(0, i - 4), i + 1):
                prev = lines[j].strip()
                if re.search(r"[A-Za-z]{3,}", prev) and len(prev) > 5:
                    if not any(x in prev.lower() for x in ["help", "www", "uidai", "gov", "aadhaar", "maadhaar", "phone", "mobile"]):
                        addr_lines.append(prev)
            if addr_lines:
                return ", ".join(addr_lines)
    
    return None

def extract_dob_from_region(text: str) -> Optional[str]:
    """Extract DOB from region text."""
    # Pattern 1: Explicit DOB label
    patterns = [
        r"(?:DOB|Date of Birth|जन्म\s*तिथि)[:\s]*(\d{2}[/.-]\d{2}[/.-]\d{4})",
        r"(?:DOB|Date of Birth)[/\s:]*(\d{2}[/.-]\d{2}[/.-]\d{4})",
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.I)
        if m:
            return normalize_date(m.group(1))
    
    # Pattern 2: Year of Birth
    yob_patterns = [
        r"(?:Year of Birth|जन्म\s*वर्ष|Birth Year|YOB)[:\s]*(\d{4})",
        r"(?:Year of Birth)[:\s]*(\d{4})",
    ]
    for pattern in yob_patterns:
        m = re.search(pattern, text, re.I)
        if m:
            year = m.group(1)
            if 1900 <= int(year) <= 2025:
                return year
    
    # Pattern 3: Any date that looks like DOB
    date_pattern = r"\b(\d{2}[/.-]\d{2}[/.-]\d{4})\b"
    for m in re.finditer(date_pattern, text):
        date_str = m.group(1)
        normalized = normalize_date(date_str)
        if normalized:
            parts = normalized.split("/")
            if len(parts) == 3:
                year = int(parts[2])
                if 1900 <= year <= 2025:
                    if not re.match(r"^\d{4}[/.-]\d{4}[/.-]\d{4}$", date_str):
                        return normalized
    
    return None

def normalize_date(date_str: str) -> Optional[str]:
    """Normalize date string to DD/MM/YYYY format."""
    m = re.match(r"(\d{2})[/.-](\d{2})[/.-](\d{4})", date_str)
    if m:
        day, month, year = m.group(1), m.group(2), m.group(3)
        if 1 <= int(day) <= 31 and 1 <= int(month) <= 12 and 1900 <= int(year) <= 2025:
            return f"{day}/{month}/{year}"
    return None

def extract_pincode_from_region(text: str) -> Optional[str]:
    """Extract 6-digit Indian pincode."""
    m = re.search(r"\b([1-9]\d{5})\b", text)
    if m:
        pin = m.group(1)
        if len(pin) == 6:
            return pin
    return None

def extract_gender_from_region(text: str) -> Optional[str]:
    """Extract gender from region text."""
    lower = text.lower()
    male_indicators = ["male", "पुरुष", "purush", "m ", " m ", "gender: m", "sex: m", "male"]
    female_indicators = ["female", "महिला", "mahila", "stree", "स्त्री", "f ", " f ", "gender: f", "sex: f", "female"]
    
    for indicator in male_indicators:
        if indicator in lower:
            return "Male"
    for indicator in female_indicators:
        if indicator in lower:
            return "Female"
    return None

def extract_phone_from_region(text: str) -> Optional[str]:
    """Extract 10-digit Indian mobile number."""
    patterns = [
        r"(?:Mobile|Phone|Mob|Contact|M|Tel)[:\s]*(\d{10})",
        r"(?:Mobile|Phone|Mob)[:\s]*[No\.#]*[:\s]*(\d{10})",
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.I)
        if m:
            phone = m.group(1)
            if phone[0] in "6789":
                return phone
    
    m = re.search(r"\b([6-9]\d{9})\b", text)
    if m:
        return m.group(1)
    return None

def extract_aadhar_number_from_region(text: str) -> Optional[str]:
    """Extract 12-digit Aadhar number in 4-4-4 format."""
    m = re.search(r"\b(\d{4}[\s-]\d{4}[\s-]\d{4})\b", text)
    if m:
        return re.sub(r"\D", "", m.group(1))
    
    cleaned = re.sub(r"\s", "", text)
    m = re.search(r"\b([2-9]\d{11})\b", cleaned)
    if m:
        return m.group(1)
    return None

# ── Front/Back Detection ─────────────────────────────────────────────────
def detect_front_back_layout(ocr_results: List[Dict], img_width: int, img_height: int) -> Dict[str, Any]:
    """
    Detect if image contains front+back combined, and split into regions.
    Returns: {
        "layout": "single_front" | "single_back" | "front_back_vertical" | "front_back_horizontal" | "four_panel",
        "regions": [{"name": "front", "bbox": (x1,y1,x2,y2)}, ...]
    }
    """
    # Count how many times we see "Government of India" or "AADHAAR" or "आधार"
    goi_items = [item for item in ocr_results 
                 if any(x in item["text"].lower() for x in ["government of india", "भारत सरकार", "bharat sarkar"])]
    goi_count = len(goi_items)
    
    aadhar_logo_items = [item for item in ocr_results 
                         if any(x in item["text"].lower() for x in ["aadhaar", "आधार"])]
    aadhar_logo_count = len(aadhar_logo_items)
    
    print(f"[OCR-PY] Layout detection: GOI={goi_count}, AadharLogo={aadhar_logo_count}", flush=True)
    
    # Strategy 1: Check for horizontal split (left=front, right=back) — most common for scans
    if goi_count >= 2:
        y_positions = sorted([item["y_center"] for item in goi_items])
        x_positions = sorted([item["x_center"] for item in goi_items])
        
        y_gap = y_positions[-1] - y_positions[0] if len(y_positions) >= 2 else 0
        x_gap = x_positions[-1] - x_positions[0] if len(x_positions) >= 2 else 0
        
        print(f"[OCR-PY] GOI positions: x_range={x_gap}, y_range={y_gap}", flush=True)
        
        # Horizontal split: GOI items are side by side (large x gap, small y gap)
        if x_gap > img_width * 0.25 and y_gap < img_height * 0.3:
            # Find the split point between left and right GOI clusters
            split_x = int(x_positions[0] + x_gap / 2)
            # Ensure split is near middle
            if img_width * 0.3 < split_x < img_width * 0.7:
                return {
                    "layout": "front_back_horizontal",
                    "regions": [
                        {"name": "front", "bbox": (0, 0, split_x, img_height)},
                        {"name": "back", "bbox": (split_x, 0, img_width, img_height)}
                    ]
                }
        
        # Vertical split: GOI items are top/bottom (large y gap, small x gap)
        if y_gap > img_height * 0.3 and x_gap < img_width * 0.3:
            split_y = int(y_positions[0] + y_gap / 2)
            if img_height * 0.3 < split_y < img_height * 0.7:
                return {
                    "layout": "front_back_vertical",
                    "regions": [
                        {"name": "front", "bbox": (0, 0, img_width, split_y)},
                        {"name": "back", "bbox": (0, split_y, img_width, img_height)}
                    ]
                }
    
    # Strategy 2: Check for 4-panel using Aadhar logo positions
    # ONLY detect 4-panel if logos are truly in a 2x2 grid pattern
    if aadhar_logo_count >= 4:
        aadhar_y_positions = sorted([item["y_center"] for item in aadhar_logo_items])
        aadhar_x_positions = sorted([item["x_center"] for item in aadhar_logo_items])
        
        y_range = aadhar_y_positions[-1] - aadhar_y_positions[0]
        x_range = aadhar_x_positions[-1] - aadhar_x_positions[0]
        
        # Check if there are logos in all 4 quadrants
        quadrants = {"tl": False, "tr": False, "bl": False, "br": False}
        mid_x = img_width / 2
        mid_y = img_height / 2
        
        for item in aadhar_logo_items:
            x = item["x_center"]
            y = item["y_center"]
            if x < mid_x and y < mid_y:
                quadrants["tl"] = True
            elif x >= mid_x and y < mid_y:
                quadrants["tr"] = True
            elif x < mid_x and y >= mid_y:
                quadrants["bl"] = True
            else:
                quadrants["br"] = True
        
        # True 4-panel: logos in all 4 quadrants AND spread in both x and y
        if all(quadrants.values()) and y_range > img_height * 0.4 and x_range > img_width * 0.3:
            mid_x = img_width // 2
            mid_y = img_height // 2
            return {
                "layout": "four_panel",
                "regions": [
                    {"name": "front_top", "bbox": (0, 0, mid_x, mid_y)},
                    {"name": "back_top", "bbox": (mid_x, 0, img_width, mid_y)},
                    {"name": "front_bottom", "bbox": (0, mid_y, mid_x, img_height)},
                    {"name": "back_bottom", "bbox": (mid_x, mid_y, img_width, img_height)}
                ]
            }
    
    # Strategy 3: Single card — determine if front or back
    has_photo_area = any(item["y_center"] < img_height * 0.5 and item["x_center"] < img_width * 0.4 
                         for item in ocr_results if len(item["text"]) > 2 and item["text"].isalpha())
    has_address = any("address" in item["text"].lower() or 
                      any(x in item["text"] for x in ["S/O", "C/O", "H.No", "Gali", "Colony", "Street", "Road", "Nagar"])
                      for item in ocr_results)
    
    if has_address and not has_photo_area:
        return {
            "layout": "single_back",
            "regions": [{"name": "back", "bbox": (0, 0, img_width, img_height)}]
        }
    
    return {
        "layout": "single_front",
        "regions": [{"name": "front", "bbox": (0, 0, img_width, img_height)}]
    }

def extract_region_text(ocr_results: List[Dict], region_bbox: Tuple[int, int, int, int]) -> Tuple[List[Dict], int, int]:
    """Extract OCR results within a region and return with relative coordinates."""
    x1, y1, x2, y2 = region_bbox
    region_results = []
    
    for item in ocr_results:
        cx = item["x_center"]
        cy = item["y_center"]
        if x1 <= cx <= x2 and y1 <= cy <= y2:
            # Create copy with relative coordinates
            rel_item = dict(item)
            rel_item["x_center"] = cx - x1
            rel_item["y_center"] = cy - y1
            rel_item["x_min"] = item["x_min"] - x1
            rel_item["x_max"] = item["x_max"] - x1
            rel_item["y_min"] = item["y_min"] - y1
            rel_item["y_max"] = item["y_max"] - y1
            region_results.append(rel_item)
    
    region_w = x2 - x1
    region_h = y2 - y1
    return region_results, region_w, region_h

# ── Aadhar Front Side Extraction ───────────────────────────────────────────
def extract_aadhar_front(ocr_results: List[Dict], img_width: int, img_height: int) -> Dict[str, str]:
    """Extract fields from Aadhar FRONT side."""
    data = {}
    
    # Find anchors in front region
    anchors = find_anchors(ocr_results)
    
    # Name: right of photo, below GOI — typically in upper-left quadrant after GOI
    name_candidates = []
    
    # Strategy 1: Find text below GOI, left side, that looks like a name
    goi_items = anchors.get("govt_india", [])
    if goi_items:
        goi = goi_items[0]
        # Scan narrow band below GOI, left side (where photo is)
        name_roi = get_narrow_band_roi(goi, img_width, img_height,
                                        y_offset_ratio=0.02, band_height_ratio=0.06,
                                        x_margin_ratio=0.20)
        name_results = extract_roi_text(ocr_results, name_roi)
        name_text = build_text_from_results(name_results)
        name_lines = clean_lines([l.strip() for l in name_text.split("\n") if l.strip()])
        
        print(f"[OCR-PY] Name ROI lines: {name_lines}", flush=True)
        
        for line in name_lines:
            # Skip header text and Hindi
            lower = line.lower()
            if any(x in lower for x in ["government", "india", "भारत", "सरकार", "authority", "uidai", "pahchan", "pradhikaran", "enrolment", "नामांकन", "mera", "meri", "pehchan", "aam", "aadmi", "ka", "adhikar"]):
                continue
            # Skip lines with Hindi characters
            if re.search(r'[\u0900-\u097F]', line):
                continue
            if looks_like_name(line):
                name = line.title() if line.isupper() else line
                name = re.sub(r"^(To|S/O|D/O|W/O|C/O|Mr|Mrs|Ms|Dr)\s*", "", name, flags=re.I).strip()
                if name and len(name) >= 3:
                    name_candidates.append((name, 0.9))
                    break
    
    # Strategy 2: Look for name in upper portion, left of center
    if not name_candidates:
        for item in ocr_results:
            if item["y_center"] > img_height * 0.12 and item["y_center"] < img_height * 0.40:
                if item["x_center"] < img_width * 0.65:
                    line = item["text"].strip()
                    # Skip Hindi
                    if re.search(r'[\u0900-\u097F]', line):
                        continue
                    if looks_like_name(line):
                        name = line.title() if line.isupper() else line
                        name_candidates.append((name, 0.7))
    
    if name_candidates:
        name_candidates.sort(key=lambda x: x[1], reverse=True)
        data["full_name"] = name_candidates[0][0]
        print(f"[OCR-PY] Found name: {data['full_name']}", flush=True)
    
    # DOB / Year of Birth: look for date patterns or "Year of Birth" label
    dob_roi = None
    if "dob_label" in anchors:
        dob_item = anchors["dob_label"][0]
        dob_roi = get_narrow_band_roi(dob_item, img_width, img_height,
                                       y_offset_ratio=0.0, band_height_ratio=0.05,
                                       x_margin_ratio=0.05)
    else:
        # Fallback: scan middle area where DOB typically is
        dob_roi = (int(img_width * 0.20), int(img_height * 0.20), 
                   int(img_width * 0.80), int(img_height * 0.50))
    
    if dob_roi:
        dob_results = extract_roi_text(ocr_results, dob_roi)
        dob_text = build_text_from_results(dob_results)
        dob = extract_dob_from_region(dob_text)
        if dob:
            data["dob"] = dob
        else:
            # Try Year of Birth format
            yob_match = re.search(r"(?:Year of Birth|जन्म\s*वर्ष|YOB)[:\s]*(\d{4})", dob_text, re.I)
            if yob_match:
                year = yob_match.group(1)
                if 1900 <= int(year) <= 2025:
                    data["dob"] = year
    
    # If still no DOB, scan entire image for any date pattern
    if not data.get("dob"):
        full_dob = extract_dob_from_region(build_text_from_results(ocr_results))
        if full_dob:
            data["dob"] = full_dob
    
    # Gender: scan near DOB area or look for Male/Female
    gender_roi = (int(img_width * 0.20), int(img_height * 0.25),
                  int(img_width * 0.80), int(img_height * 0.60))
    gender_results = extract_roi_text(ocr_results, gender_roi)
    gender_text = build_text_from_results(gender_results)
    gender = extract_gender_from_region(gender_text)
    if gender:
        data["gender"] = gender
    else:
        # Fallback: scan full image for gender
        full_gender = extract_gender_from_region(build_text_from_results(ocr_results))
        if full_gender:
            data["gender"] = full_gender
    
    # Aadhar Number: bottom center, large font
    aadhar_roi = None
    if "your_aadhar" in anchors:
        ya = anchors["your_aadhar"][0]
        aadhar_roi = get_narrow_band_roi(ya, img_width, img_height,
                                          y_offset_ratio=0.02, band_height_ratio=0.05,
                                          x_margin_ratio=0.15)
    else:
        # Bottom 20% of image, center
        aadhar_roi = (int(img_width * 0.10), int(img_height * 0.75),
                      int(img_width * 0.90), int(img_height * 0.95))
    
    # Also try scanning the entire bottom half for aadhar number if not found
    aadhar_results = extract_roi_text(ocr_results, aadhar_roi)
    aadhar_text = build_text_from_results(aadhar_results)
    aadhar = extract_aadhar_number_from_region(aadhar_text)
    if not aadhar:
        # Fallback: scan bottom 40% of entire image
        fallback_roi = (int(img_width * 0.05), int(img_height * 0.60),
                        int(img_width * 0.95), int(img_height * 0.95))
        fallback_results = extract_roi_text(ocr_results, fallback_roi)
        fallback_text = build_text_from_results(fallback_results)
        aadhar = extract_aadhar_number_from_region(fallback_text)
    
    if aadhar:
        data["aadhar_number"] = aadhar
    
    aadhar_results = extract_roi_text(ocr_results, aadhar_roi)
    aadhar_text = build_text_from_results(aadhar_results)
    aadhar = extract_aadhar_number_from_region(aadhar_text)
    if aadhar:
        data["aadhar_number"] = aadhar
    
    return data

# ── Aadhar Back Side Extraction ────────────────────────────────────────────
def extract_aadhar_back(ocr_results: List[Dict], img_width: int, img_height: int) -> Dict[str, str]:
    """Extract fields from Aadhar BACK side (address, father name, pincode)."""
    data = {}
    
    # Find S/O pattern for father name and address start
    anchors = find_anchors(ocr_results)
    
    # Address: contains S/O, D/O, C/O, W/O + street details + pincode
    address_text = ""
    address_lines = []
    
    if "father_so" in anchors:
        so_item = anchors["father_so"][0]
        # Address starts at S/O and goes down to pincode or bottom
        # But NOT too far down (avoid footer)
        addr_roi = get_relative_roi(so_item, img_width, img_height, 0.0, 0.04, 0.8, 0.15)
        addr_results = extract_roi_text(ocr_results, addr_roi)
        addr_text = build_text_from_results(addr_results)
        addr_lines = [l.strip() for l in addr_text.split("\n") if l.strip()]
    elif "address" in anchors:
        addr_item = anchors["address"][0]
        addr_roi = get_narrow_band_roi(addr_item, img_width, img_height,
                                        y_offset_ratio=0.02, band_height_ratio=0.15,
                                        x_margin_ratio=0.05)
        addr_results = extract_roi_text(ocr_results, addr_roi)
        addr_text = build_text_from_results(addr_results)
        addr_lines = [l.strip() for l in addr_text.split("\n") if l.strip()]
    else:
        # Fallback: scan middle to bottom of back side, but exclude footer
        addr_roi = (int(img_width * 0.05), int(img_height * 0.20),
                    int(img_width * 0.95), int(img_height * 0.75))
        addr_results = extract_roi_text(ocr_results, addr_roi)
        addr_text = build_text_from_results(addr_results)
        addr_lines = [l.strip() for l in addr_text.split("\n") if l.strip()]
    
    print(f"[OCR-PY] Raw address lines: {addr_lines[:10]}", flush=True)
    
    # Filter address lines — aggressive filtering
    filtered_addr = []
    for line in addr_lines:
        lower = line.lower()
        # Skip info box / footer / Hindi lines
        skip_patterns = [
            "valid throughout", "aadhaar helps", "government and non", "services easily",
            "mobile number", "email id", "keep your", "updated", "carry aadhaar",
            "smart phone", "maadhaar", "download", "play store", "appstore", "android", "ios",
            "visit", "www", "https", "uidai.gov", "1947", "help@", "p.o.box", "bengaluru",
            "information", "enrolment no", "aadhaar is a proof", "not of citizenship",
            "verify identity", "secure qr", "offline xml", "online authentication",
            "electronically generated", "letter", "coroomont", "tnis", "goncraied", "leter",
            "uniqve", "umnenucaton", "couniry", "avall", "goveinment", "yoUI", "moblle",
            "uodated", "phore", "aadnaar", "maadnaar", "nanakn", "prool", "citizensnip",
            "venty", "codel", "ontline", "mera", "meri", "pehchan", "aam", "aadmi", "ka", "adhikar",
            "sabhi", "ke", "liye", "mane", "desh", "bhar", "mein", "janm", "tithi", "pata",
            "purush", "mahila", "sarkari", "aur", "gair", "sevaon", "paana", "aasan", "banata",
            "hai", "apna", "smartphone", "par", "rakhe", "saath", "sath", "chaar", "pach", "che",
            "saat", "aath", "nau", "das", "ek", "do", "teen", "monail", "nandar", "einel", "apdet",
            "rakhene", "smark", "fon", "skhe", "gar", "mane", "h", "koi", "panati", "sabhi"
        ]
        if any(x in lower for x in skip_patterns):
            continue
        # Skip lines with excessive Hindi
        if re.search(r'[\u0900-\u097F]', line):
            continue
        # Skip enrolment
        if "enrolment" in lower or "नामांकन" in lower:
            continue
        # Skip QR code patterns
        if re.match(r"^\d{3,4}\s*\d{3,4}\s*\d{3,4}$", line):
            continue
        # Skip very short or very long
        if len(line) < 3 or len(line) > 100:
            continue
        # Skip single words that aren't address-like
        words = line.split()
        if len(words) == 1 and words[0].lower() not in ADDRESS_KEYWORDS:
            continue
        filtered_addr.append(line)
    
    print(f"[OCR-PY] Filtered address lines: {filtered_addr}", flush=True)
    
    # Extract father name from address lines
    father = extract_father_from_region("\n".join(filtered_addr), filtered_addr)
    if father:
        data["father_name"] = father
    
    # Extract address (excluding father name line if it was part of address)
    if filtered_addr:
        # Remove the S/O line if it was used for father name
        addr_without_father = []
        for line in filtered_addr:
            if father and father in line:
                # Keep the rest of the line as address part (after S/O name)
                parts = re.split(r"(?:S/O|D/O|W/O|C/O)[:\s]*" + re.escape(father), line, flags=re.I)
                if len(parts) > 1 and parts[1].strip():
                    addr_without_father.append(parts[1].strip())
                continue
            addr_without_father.append(line)
        
        if addr_without_father:
            address = extract_address_from_region("\n".join(addr_without_father), addr_without_father)
            if address:
                data["address"] = address
            else:
                # Just join all filtered lines as address
                data["address"] = ", ".join(addr_without_father)
    
    # Pincode from address region
    pincode = extract_pincode_from_region("\n".join(filtered_addr))
    if pincode:
        data["pincode"] = pincode
    
    return data

# ── Main Aadhar Extraction — Multi-Field Line Classifier ─────────────────────
def extract_aadhar_line_classifier(ocr_results: List[Dict], img_width: int, img_height: int) -> Dict[str, str]:
    """
    Extract Aadhar fields using multi-field line classification.
    Each line can contain MULTIPLE fields (name + DOB + gender + address).
    """
    data = {
        "full_name": None,
        "father_name": None,
        "aadhar_number": None,
        "dob": None,
        "address": None,
        "gender": None,
        "pincode": None,
        "phone": None,
    }
    
    # Build full text from OCR results
    full_text = build_text_from_results(ocr_results)
    lines = [l.strip() for l in full_text.split("\n") if l.strip()]
    
    print(f"[OCR-PY] Classifying {len(lines)} lines for multi-field extraction...", flush=True)
    
    # Collect all classified fields across all lines
    all_fields = []  # List of (value, field_type, confidence, source_line)
    
    for line in lines:
        classifications = classify_line(line)
        for value, field_type, confidence in classifications:
            all_fields.append((value, field_type, confidence, line))
            print(f"[OCR-PY]  '{line[:60]}' → {field_type}='{value}' ({confidence:.2f})", flush=True)
    
    # Extract best field for each type
    # Name: highest confidence
    name_fields = [(v, c, l) for v, t, c, l in all_fields if t == "name"]
    if name_fields:
        name_fields.sort(key=lambda x: x[1], reverse=True)
        data["full_name"] = name_fields[0][0]
    
    # Father: highest confidence
    father_fields = [(v, c, l) for v, t, c, l in all_fields if t == "father"]
    if father_fields:
        father_fields.sort(key=lambda x: x[1], reverse=True)
        data["father_name"] = father_fields[0][0]
    
    # Aadhar: highest confidence (should be 0.99)
    aadhar_fields = [(v, c, l) for v, t, c, l in all_fields if t == "aadhar"]
    if aadhar_fields:
        aadhar_fields.sort(key=lambda x: x[1], reverse=True)
        data["aadhar_number"] = aadhar_fields[0][0]
    
    # DOB: highest confidence
    dob_fields = [(v, c, l) for v, t, c, l in all_fields if t == "dob"]
    if dob_fields:
        dob_fields.sort(key=lambda x: x[1], reverse=True)
        data["dob"] = dob_fields[0][0]
    
    # Gender: highest confidence
    gender_fields = [(v, c, l) for v, t, c, l in all_fields if t == "gender"]
    if gender_fields:
        gender_fields.sort(key=lambda x: x[1], reverse=True)
        data["gender"] = gender_fields[0][0]
    
    # Address: combine all address fields, remove duplicates
    addr_fields = [(v, c, l) for v, t, c, l in all_fields if t == "address"]
    if addr_fields:
        # Sort by confidence
        addr_fields.sort(key=lambda x: x[1], reverse=True)
        # Take the best one, or combine if multiple
        best_addr = addr_fields[0][0]
        # Clean up: remove extra spaces, normalize
        best_addr = re.sub(r"\s+", " ", best_addr).strip()
        data["address"] = best_addr
    
    # Pincode: highest confidence
    pincode_fields = [(v, c, l) for v, t, c, l in all_fields if t == "pincode"]
    if pincode_fields:
        pincode_fields.sort(key=lambda x: x[1], reverse=True)
        data["pincode"] = pincode_fields[0][0]
    
    # Phone: highest confidence
    phone_fields = [(v, c, l) for v, t, c, l in all_fields if t == "phone"]
    if phone_fields:
        phone_fields.sort(key=lambda x: x[1], reverse=True)
        data["phone"] = phone_fields[0][0]
    
    # Remove None values, keep only extracted fields
    result = {k: v for k, v in data.items() if v is not None}
    
    print(f"[OCR-PY] Multi-field classifier result: {result}", flush=True)
    return result

def extract_father_from_line(line: str) -> Optional[str]:
    """Extract father name from a single line with S/O pattern."""
    patterns = [
        r"(?:S/O|D/O|W/O|C/O)[:\s]*([A-Za-z][A-Za-z\s.]{1,35})",
    ]
    for pattern in patterns:
        m = re.search(pattern, line, re.I)
        if m:
            father = m.group(1).strip()
            father = re.split(r"[,;]", father)[0].strip()
            words = father.split()
            if 1 <= len(words) <= 4:
                return " ".join(w.title() for w in words)
    return None

def extract_dob_from_line(line: str) -> Optional[str]:
    """Extract DOB from a single line."""
    # Explicit DOB label
    m = re.search(r"(?:DOB|Date of Birth|Year of Birth)[:\s]*(\d{2}[/.-]\d{2}[/.-]\d{4}|\d{4})", line, re.I)
    if m:
        val = m.group(1)
        if len(val) == 4:
            if 1900 <= int(val) <= 2025:
                return val
        else:
            return normalize_date(val)
    
    # Any date pattern
    m = re.search(r"\b(\d{2}[/.-]\d{2}[/.-]\d{4})\b", line)
    if m:
        return normalize_date(m.group(1))
    
    # Year of Birth format
    m = re.search(r"(?:Year of Birth|जन्म\s*वर्ष)[:\s]*(\d{4})", line, re.I)
    if m:
        year = m.group(1)
        if 1900 <= int(year) <= 2025:
            return year
    
    return None

def extract_gender_from_line(line: str) -> Optional[str]:
    """Extract gender from a single line."""
    lower = line.lower()
    if any(x in lower for x in ["male", "पुरुष", "purush", "m "]):
        return "Male"
    if any(x in lower for x in ["female", "महिला", "mahila", "stree", "f "]):
        return "Female"
    return None

def extract_pincode_from_line(line: str) -> Optional[str]:
    """Extract pincode from a single line."""
    m = re.search(r"\b([1-9]\d{5})\b", line)
    if m:
        return m.group(1)
    return None

# ── PAN and Bank Extraction (simpler, no complex layout) ──────────────────
def extract_pan_fields(ocr_results: List[Dict], img_width: int, img_height: int) -> Dict[str, str]:
    """Extract PAN card fields."""
    data = {}
    full_text = build_text_from_results(ocr_results)
    lines = [l.strip() for l in full_text.split("\n") if l.strip()]
    
    # PAN Number
    m = re.search(r"\b([A-Z]{5}\d{4}[A-Z])\b", full_text.upper())
    if m:
        data["pan_number"] = m.group(1)
    
    # Name (usually ALL CAPS on PAN)
    for i, line in enumerate(lines):
        if re.search(r"\bName\b", line, re.I):
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if re.match(r"^[A-Z\s]{3,}$", next_line):
                    data["full_name"] = next_line.title()
                    break
    
    # Father Name
    for i, line in enumerate(lines):
        if re.search(r"\bFather\b", line, re.I):
            if i + 1 < len(lines):
                data["father_name"] = lines[i + 1].strip().title()
                break
    
    # DOB
    dob = extract_dob_from_region(full_text)
    if dob:
        data["dob"] = dob
    
    return data

def extract_bank_fields(ocr_results: List[Dict], img_width: int, img_height: int) -> Dict[str, str]:
    """Extract bank document fields."""
    data = {}
    full_text = build_text_from_results(ocr_results)
    lines = [l.strip() for l in full_text.split("\n") if l.strip()]
    
    # Account Number
    patterns = [
        r"(?:Account\s*(?:No|Number|#)|A/C\s*No|A\.C\.\s*No)[:\s.]*(\d[\d\s]{7,17}\d)",
        r"\b(\d{9,18})\b",
    ]
    for pattern in patterns:
        m = re.search(pattern, full_text, re.I)
        if m:
            acc = re.sub(r"\s", "", m.group(1))
            if len(acc) >= 9:
                data["account_number"] = acc
                break
    
    # IFSC
    m = re.search(r"\b([A-Z]{4}0[A-Z0-9]{6})\b", full_text.upper())
    if m:
        data["ifsc_code"] = m.group(1)
    
    # Bank Name
    bank_keywords = {
        "STATE BANK OF INDIA": "State Bank of India", "SBI": "State Bank of India",
        "HDFC": "HDFC Bank", "ICICI": "ICICI Bank", "AXIS": "Axis Bank",
        "CANARA": "Canara Bank", "PUNJAB NATIONAL": "Punjab National Bank",
        "BANK OF BARODA": "Bank of Baroda", "UNION BANK": "Union Bank of India",
        "KOTAK": "Kotak Mahindra Bank", "YES BANK": "Yes Bank",
        "IDBI": "IDBI Bank", "INDIAN BANK": "Indian Bank",
        "CENTRAL BANK": "Central Bank of India", "UCO BANK": "UCO Bank",
        "FEDERAL BANK": "Federal Bank", "BANK OF INDIA": "Bank of India",
    }
    upper = full_text.upper()
    for keyword, name in bank_keywords.items():
        if keyword in upper:
            data["bank_name"] = name
            break
    
    # Branch
    m = re.search(r"(?:Branch|शाखा)[:\s]+([A-Za-z\s,]{3,50})", full_text, re.I)
    if m:
        data["bank_branch"] = m.group(1).strip()
    
    # Account Holder Name
    for i, line in enumerate(lines):
        if re.search(r"Account\s*Holder|A/C\s*Holder|Name\s*:", line, re.I):
            if i + 1 < len(lines):
                data["full_name"] = lines[i + 1].strip()
                break
    
    return data

# ── Validation ─────────────────────────────────────────────────────────────
def validate_and_clean(data: Dict[str, str]) -> Dict[str, str]:
    """Validate and clean extracted fields."""
    validated = {}
    
    for key, value in data.items():
        if not value or value.strip() == "":
            continue
        
        value = value.strip()
        
        if key == "aadhar_number":
            aadhar = re.sub(r"\D", "", value)
            if len(aadhar) == 12 and aadhar[0] in "23456789":
                validated[key] = aadhar
        elif key == "pan_number":
            pan = value.upper().replace(" ", "")
            if re.match(r"^[A-Z]{5}\d{4}[A-Z]$", pan):
                validated[key] = pan
        elif key == "ifsc_code":
            ifsc = value.upper().replace(" ", "")
            if re.match(r"^[A-Z]{4}0[A-Z0-9]{6}$", ifsc):
                validated[key] = ifsc
        elif key == "dob":
            if re.match(r"^\d{2}/\d{2}/\d{4}$", value) or re.match(r"^\d{4}$", value):
                validated[key] = value
        elif key == "pincode":
            pin = re.sub(r"\D", "", value)
            if len(pin) == 6 and pin[0] != "0":
                validated[key] = pin
        elif key == "phone":
            phone = re.sub(r"\D", "", value)
            if len(phone) == 10 and phone[0] in "6789":
                validated[key] = phone
        elif key == "gender":
            g = value.lower()
            if any(x in g for x in ["male", "purush"]):
                validated[key] = "Male"
            elif any(x in g for x in ["female", "mahila", "stree"]):
                validated[key] = "Female"
        else:
            cleaned = re.sub(r"\s+", " ", value).strip()
            if len(cleaned) >= 2:
                validated[key] = cleaned
    
    return validated

# ── openbharatocr Integration ──────────────────────────────────────────────
def run_openbharat_aadhaar(image_bytes: bytes) -> Dict[str, str]:
    """Use openbharatocr if available for better Aadhaar extraction."""
    if not OPENBHARAT_AVAILABLE:
        return {}
    
    try:
        # Save image to temp file for openbharatocr
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name
        
        # Try front extraction
        front_data = ocr_aadhaar_front(tmp_path)
        back_data = ocr_aadhaar_back(tmp_path)
        
        # Clean up
        os.unlink(tmp_path)
        
        # Map openbharatocr fields to our format
        result = {}
        if front_data:
            if 'name' in front_data:
                result['full_name'] = front_data['name']
            if 'aadhaar_number' in front_data:
                result['aadhar_number'] = front_data['aadhaar_number']
            if 'dob' in front_data:
                result['dob'] = front_data['dob']
            if 'gender' in front_data:
                result['gender'] = front_data['gender']
        
        if back_data:
            if 'address' in back_data:
                result['address'] = back_data['address']
            if 'father_name' in back_data:
                result['father_name'] = back_data['father_name']
        
        return result
    except Exception as e:
        print(f"[OCR-PY] openbharatocr error: {e}", flush=True)
        return {}

# ── Main Process ───────────────────────────────────────────────────────────
def process_document(image_bytes: bytes, doc_type: str) -> Dict:
    if doc_type == "photo":
        return {}

    try:
        print(f"[OCR-PY] Processing {doc_type} document...", flush=True)

        # ── Try openbharatocr first for Aadhaar ──────────────────────────────
        if doc_type == "aadhar" and OPENBHARAT_AVAILABLE:
            print("[OCR-PY] Trying openbharatocr...", flush=True)
            ob_result = run_openbharat_aadhaar(image_bytes)
            if ob_result and any(v for v in ob_result.values()):
                print(f"[OCR-PY] openbharatocr result: {list(ob_result.keys())}", flush=True)
                # Validate and return openbharatocr result
                validated = validate_and_clean(ob_result)
                validated["_source"] = "openbharatocr"
                # Still get raw text from EasyOCR for debugging
                ocr_results, img_width, img_height = run_easyocr_layout(image_bytes)
                validated["_raw_text"] = build_text_from_results(ocr_results)[:2000]
                return validated
            else:
                print("[OCR-PY] openbharatocr returned empty, falling back to EasyOCR", flush=True)

        # Step 1: Layout-aware OCR
        print("[OCR-PY] Running EasyOCR with layout...", flush=True)
        ocr_results, img_width, img_height = run_easyocr_layout(image_bytes)
        
        print(f"[OCR-PY] Image dimensions: {img_width}x{img_height}", flush=True)
        print(f"[OCR-PY] Extracted {len(ocr_results)} text regions", flush=True)

        # Step 2: Field Extraction based on document type
        print("[OCR-PY] Extracting fields with line classifier...", flush=True)
        if doc_type == "aadhar":
            # Try line classifier first (no ROI splitting)
            extracted = extract_aadhar_line_classifier(ocr_results, img_width, img_height)
            
            # If line classifier failed, fallback to old ROI method
            has_data = any(v not in (None, "", "NA") for v in extracted.values())
            if not has_data:
                print("[OCR-PY] Line classifier returned empty, falling back to ROI method", flush=True)
                extracted = extract_aadhar_dynamic(ocr_results, img_width, img_height)
        elif doc_type == "pan":
            extracted = extract_pan_fields(ocr_results, img_width, img_height)
        elif doc_type == "bank":
            extracted = extract_bank_fields(ocr_results, img_width, img_height)
        else:
            extracted = {}

        # Step 3: Validation
        print("[OCR-PY] Validating fields...", flush=True)
        validated = validate_and_clean(extracted)

        # Build raw text for debugging
        full_text = build_text_from_results(ocr_results)
        
        # Add metadata
        validated["_source"] = "easyocr-dynamic-roi"
        validated["_raw_text"] = full_text[:2000]

        print(f"[OCR-PY] Final fields: {list(validated.keys())}", flush=True)
        for k, v in validated.items():
            if not k.startswith("_"):
                print(f"  {k}: {v[:50] if len(v) > 50 else v}", flush=True)

        return validated

    except Exception as e:
        print(f"[OCR-PY] Error: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return {"error": str(e), "_source": "error", "_raw_text": ""}

# ── HTTP Server ──────────────────────────────────────────────────────────────
class OCRHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_POST(self):
        if self.path != "/ocr":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        try:
            payload = json.loads(body)
            image_b64 = payload.get("image_base64", "")
            doc_type = payload.get("doc_type", "aadhar")

            if "," in image_b64:
                image_b64 = image_b64.split(",")[1]
            image_bytes = base64.b64decode(image_b64)

            result = process_document(image_bytes, doc_type)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))

        except Exception as e:
            print(f"[OCR-PY] Request error: {e}", flush=True)
            import traceback
            traceback.print_exc()
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

def run_server(port=5001):
    server = http.server.HTTPServer(("127.0.0.1", port), OCRHandler)
    print(f"[OCR-PY] Dynamic ROI OCR pipeline listening on port {port}", flush=True)
    server.serve_forever()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
    # Pre-load EasyOCR model
    try:
        get_reader()
        print("[OCR-PY] Model pre-loaded successfully.", flush=True)
    except Exception as e:
        print(f"[OCR-PY] Pre-load warning: {e}", flush=True)
    run_server(port)