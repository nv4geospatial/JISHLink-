# Aadhaar OCR Pipeline - Windows Setup Script
# Run this in PowerShell as Administrator if needed

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Aadhaar OCR Pipeline Setup (Windows)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Check Python
$pythonVersion = python --version 2>$null
if (-not $?) {
    Write-Host "ERROR: Python not found. Please install Python 3.9+" -ForegroundColor Red
    exit 1
}
Write-Host "Found: $pythonVersion"

# Navigate to pipeline directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Create virtual environment
Write-Host "`n[1/5] Creating virtual environment..." -ForegroundColor Yellow
if (Test-Path "venv") {
    Write-Host "venv already exists, skipping..."
} else {
    python -m venv venv
}

# Activate virtual environment
Write-Host "`n[2/5] Activating virtual environment..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"

# Upgrade pip
Write-Host "`n[3/5] Upgrading pip..." -ForegroundColor Yellow
python -m pip install --upgrade pip

# Install packages one by one (Windows-safe)
Write-Host "`n[4/5] Installing dependencies..." -ForegroundColor Yellow

$packages = @(
    "numpy==1.24.3",
    "opencv-python==4.8.1.78",
    "Pillow==10.0.1",
    "paddlepaddle==2.5.2",
    "paddleocr==2.9.1",
    "torch==2.1.0+cpu --extra-index-url https://download.pytorch.org/whl/cpu",
    "torchvision==0.16.0+cpu --extra-index-url https://download.pytorch.org/whl/cpu",
    "ultralytics==8.0.232",
    "fastapi==0.104.1",
    "uvicorn==0.24.0",
    "python-multipart==0.0.6",
    "matplotlib==3.7.2",
    "tqdm==4.66.1",
    "requests==2.31.0",
    "python-dotenv==1.0.0"
)

foreach ($pkg in $packages) {
    Write-Host "  Installing $pkg..." -ForegroundColor Gray
    $output = python -m pip install $pkg.Split(" ") 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  WARNING: Failed to install $pkg" -ForegroundColor Yellow
        Write-Host "  $output" -ForegroundColor Gray
    }
}

# Verify installation
Write-Host "`n[5/5] Verifying installation..." -ForegroundColor Yellow
$testScript = @"
import sys
try:
    import cv2
    import numpy
    import torch
    import paddleocr
    import ultralytics
    import fastapi
    print('SUCCESS: All imports working!')
    print(f'OpenCV: {cv2.__version__}')
    print(f'NumPy: {numpy.__version__}')
    print(f'PyTorch: {torch.__version__}')
except Exception as e:
    print(f'FAILED: {e}')
    sys.exit(1)
"@

$testResult = python -c $testScript
Write-Host $testResult

if ($testResult -match "SUCCESS") {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "Setup completed successfully!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "`nNext steps:"
    Write-Host "  1. Copy your YOLO models to models/stage1/ and models/stage2/"
    Write-Host "  2. Run: python run_pipeline.py --input your_image.jpg"
    Write-Host "  3. Or start API: python run_server.py --port 8002"
} else {
    Write-Host "`n========================================" -ForegroundColor Red
    Write-Host "Setup completed with warnings!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
}