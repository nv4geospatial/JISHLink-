#!/usr/bin/env python3
"""
CLI script to process multiple Aadhaar images in a folder.
Usage: python run_batch.py --input folder/ --output results.json
"""

import argparse
import json
import sys
from pathlib import Path
from tqdm import tqdm

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from pipeline import AadhaarPipeline


def main():
    parser = argparse.ArgumentParser(description="Batch extract Aadhaar data")
    parser.add_argument("--input", "-i", required=True, help="Input folder")
    parser.add_argument("--output", "-o", required=True, help="Output JSON path")
    parser.add_argument("--no-preprocess", action="store_true",
                        help="Skip scanner preprocessing")
    parser.add_argument("--conf", type=float, default=0.3,
                        help="YOLO confidence threshold")
    
    args = parser.parse_args()
    
    input_dir = Path(args.input)
    if not input_dir.exists():
        print(f"❌ Error: Folder not found: {args.input}", file=sys.stderr)
        sys.exit(1)
    
    # Find images
    image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff'}
    images = [f for f in input_dir.iterdir() 
              if f.suffix.lower() in image_extensions]
    
    if not images:
        print(f"❌ No images found in: {args.input}", file=sys.stderr)
        sys.exit(1)
    
    print(f"📁 Found {len(images)} images")
    
    # Process
    pipeline = AadhaarPipeline(use_gpu=False)
    results = []
    
    for img_path in tqdm(images, desc="Processing"):
        try:
            result = pipeline.extract(
                str(img_path),
                conf_threshold=args.conf,
                preprocess=not args.no_preprocess
            )
            results.append(result)
        except Exception as e:
            print(f"❌ Error processing {img_path.name}: {e}")
            results.append({
                "image": img_path.name,
                "error": str(e)
            })
    
    # Save
    output = {
        "total": len(images),
        "successful": sum(1 for r in results if "error" not in r),
        "failed": sum(1 for r in results if "error" in r),
        "results": results
    }
    
    Path(args.output).write_text(json.dumps(output, indent=2, default=str))
    print(f"✅ Saved: {args.output}")
    print(f"   Total: {output['total']}, Success: {output['successful']}, "
          f"Failed: {output['failed']}")


if __name__ == "__main__":
    main()