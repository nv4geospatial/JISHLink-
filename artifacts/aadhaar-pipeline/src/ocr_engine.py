"""
PaddleOCR wrapper with multi-scale and Tesseract fallback.
"""

import os
import re
import cv2
import numpy as np
from paddleocr import PaddleOCR

from utils import enhance_for_ocr, upscale_for_ocr, preprocess_for_ocr
from verhoeff import extract_aadhaar_with_validation

# Suppress PaddleOCR logging
os.environ['PADDLE_WITH_CUDA'] = '0'
os.environ['CUDA_VISIBLE_DEVICES'] = ''


class OCREngine:
    def __init__(self, use_gpu: bool = False):
        self.ocr = PaddleOCR(
            use_angle_cls=True,
            lang='en',
            det_limit_side_len=1280,
            det_db_thresh=0.3,
            rec_score_thres=0.4,
            show_log=False,
            use_gpu=use_gpu
        )
        
        # Try to load Tesseract as fallback
        self.tesseract_available = False
        try:
            import pytesseract
            self.tesseract_available = True
            self.pytesseract = pytesseract
            print("✅ Tesseract available as fallback")
        except ImportError:
            print("⚠️  Tesseract not available")
    
    def run_ocr(self, image_crop: np.ndarray, enhance: bool = False, 
                enhance_mode: str = 'standard', aadhaar_mode: bool = False) -> str:
        """Run PaddleOCR on a crop. Returns joined text string."""
        if enhance:
            image_crop = enhance_for_ocr(image_crop, mode=enhance_mode)
        
        if aadhaar_mode and image_crop is not None and image_crop.size > 0:
            if len(image_crop.shape) == 3:
                gray = cv2.cvtColor(image_crop, cv2.COLOR_BGR2GRAY)
            else:
                gray = image_crop
            _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            image_crop = cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR)
        
        rgb_crop = preprocess_for_ocr(image_crop)
        if rgb_crop is None:
            return ""
        
        try:
            result = self.ocr.ocr(rgb_crop, cls=True)
            if result and result[0]:
                return ' '.join(line[1][0] for line in result[0] if line).strip()
        except Exception as e:
            print(f"    ⚠️  OCR error: {str(e)[:200]}")
        return ""
    
    def run_ocr_with_boxes(self, image_crop: np.ndarray, enhance: bool = False,
                           enhance_mode: str = 'standard') -> list:
        """Run PaddleOCR and return per-line dicts sorted by center_y."""
        if enhance:
            image_crop = enhance_for_ocr(image_crop, mode=enhance_mode)
        
        rgb_crop = preprocess_for_ocr(image_crop)
        if rgb_crop is None:
            return []
        
        try:
            result = self.ocr.ocr(rgb_crop, cls=True)
            if result and result[0]:
                lines = []
                for line in result[0]:
                    if not line:
                        continue
                    bbox = line[0]
                    text = line[1][0]
                    conf = line[1][1]
                    center_y = (bbox[0][1] + bbox[2][1]) / 2
                    center_x = (bbox[0][0] + bbox[2][0]) / 2
                    lines.append({
                        'text': text, 'bbox': bbox,
                        'center_y': center_y, 'center_x': center_x, 'conf': conf
                    })
                lines.sort(key=lambda x: x['center_y'])
                return lines
        except Exception as e:
            print(f"    ⚠️  OCR error: {str(e)[:200]}")
        return []
    
    def run_ocr_multiscale(self, image_crop: np.ndarray, max_scale: int = 5) -> list:
        """
        Run OCR at 1×, 2×, 3×, 4×, 5× scales.
        Merge results by spatial cluster.
        """
        Y_BUCKET_PX = 12
        all_lines = []
        
        for scale in range(1, max_scale + 1):
            crop_to_use = image_crop if scale == 1 else upscale_for_ocr(image_crop, scale)
            lines = self.run_ocr_with_boxes(crop_to_use, enhance=True)
            for line in lines:
                line_copy = dict(line)
                line_copy['center_y'] = line['center_y'] / scale
                line_copy['center_x'] = line['center_x'] / scale
                all_lines.append(line_copy)
        
        if not all_lines:
            return []
        
        all_lines.sort(key=lambda x: x['center_y'])
        
        clusters = []
        current_cluster = [all_lines[0]]
        
        for line in all_lines[1:]:
            if abs(line['center_y'] - current_cluster[-1]['center_y']) <= Y_BUCKET_PX:
                current_cluster.append(line)
            else:
                clusters.append(current_cluster)
                current_cluster = [line]
        clusters.append(current_cluster)
        
        canonical = []
        for cluster in clusters:
            best = max(cluster, key=lambda l: (len(l['text']), l['conf']))
            canonical.append(best)
        
        canonical.sort(key=lambda x: x['center_y'])
        return canonical
    
    def run_tesseract_ocr(self, image_crop: np.ndarray) -> str:
        """Tesseract fallback for Aadhaar validation failures."""
        if not self.tesseract_available or image_crop is None or image_crop.size == 0:
            return ""
        
        try:
            from PIL import Image as PILImage
            
            if len(image_crop.shape) == 3 and image_crop.shape[2] == 3:
                gray = cv2.cvtColor(image_crop, cv2.COLOR_BGR2GRAY)
            else:
                gray = image_crop
            
            _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            pil_img = PILImage.fromarray(thresh)
            
            custom_config = r'--oem 3 --psm 7 -c tessedit_char_whitelist=0123456789'
            text = self.pytesseract.image_to_string(pil_img, config=custom_config)
            
            if not re.search(r'\d{11,}', text):
                custom_config_psm6 = r'--oem 3 --psm 6 -c tessedit_char_whitelist=0123456789'
                text_psm6 = self.pytesseract.image_to_string(pil_img, config=custom_config_psm6)
                if re.search(r'\d{11,}', text_psm6):
                    text = text_psm6
            
            return text.strip()
        except Exception as e:
            print(f"    ⚠️  Tesseract error: {str(e)[:100]}")
            return ""
    
    def extract_aadhaar_robust(self, aadhaar_crop: np.ndarray, is_pvc: bool = False) -> tuple:
        """
        Multi-read consensus for Aadhaar with Verhoeff validation.
        Try multiple enhancement modes and scales, validate each, pick best.
        """
        candidates = []
        
        # Read 1: Standard enhancement with Aadhaar-specific preprocessing
        text1 = self.run_ocr(aadhaar_crop, enhance=True, enhance_mode='standard', aadhaar_mode=True)
        aadhaar1, status1 = extract_aadhaar_with_validation(text1)
        if status1 == 'valid':
            return aadhaar1, 'valid', 'paddle_standard'
        candidates.append((aadhaar1, status1, 'paddle_standard'))
        
        # Read 2: Faint-text enhancement
        text2 = self.run_ocr(aadhaar_crop, enhance=True, enhance_mode='faint')
        aadhaar2, status2 = extract_aadhaar_with_validation(text2)
        if status2 == 'valid':
            return aadhaar2, 'valid', 'paddle_faint'
        candidates.append((aadhaar2, status2, 'paddle_faint'))
        
        # Read 3: Upscaled 2×
        upscaled_2x = upscale_for_ocr(aadhaar_crop, 2)
        text3 = self.run_ocr(upscaled_2x, enhance=True, enhance_mode='standard')
        aadhaar3, status3 = extract_aadhaar_with_validation(text3)
        if status3 == 'valid':
            return aadhaar3, 'valid', 'paddle_2x'
        candidates.append((aadhaar3, status3, 'paddle_2x'))
        
        # Read 4: Upscaled 3× with faint
        upscaled_3x = upscale_for_ocr(aadhaar_crop, 3)
        text4 = self.run_ocr(upscaled_3x, enhance=True, enhance_mode='faint')
        aadhaar4, status4 = extract_aadhaar_with_validation(text4)
        if status4 == 'valid':
            return aadhaar4, 'valid', 'paddle_3x_faint'
        candidates.append((aadhaar4, status4, 'paddle_3x_faint'))
        
        # Read 5: Upscaled 4×
        upscaled_4x = upscale_for_ocr(aadhaar_crop, 4)
        text5 = self.run_ocr(upscaled_4x, enhance=True, enhance_mode='standard')
        aadhaar5, status5 = extract_aadhaar_with_validation(text5)
        if status5 == 'valid':
            return aadhaar5, 'valid', 'paddle_4x'
        candidates.append((aadhaar5, status5, 'paddle_4x'))
        
        # Read 6: Upscaled 5× with faint
        upscaled_5x = upscale_for_ocr(aadhaar_crop, 5)
        text6 = self.run_ocr(upscaled_5x, enhance=True, enhance_mode='faint')
        aadhaar6, status6 = extract_aadhaar_with_validation(text6)
        if status6 == 'valid':
            return aadhaar6, 'valid', 'paddle_5x_faint'
        candidates.append((aadhaar6, status6, 'paddle_5x_faint'))
        
        # Tesseract fallback
        if self.tesseract_available:
            text_tess = self.run_tesseract_ocr(aadhaar_crop)
            aadhaar_tess, status_tess = extract_aadhaar_with_validation(text_tess)
            if status_tess == 'valid':
                return aadhaar_tess, 'valid', 'tesseract'
            candidates.append((aadhaar_tess, status_tess, 'tesseract'))
            
            text_tess_3x = self.run_tesseract_ocr(upscaled_3x)
            aadhaar_tess_3x, status_tess_3x = extract_aadhaar_with_validation(text_tess_3x)
            if status_tess_3x == 'valid':
                return aadhaar_tess_3x, 'valid', 'tesseract_3x'
            candidates.append((aadhaar_tess_3x, status_tess_3x, 'tesseract_3x'))
        
        # Pick best available
        priority = {'valid': -1, 'computed_checksum': 0, 'corrected': 1, 
                    'invalid_checksum': 2, 'not_found': 3}
        candidates.sort(key=lambda x: priority.get(x[1], 4))
        best = candidates[0]
        
        # Try single-digit correction
        if best[1] == 'invalid_checksum' and len(best[0].replace(' ', '')) == 12:
            from verhoeff import validate_aadhaar, verhoeff_checksum
            original = best[0].replace(' ', '')
            for i in range(12):
                for d in '0123456789':
                    if d == original[i]:
                        continue
                    candidate = original[:i] + d + original[i+1:]
                    if validate_aadhaar(candidate):
                        formatted = f"{candidate[:4]} {candidate[4:8]} {candidate[8:]}"
                        return formatted, 'corrected', f'fixed_digit_{i}_{original[i]}->{d}'
        
        # Try to recover from any candidate with 11+ digits
        if best[1] in ('not_found', 'invalid_checksum'):
            for candidate in candidates:
                digits_only = re.sub(r'\D', '', candidate[0])
                if len(digits_only) >= 11:
                    from verhoeff import verhoeff_checksum
                    candidate_11 = digits_only[:11]
                    checksum = verhoeff_checksum(candidate_11)
                    candidate_12 = candidate_11 + str(checksum)
                    formatted = f"{candidate_12[:4]} {candidate_12[4:8]} {candidate_12[8:]}"
                    return formatted, 'computed_checksum', f'computed_from_{candidate[2]}'
        
        # Last resort: raw OCR without enhancement
        if best[1] == 'not_found':
            raw_text = self.run_ocr(aadhaar_crop, enhance=False)
            raw_digits = re.sub(r'\D', '', raw_text)
            if len(raw_digits) >= 11:
                from verhoeff import verhoeff_checksum
                candidate_11 = raw_digits[:11]
                checksum = verhoeff_checksum(candidate_11)
                candidate_12 = candidate_11 + str(checksum)
                formatted = f"{candidate_12[:4]} {candidate_12[4:8]} {candidate_12[8:]}"
                return formatted, 'computed_checksum', 'raw_ocr_recovery'
            
            # Try inverted colors
            if len(aadhaar_crop.shape) == 3:
                gray = cv2.cvtColor(aadhaar_crop, cv2.COLOR_BGR2GRAY)
            else:
                gray = aadhaar_crop
            inverted = cv2.bitwise_not(gray)
            inverted_bgr = cv2.cvtColor(inverted, cv2.COLOR_GRAY2BGR)
            inv_text = self.run_ocr(inverted_bgr, enhance=True, enhance_mode='standard')
            inv_digits = re.sub(r'\D', '', inv_text)
            if len(inv_digits) >= 11:
                from verhoeff import verhoeff_checksum
                candidate_11 = inv_digits[:11]
                checksum = verhoeff_checksum(candidate_11)
                candidate_12 = candidate_11 + str(checksum)
                formatted = f"{candidate_12[:4]} {candidate_12[4:8]} {candidate_12[8:]}"
                return formatted, 'computed_checksum', 'inverted_recovery'
        
        return best[0], best[1], best[2]