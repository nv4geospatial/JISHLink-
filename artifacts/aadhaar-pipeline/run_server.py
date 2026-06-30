

"""
Start the FastAPI OCR server.
Usage: python run_server.py [--host 0.0.0.0] [--port 8000]
"""

import argparse
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from api import start_server
from config import API_HOST, API_PORT


def main():
    parser = argparse.ArgumentParser(description="Start Aadhaar OCR API server")
    parser.add_argument("--host", default=API_HOST, help="Server host")
    parser.add_argument("--port", type=int, default=API_PORT, help="Server port")
    
    args = parser.parse_args()
    
    print(f"🚀 Starting Aadhaar OCR API server")
    print(f"   Host: {args.host}")
    print(f"   Port: {args.port}")
    print(f"   URL: http://{args.host}:{args.port}")
    print(f"   Health: http://{args.host}:{args.port}/health")
    print(f"   OCR: http://{args.host}:{args.port}/ocr/extract")
    print()
    
    # Override config
    import os
    os.environ['OCR_API_HOST'] = args.host
    os.environ['OCR_API_PORT'] = str(args.port)
    
    start_server()


if __name__ == "__main__":
    main()