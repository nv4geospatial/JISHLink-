"""
CLI entry point for the Aadhaar extraction pipeline.
Called by ocr_service.ts fallback when the FastAPI server is not running.

Usage:
    python run_pipeline.py --input /path/to/image.jpg --preprocess
    python run_pipeline.py --input /path/to/image.jpg --no-preprocess

Output:
    Prints a single JSON line to stdout with the extraction result.
    All other print() output from the pipeline goes to stderr so the
    Node.js caller can reliably parse the last JSON line from stdout.
"""

import sys
import json
import argparse

# Redirect all print() calls that originate from pipeline internals to stderr
# so stdout stays clean for JSON output.
import builtins as _builtins
_real_print = _builtins.print

def _stderr_print(*args, **kwargs):
    kwargs['file'] = sys.stderr
    _real_print(*args, **kwargs)

_builtins.print = _stderr_print


def main():
    parser = argparse.ArgumentParser(description="Aadhaar OCR CLI")
    parser.add_argument("--input",       required=True, help="Path to input image")
    parser.add_argument("--preprocess",  action="store_true",  default=True,
                        help="Apply scanner preprocessing (default: on)")
    parser.add_argument("--no-preprocess", dest="preprocess", action="store_false",
                        help="Skip preprocessing")
    args = parser.parse_args()

    try:
        from pipeline import get_pipeline
        pipeline = get_pipeline()
        result = pipeline.extract(args.input, preprocess=args.preprocess)
    except Exception as e:
        result = {"error": str(e), "aadhaar_number": "", "name": "", "dob": "",
                  "gender": "", "address": "", "nominee": "", "pincode": "", "mobile": ""}

    # Write JSON to stdout — this is what Node.js reads
    _real_print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()