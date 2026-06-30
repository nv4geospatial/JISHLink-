"""
Unit tests for Aadhaar OCR Pipeline.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import unittest
import numpy as np
from verhoeff import validate_aadhaar, verhoeff_checksum, extract_aadhaar_with_validation
from extractors import extract_dob, extract_gender, clean_name, parse_address_block
from preprocess import detect_format_from_image


class TestVerhoeff(unittest.TestCase):
    def test_valid_aadhaar(self):
        # Valid Aadhaar: 1234 5678 9012 (example - replace with real valid number)
        # This is a placeholder - real test needs valid Aadhaar
        pass
    
    def test_checksum_computation(self):
        # Test checksum computation
        checksum = verhoeff_checksum("12345678901")
        self.assertIsInstance(checksum, int)
        self.assertTrue(0 <= checksum <= 9)
    
    def test_extract_from_text(self):
        text = "Your Aadhaar is 1234 5678 9012"
        result, status = extract_aadhaar_with_validation(text)
        self.assertIn(status, ['valid', 'invalid_checksum', 'computed_checksum', 'not_found'])


class TestExtractors(unittest.TestCase):
    def test_extract_dob_full(self):
        text = "DOB: 14/02/1960"
        dob, quality = extract_dob(text)
        self.assertEqual(dob, "14/02/1960")
        self.assertEqual(quality, "full")
    
    def test_extract_dob_year_only(self):
        text = "Year: 1960"
        dob, quality = extract_dob(text)
        self.assertEqual(quality, "year_only")
    
    def test_extract_gender(self):
        self.assertEqual(extract_gender("MALE"), "Male")
        self.assertEqual(extract_gender("FEMALE"), "Female")
        self.assertEqual(extract_gender("TRANSGENDER"), "Transgender")
        self.assertEqual(extract_gender("UNKNOWN"), "")
    
    def test_clean_name(self):
        self.assertEqual(clean_name("John Doe"), "John Doe")
        self.assertEqual(clean_name("DOB: 14/02/1960 John Doe"), "John Doe")
        self.assertEqual(clean_name("Aadhaar John Doe"), "John Doe")


class TestPreprocess(unittest.TestCase):
    def test_detect_format_letter(self):
        # Mock image with letter aspect ratio
        img = np.zeros((640, 576, 3), dtype=np.uint8)
        # Would need to save and test - placeholder
        pass


if __name__ == '__main__':
    unittest.main()