"""
Utility functions for image processing and text extraction.
"""

import cv2
import numpy as np
import re


def crop_region(image: np.ndarray, bbox: list, 
                expand_right_pct: float = 0.0, 
                expand_left_pct: float = 0.0,
                expand_top_pct: float = 0.0, 
                expand_bottom_pct: float = 0.0) -> np.ndarray:
    """Crop image region from YOLO bbox. All expansions clamped to image bounds."""
    h, w = image.shape[:2]
    x1, y1, x2, y2 = map(int, bbox)
    crop_w = x2 - x1
    crop_h = y2 - y1

    x1 = x1 - int(crop_w * expand_left_pct)
    x2 = x2 + int(crop_w * expand_right_pct)
    y1 = y1 - int(crop_h * expand_top_pct)
    y2 = y2 + int(crop_h * expand_bottom_pct)

    x1 = max(0, x1)
    y1 = max(0, y1)
    x2 = min(w, x2)
    y2 = min(h, y2)

    return image[y1:y2, x1:x2]


def enhance_for_ocr(image_crop: np.ndarray, mode: str = 'standard') -> np.ndarray:
    """
    CLAHE + bilateral filter + unsharp mask for better OCR contrast.
    mode='standard': normal enhancement
    mode='faint': aggressive enhancement for faint text
    """
    if image_crop is None or image_crop.size == 0:
        return image_crop

    if mode == 'faint':
        lab = cv2.cvtColor(image_crop, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=5.0, tileGridSize=(4, 4))
        l_enhanced = clahe.apply(l)
        l_enhanced = np.power(l_enhanced / 255.0, 0.6) * 255
        l_enhanced = l_enhanced.astype(np.uint8)
        enhanced = cv2.merge([l_enhanced, a, b])
        enhanced = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
        enhanced = cv2.bilateralFilter(enhanced, d=5, sigmaColor=50, sigmaSpace=50)
        gaussian = cv2.GaussianBlur(enhanced, (0, 0), 2.0)
        return cv2.addWeighted(enhanced, 1.5, gaussian, -0.5, 0)
    else:
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        if len(image_crop.shape) == 3 and image_crop.shape[2] == 3:
            lab = cv2.cvtColor(image_crop, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            l_enhanced = clahe.apply(l)
            enhanced = cv2.merge([l_enhanced, a, b])
            enhanced = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
            enhanced = cv2.bilateralFilter(enhanced, d=5, sigmaColor=50, sigmaSpace=50)
            gaussian = cv2.GaussianBlur(enhanced, (0, 0), 2.0)
            return cv2.addWeighted(enhanced, 1.5, gaussian, -0.5, 0)
        else:
            enhanced = clahe.apply(image_crop)
            enhanced = cv2.bilateralFilter(enhanced, d=5, sigmaColor=50, sigmaSpace=50)
            gaussian = cv2.GaussianBlur(enhanced, (0, 0), 2.0)
            return cv2.addWeighted(enhanced, 1.5, gaussian, -0.5, 0)


def upscale_for_ocr(image_crop: np.ndarray, scale: int = 2) -> np.ndarray:
    """Upscale image by given factor using INTER_CUBIC."""
    if image_crop is None or image_crop.size == 0:
        return image_crop
    h, w = image_crop.shape[:2]
    return cv2.resize(image_crop, (int(w * scale), int(h * scale)),
                      interpolation=cv2.INTER_CUBIC)


def preprocess_for_ocr(image_crop: np.ndarray) -> np.ndarray:
    """Resize tiny crops and convert to RGB for PaddleOCR."""
    if image_crop is None or image_crop.size == 0:
        return None
    h, w = image_crop.shape[:2]
    if h < 32 or w < 32:
        scale = max(64 / h, 64 / w)
        image_crop = cv2.resize(image_crop, (int(w * scale), int(h * scale)),
                                interpolation=cv2.INTER_CUBIC)
    if len(image_crop.shape) == 3 and image_crop.shape[2] == 3:
        return cv2.cvtColor(image_crop, cv2.COLOR_BGR2RGB)
    return image_crop


def split_camel_case(text: str) -> str:
    return re.sub(r'([a-z])([A-Z])', r'\1 \2', text)


def fix_merged_tokens(text: str) -> str:
    return re.sub(r'(\d)([A-Za-z])', r'\1 \2', text)


def strip_leading_name_from_address(address: str) -> str:
    address_start_pattern = re.compile(
        r'^\d|^H\.No|^No\.|^Plot|^Flat|^Door|^#|^[A-Z]-\d', re.IGNORECASE
    )
    tokens = address.split()
    while tokens:
        if address_start_pattern.match(tokens[0]):
            break
        if re.search(r'\d', tokens[0]):
            break
        tokens.pop(0)
    return ' '.join(tokens)