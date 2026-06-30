"""
YOLO Stage 1 & 2 detector wrapper.
"""

import cv2
import numpy as np
from ultralytics import YOLO
from pathlib import Path

from config import STAGE1_MODEL_PATH, STAGE2_MODEL_PATH, OCR_CONFIDENCE_THRESHOLD


class YOLODetector:
    def __init__(self):
        self.stage1_model = None
        self.stage2_model = None
        self._load_models()
    
    def _load_models(self):
        """Load YOLO models from disk."""
        if not Path(STAGE1_MODEL_PATH).exists():
            raise FileNotFoundError(f"Stage 1 model not found: {STAGE1_MODEL_PATH}")
        if not Path(STAGE2_MODEL_PATH).exists():
            raise FileNotFoundError(f"Stage 2 model not found: {STAGE2_MODEL_PATH}")
        
        print("📥 Loading Stage 1 model...")
        self.stage1_model = YOLO(str(STAGE1_MODEL_PATH))
        print("✅ Stage 1 loaded")
        
        print("Loading Stage 2 model...")
        self.stage2_model = YOLO(str(STAGE2_MODEL_PATH))
        print("✅ Stage 2 loaded")
    
    def detect_stage1(self, image: np.ndarray, conf_threshold: float = None) -> dict:
        """
        Run Stage 1 detection.
        Returns dict with 'address', 'aadhaar', 'photo' bboxes and confidences.
        """
        if conf_threshold is None:
            conf_threshold = OCR_CONFIDENCE_THRESHOLD
        
        results = self.stage1_model(image, conf=conf_threshold, verbose=False)[0]
        
        detections = {
            'address': None,
            'aadhaar': None,
            'photo': None,
            'header': None,
            'confidence': {}
        }
        
        for box in results.boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            
            if cls_id == 0:
                detections['address'] = [x1, y1, x2, y2]
                detections['confidence']['address_block'] = round(conf, 3)
            elif cls_id == 1:
                detections['aadhaar'] = [x1, y1, x2, y2]
                detections['confidence']['aadhaar_area'] = round(conf, 3)
            elif cls_id == 2:
                detections['photo'] = [x1, y1, x2, y2]
                detections['confidence']['photo_area'] = round(conf, 3)
            elif cls_id == 3:
                detections['header'] = [x1, y1, x2, y2]
                detections['confidence']['header'] = round(conf, 3)
        
        return detections
    
    def detect_stage2(self, address_crop: np.ndarray, 
                      conf_threshold: float = None) -> dict:
        """
        Run Stage 2 detection within address block.
        Returns dict with 'nominee', 'pincode', 'mobile' bboxes and confidences.
        """
        if conf_threshold is None:
            conf_threshold = 0.5  # Higher threshold for stage 2
        
        results = self.stage2_model(address_crop, conf=conf_threshold, verbose=False)[0]
        
        detections = {
            'nominee': None,
            'pincode': None,
            'mobile': None,
            'confidence': {}
        }
        
        s2_cls_names = {0: 'nominee', 1: 'pincode', 2: 'mobile'}
        
        for box in results.boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            
            if cls_id in s2_cls_names:
                detections['confidence'][s2_cls_names[cls_id]] = round(conf, 3)
        
        return detections