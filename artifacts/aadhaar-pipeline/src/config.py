"""
Configuration for Aadhaar OCR Pipeline.
All paths and thresholds centralized.
"""

import os
from pathlib import Path
import re
import os

# Base paths
BASE_DIR = Path(__file__).parent.parent
MODELS_DIR = BASE_DIR / "models"
TEMPLATES_DIR = BASE_DIR / "templates"
INPUT_DIR = BASE_DIR / "input"
OUTPUT_DIR = BASE_DIR / "output"

# Ensure directories exist
for d in [INPUT_DIR, OUTPUT_DIR, TEMPLATES_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Model paths
STAGE1_MODEL_PATH = MODELS_DIR / "stage1" / "best.pt"
STAGE2_MODEL_PATH = MODELS_DIR / "stage2" / "best.pt"

# Template paths (optional - for fallback)
BLANK_LETTER_TEMPLATE = TEMPLATES_DIR / "blank_letter_template.jpg"
BLANK_PVC_TEMPLATE = TEMPLATES_DIR / "blank_pvc_template.jpg"

# Training dimensions from synthetic data
TRAIN_SIZES = {
    'letter': (640, 576),   # (height, width)
    'pvc': (248, 203),      # (height, width)
}

# OCR thresholds
OCR_CONFIDENCE_THRESHOLD = 0.3
OCR_REC_SCORE_THRESHOLD = 0.4

# Quality check thresholds
QUALITY_THRESHOLDS = {
    'blur_min': 80,
    'blur_max': 5000,
    'brightness_min': 30,
    'brightness_max': 250,
    'rotation_max_deg': 15,
    'contrast_min': 20,
    'glare_max_pct': 5.0,
    'resolution_min_letter': 600,
    'resolution_min_pvc': 350,
}

# Aadhaar-specific crop expansions
AADHAAR_CROP_EXPANSION = {
    'letter': {
        'left': 0.08,
        'right': 0.08,
        'top': 0.15,
        'bottom': 0.15,
    },
    'pvc': {
        'left': 0.10,
        'right': 0.10,
        'top': 0.10,
        'bottom': 0.35,
    }
}

# Photo area crop expansions
PHOTO_CROP_EXPANSION = {
    'letter': {'right': 0.60, 'left': 0.10},
    'pvc': {'right': 0.35, 'left': 0.05}
}

# DOB extraction patterns
DOB_PATTERNS = [
    (r'\b(\d{2}[/-]\d{2}[/-]\d{4})\b', 'full'),
    (r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b', 'full'),
    (r'\b(\d{2}[/-]\d{2}[/-]\d{2})\b', 'partial'),
    (r'(?:[Dd][O0][Bb]\s*[:/]?\s*)?(\d{2}[/-]?\d{2}[/-]?\d{4})', 'full'),
    (r'(?:[Dd][O0][Bb]\s*[:/]?\s*)?(\d{2}[/-]\d{2}[/-]\d{4})', 'full'),
    (r'\b(\d{8})\b', 'full'),
    (r'\b(\d{2})\s*(\d{2})\s*(\d{4})\b', 'full'),
    (r'\b(\d{4})\b', 'year_only'),
]

# Gender keywords
GENDER_KEYWORDS = [
    ('FEMALE', 'Female'),
    ('MALE', 'Male'),
    ('TRANSGENDER', 'Transgender'),
]

# DOB quality ranking
DOB_QUALITY_RANK = {'full': 0, 'partial': 1, 'year_only': 2, 'missing': 3}

# Base paths
BASE_DIR = Path(__file__).parent.parent
MODELS_DIR = BASE_DIR / "models"
TEMPLATES_DIR = BASE_DIR / "templates"
INPUT_DIR = BASE_DIR / "input"
OUTPUT_DIR = BASE_DIR / "output"

# Ensure directories exist
for d in [INPUT_DIR, OUTPUT_DIR, TEMPLATES_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Model paths
STAGE1_MODEL_PATH = MODELS_DIR / "stage1" / "best.pt"
STAGE2_MODEL_PATH = MODELS_DIR / "stage2" / "best.pt"

# Template paths (optional - for fallback)
BLANK_LETTER_TEMPLATE = TEMPLATES_DIR / "blank_letter_template.jpg"
BLANK_PVC_TEMPLATE = TEMPLATES_DIR / "blank_pvc_template.jpg"

# Training dimensions from synthetic data
TRAIN_SIZES = {
    'letter': (640, 576),   # (height, width)
    'pvc': (248, 203),      # (height, width)
}

# OCR thresholds
OCR_CONFIDENCE_THRESHOLD = 0.3
OCR_REC_SCORE_THRESHOLD = 0.4

# Quality check thresholds
QUALITY_THRESHOLDS = {
    'blur_min': 80,
    'blur_max': 5000,
    'brightness_min': 30,
    'brightness_max': 250,
    'rotation_max_deg': 15,
    'contrast_min': 20,
    'glare_max_pct': 5.0,  # Real scans, not synthetic
    'resolution_min_letter': 600,
    'resolution_min_pvc': 350,
}

# Aadhaar-specific crop expansions
AADHAAR_CROP_EXPANSION = {
    'letter': {
        'left': 0.08,
        'right': 0.08,
        'top': 0.15,
        'bottom': 0.15,
    },
    'pvc': {
        'left': 0.10,
        'right': 0.10,
        'top': 0.10,
        'bottom': 0.35,  # More bottom expansion for PVC
    }
}

# Photo area crop expansions
PHOTO_CROP_EXPANSION = {
    'letter': {'right': 0.60, 'left': 0.10},
    'pvc': {'right': 0.35, 'left': 0.05}
}

# API settings
API_HOST = os.getenv("OCR_API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("OCR_API_PORT", "8002"))
API_UPLOAD_DIR = INPUT_DIR

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")