# Aadhaar OCR Pipeline

ML pipeline for extracting data from Aadhaar cards using YOLO + PaddleOCR.

## Architecture
[Mobile Camera/Scanner] → [Preprocessing] → [YOLO Stage 1] → [YOLO Stage 2] → [PaddleOCR] → [Verhoeff Validation] → [JSON Output]
plain

## Project Structure
aadhaar-pipeline/
├── models/
│   ├── stage1/best.pt          # YOLO: address, aadhaar, photo detection
│   └── stage2/best.pt          # YOLO: nominee, pincode, mobile detection
├── src/
│   ├── config.py               # Paths, thresholds, training sizes
│   ├── verhoeff.py             # Aadhaar checksum validation
│   ├── preprocess.py           # Scanner image preprocessing
│   ├── utils.py                # Image helpers, regex
│   ├── ocr_engine.py           # PaddleOCR + Tesseract wrapper
│   ├── extractors.py           # Name, DOB, Gender, Address extractors
│   ├── yolo_detector.py        # Stage 1 & 2 detection
│   ├── pipeline.py             # Main orchestrator
│   └── api.py                  # FastAPI server
├── run_pipeline.py             # CLI: single image
├── run_batch.py                # CLI: batch processing
├── run_server.py               # CLI: start API server
├── requirements.txt
└── README.md
plain

## Setup

### 1. Install Dependencies

```bash
# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Linux/Mac)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
2. Copy Models
Copy your trained YOLO models from Google Drive:
bash
# Create directories
mkdir -p models/stage1 models/stage2

# Copy models (adjust paths as needed)
cp /path/to/stage1_best.pt models/stage1/best.pt
cp /path/to/stage2_best.pt models/stage2/best.pt
3. Run Single Image
bash
python run_pipeline.py --input path/to/aadhaar.jpg --output result.json
4. Run Batch Processing
bash
python run_batch.py --input folder/with/images/ --output results.json
5. Start API Server
bash
python run_server.py
# or
python -m src.api
Server runs on http://localhost:8000
6. Test API
bash
curl -X POST "http://localhost:8000/ocr/extract" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@aadhaar.jpg"