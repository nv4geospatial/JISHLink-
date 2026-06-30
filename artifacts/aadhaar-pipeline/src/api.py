"""
FastAPI server for Aadhaar OCR.
Integrates with your existing API server via HTTP calls.
"""

import os
import tempfile
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import uvicorn
import cv2
import numpy as np

from config import API_HOST, API_PORT
from pipeline import get_pipeline


app = FastAPI(title="Aadhaar OCR API", version="1.0.0")


@app.post("/ocr/extract")
async def extract_aadhaar(file: UploadFile = File(...)):
    """
    Extract Aadhaar data from uploaded image.
    Returns JSON with all fields.
    """
    # Validate file type
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        # Run pipeline
        pipeline = get_pipeline()
        result = pipeline.extract(tmp_path, preprocess=True)
        
        # Clean up
        os.unlink(tmp_path)
        
        # Return success response
        return JSONResponse(content={
            "success": True,
            "data": result
        })
    
    except Exception as e:
        # Clean up on error
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e)
            }
        )


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "aadhaar-ocr"}


def start_server():
    """Start the API server."""
    uvicorn.run(app, host=API_HOST, port=API_PORT)


if __name__ == "__main__":
    start_server()