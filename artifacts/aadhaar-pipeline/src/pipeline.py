"""
Main Aadhaar extraction pipeline.
Orchestrates YOLO detection, OCR, and text extraction.
"""

import cv2
import numpy as np
import os
from typing import Dict, Any

from config import AADHAAR_CROP_EXPANSION, PHOTO_CROP_EXPANSION, DOB_QUALITY_RANK
from yolo_detector import YOLODetector
from ocr_engine import OCREngine
from extractors import (parse_photo_area, parse_address_block, 
                        validate_name, DOB_QUALITY_RANK)
from utils import crop_region
from preprocess import detect_format_from_image, preprocess_scanned_image


class AadhaarPipeline:
    def __init__(self, use_gpu: bool = False):
        self.detector = YOLODetector()
        self.ocr = OCREngine(use_gpu=use_gpu)
        print("✅ AadhaarPipeline initialized")
    
    def extract(self, image_path: str, conf_threshold: float = 0.3,
                preprocess: bool = True) -> Dict[str, Any]:
        """
        Full extraction pipeline.
        
        Args:
            image_path: Path to image file
            conf_threshold: YOLO confidence threshold
            preprocess: Whether to apply scanner preprocessing
        
        Returns:
            Dict with all extracted fields and quality info
        """
        # Detect format
        is_pvc = detect_format_from_image(image_path) == 'pvc'
        card_format = 'pvc' if is_pvc else 'letter'
        
        # Preprocess if requested (for real scans)
        if preprocess:
            print("🔧 Preprocessing scanned image...")
            processed_path = f"/tmp/preprocessed_{os.path.basename(image_path)}"
            image = preprocess_scanned_image(image_path, processed_path, card_format)
            image_path = processed_path
        else:
            image = cv2.imread(image_path)
            if image is None:
                return {"error": f"Cannot load image: {image_path}"}
        
        # Initialize result
        result = {
            "image": os.path.basename(image_path),
            "format": card_format,
            "aadhaar_number": "",
            "name": "",
            "dob": "",
            "gender": "",
            "address": "",
            "nominee": "",
            "pincode": "",
            "mobile": "",
            "quality": {},
            "confidence": {},
            "preprocessed": preprocess
        }
        
        # Stage 1 detection
        stage1 = self.detector.detect_stage1(image, conf_threshold)
        
        # Extract Aadhaar
        if stage1['aadhaar']:
            expansions = AADHAAR_CROP_EXPANSION[card_format]
            aadhaar_crop = crop_region(
                image, stage1['aadhaar'],
                expand_left_pct=expansions['left'],
                expand_right_pct=expansions['right'],
                expand_top_pct=expansions['top'],
                expand_bottom_pct=expansions['bottom']
            )
            
            if aadhaar_crop.size > 0:
                aadhaar_num, status, source = self.ocr.extract_aadhaar_robust(
                    aadhaar_crop, is_pvc=is_pvc
                )
                result["aadhaar_number"] = aadhaar_num
                result["quality"]["aadhaar_number"] = status
                result["quality"]["aadhaar_source"] = source
                
                # Wider crop fallback
                if status == 'not_found':
                    print(f"    ⚠️  Aadhaar not found, trying wider crop...")
                    wider_crop = crop_region(
                        image, stage1['aadhaar'],
                        expand_left_pct=0.25, expand_right_pct=0.25,
                        expand_top_pct=0.30, expand_bottom_pct=0.30
                    )
                    if wider_crop.size > 0:
                        aadhaar_num2, status2, source2 = self.ocr.extract_aadhaar_robust(
                            wider_crop, is_pvc=is_pvc
                        )
                        if status2 != 'not_found':
                            result["aadhaar_number"] = aadhaar_num2
                            result["quality"]["aadhaar_number"] = status2
                            result["quality"]["aadhaar_source"] = f"wider_{source2}"
                            print(f"    ✅ Wider crop succeeded: {status2}")
        
        # Extract Name/DOB/Gender from photo area
        if stage1['photo']:
            expansions = PHOTO_CROP_EXPANSION[card_format]
            photo_crop = crop_region(
                image, stage1['photo'],
                expand_right_pct=expansions['right'],
                expand_left_pct=expansions['left']
            )
            photo_lines = self.ocr.run_ocr_multiscale(photo_crop, max_scale=5)
            name, dob, dob_quality, gender = parse_photo_area(photo_lines)
            
            # Retry with larger crop if name is short
            if validate_name(name) == 'short':
                print(f"    🔄 Name '{name}' short — retrying with larger crop...")
                if is_pvc:
                    r_pct2, l_pct2 = 0.50, 0.10
                else:
                    r_pct2, l_pct2 = 0.80, 0.15
                
                photo_crop2 = crop_region(
                    image, stage1['photo'],
                    expand_right_pct=r_pct2, expand_left_pct=l_pct2
                )
                photo_lines2 = self.ocr.run_ocr_multiscale(photo_crop2, max_scale=5)
                name2, dob2, dob_quality2, gender2 = parse_photo_area(photo_lines2)
                
                if validate_name(name2) != 'short' or len(name2) > len(name):
                    print(f"    ✅ Retry improved name: '{name}' → '{name2}'")
                    name = name2
                    gender = gender2 or gender
                
                if DOB_QUALITY_RANK[dob_quality2] < DOB_QUALITY_RANK[dob_quality]:
                    dob = dob2
                    dob_quality = dob_quality2
            
            result["name"] = name
            result["dob"] = dob
            result["gender"] = gender
            result["quality"]["name"] = validate_name(name)
            result["quality"]["dob"] = dob_quality
            result["quality"]["gender"] = "ok" if gender else "missing"
        
        # Extract Address/Nominee/Pincode/Mobile
        if stage1['address']:
            address_crop = crop_region(image, stage1['address'])
            if address_crop.size > 0:
                full_address_text = self.ocr.run_ocr(address_crop, enhance=False)
                print(f"    📋 Raw OCR: {full_address_text[:130]}...")
                
                # Stage 2 detection
                stage2 = self.detector.detect_stage2(address_crop)
                result["confidence"].update(stage2['confidence'])
                
                address, nominee, pincode, mobile, addr_quality = parse_address_block(
                    full_address_text
                )
                
                result["address"] = address
                result["nominee"] = nominee
                result["pincode"] = pincode
                result["mobile"] = mobile
                result["quality"].update({
                    "address_nominee": addr_quality.get('nominee', 'not_found'),
                    "address_pincode": addr_quality.get('pincode', 'not_found'),
                    "address_mobile": addr_quality.get('mobile', 'not_found'),
                })
        
        # Add stage 1 confidence
        result["confidence"].update(stage1['confidence'])
        
        return result
    
    def extract_from_array(self, image_array: np.ndarray, 
                           conf_threshold: float = 0.3) -> Dict[str, Any]:
        """Extract from numpy array (for API use)."""
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
            cv2.imwrite(f.name, image_array)
            result = self.extract(f.name, conf_threshold, preprocess=False)
            os.unlink(f.name)
            return result


# Singleton instance
_pipeline = None

def get_pipeline() -> AadhaarPipeline:
    """Get or create pipeline singleton."""
    global _pipeline
    if _pipeline is None:
        _pipeline = AadhaarPipeline(use_gpu=False)
    return _pipeline