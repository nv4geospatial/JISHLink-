"""
Scanner preprocessing module.
Converts real scanned images to match synthetic training dimensions.
"""

import cv2
import numpy as np
from pathlib import Path

from config import TRAIN_SIZES


def detect_card_edges(image: np.ndarray) -> tuple:
    """
    Detect card edges in scanned image and return bounding box.
    Handles white background scans where card is the main object.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Method 1: Threshold for white background
    _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
    
    # Find contours
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return None
    
    # Find largest contour (the card)
    largest = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(largest)
    
    # Filter: must be reasonable card size (not noise)
    img_h, img_w = image.shape[:2]
    if w < img_w * 0.3 or h < img_h * 0.3:
        return None  # Too small, probably noise
    
    return (x, y, x+w, y+h)


def perspective_correct_card(image: np.ndarray, bbox: tuple) -> np.ndarray:
    """
    If card is tilted, apply perspective correction.
    Returns flattened card image.
    """
    x1, y1, x2, y2 = bbox
    # For now, assume scanner produces flat images
    # If needed, add corner detection + homography here
    return image[y1:y2, x1:x2]


def normalize_to_training_size(image: np.ndarray, card_format: str = 'letter') -> np.ndarray:
    """
    Resize scanned card to match synthetic training dimensions.
    This is the KEY function — makes real images look like training data.
    """
    target_h, target_w = TRAIN_SIZES[card_format]
    
    # Resize with padding to preserve aspect ratio
    h, w = image.shape[:2]
    aspect = w / h
    target_aspect = target_w / target_h
    
    if aspect > target_aspect:
        # Image is wider — fit width, pad height
        new_w = target_w
        new_h = int(target_w / aspect)
    else:
        # Image is taller — fit height, pad width
        new_h = target_h
        new_w = int(target_h * aspect)
    
    # Resize
    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    
    # Create canvas with training size and paste resized image centered
    canvas = np.full((target_h, target_w, 3), 255, dtype=np.uint8)  # White background
    y_offset = (target_h - new_h) // 2
    x_offset = (target_w - new_w) // 2
    canvas[y_offset:y_offset+new_h, x_offset:x_offset+new_w] = resized
    
    return canvas


def apply_synthetic_like_filters(image: np.ndarray) -> np.ndarray:
    """
    Apply subtle filters to make real scan look like synthetic training data.
    NOT heavy distortion — just normalization.
    """
    # Slight Gaussian blur (synthetic images have anti-aliasing)
    blurred = cv2.GaussianBlur(image, (3, 3), 0.5)
    
    # Normalize brightness (synthetic images have consistent lighting)
    lab = cv2.cvtColor(blurred, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_norm = clahe.apply(l)
    normalized = cv2.merge([l_norm, a, b])
    normalized = cv2.cvtColor(normalized, cv2.COLOR_LAB2BGR)
    
    return normalized


def preprocess_scanned_image(image_path: str, output_path: str = None, 
                              card_format: str = 'letter') -> np.ndarray:
    """
    FULL preprocessing pipeline for scanner output.
    Call this BEFORE extract_aadhaar_info().
    """
    # Load image
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Cannot load: {image_path}")
    
    print(f"📄 Original: {image.shape[1]}x{image.shape[0]}")
    
    # Step 1: Detect card edges
    bbox = detect_card_edges(image)
    if bbox:
        print(f"   ✅ Card detected: {bbox}")
        card = perspective_correct_card(image, bbox)
    else:
        print("   ⚠️  Card not detected — using full image")
        card = image.copy()
    
    # Step 2: Normalize to training size
    normalized = normalize_to_training_size(card, card_format)
    print(f"   📐 Resized to: {normalized.shape[1]}x{normalized.shape[0]} (training size)")
    
    # Step 3: Apply synthetic-like filters
    filtered = apply_synthetic_like_filters(normalized)
    print(f"   🔧 Filters applied")
    
    # Save if output path given
    if output_path:
        cv2.imwrite(output_path, filtered)
        print(f"   💾 Saved: {output_path}")
    
    return filtered


def detect_format_from_image(image_path: str) -> str:
    """Detect if image is Letter or PVC format from aspect ratio."""
    image = cv2.imread(image_path)
    if image is None:
        return 'letter'  # Default
    
    h, w = image.shape[:2]
    aspect = w / h
    
    # PVC is wider than letter
    return 'pvc' if aspect > 1.3 else 'letter'