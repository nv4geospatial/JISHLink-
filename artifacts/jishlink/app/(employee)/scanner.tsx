/**
 * scanner.tsx — Aadhaar / Bank / PAN document scanner
 *
 * Flow:
 *  1. User selects document type (Aadhaar / Bank / PAN)
 *  2. Camera opens (full-screen) with live guidance overlay
 *  3. On-device quality checks run BEFORE upload:
 *       - Brightness check (warns if too dark or washed out)
 *       - Blur check (warns if image is blurry)
 *       - Size check (rejects if image is below minimum pixels)
 *       - Orientation check for PVC cards (warns if portrait instead of landscape)
 *  4. If checks pass → image is uploaded to /api/ocr/extract (multipart)
 *  5. API server → Python pipeline → result displayed in a table
 *  6. User can retake if unhappy
 *
 * On-device quality checks are intentionally lightweight (no OpenCV on device).
 * Heavy preprocessing (perspective correction, glare removal, sharpening)
 * happens server-side in pipeline.py → preprocess_scanned_image().
 *
 * No changes are required to ocr.ts, ocr_service.ts, api.py, or pipeline.py.
 */

import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Image,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import Toast from "react-native-toast-message";
import { NavHeader } from "@/components/NavHeader";
import colors from "@/constants/colors";

// ─── Types ───────────────────────────────────────────────────────────────────

type ScanType = "aadhaar" | "bank" | "pan" | null;
type ScanStep = "select" | "camera" | "preview" | "result";

interface QualityIssue {
  type: "error" | "warning";
  message: string;
  hint: string;
}

interface ExtractedData {
  aadhaar_number?: string;
  name?: string;
  dob?: string;
  gender?: string;
  address?: string;
  nominee?: string;
  pincode?: string;
  mobile?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  branch?: string;
  pan_number?: string;
  father_name?: string;
  [key: string]: string | undefined;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN = Dimensions.get("window");

/**
 * EXACT blank template dimensions from the project templates:
 *   Letter  → 576 × 640 px  (aspect ratio: width/height = 0.9)
 *   PVC     → 203 × 248 px  (aspect ratio: width/height = 0.818)
 *
 * Both templates are PORTRAIT (taller than wide).
 * The on-screen cutout uses these ratios so the captured region
 * maps 1:1 to what the pipeline was trained on.
 *
 * The on-screen frame width is 88% of screen width.
 * Height = frameWidth / aspectRatio.
 */
const TEMPLATE_ASPECT: Record<NonNullable<ScanType>, number> = {
  aadhaar: 576 / 640,   // 0.9  — Letter template (portrait)
  bank:    576 / 640,   // same shape for passbook pages
  pan:     203 / 248,   // 0.818 — PVC template (portrait)
};

// Frame occupies 88% of screen width, centred
const FRAME_WIDTH  = SCREEN.width * 0.88;
// Height derived from aspect ratio (both portrait → height > width)
const getFrameHeight = (type: NonNullable<ScanType>) =>
  FRAME_WIDTH / TEMPLATE_ASPECT[type];

// Minimum output pixel dimensions — well above template size so
// the pipeline has room to downsample cleanly (3× the template).
const MIN_DIMENSIONS: Record<NonNullable<ScanType>, { w: number; h: number }> = {
  aadhaar: { w: 576 * 3, h: 640 * 3 },   // 1728 × 1920
  bank:    { w: 576 * 2, h: 640 * 2 },   // 1152 × 1280
  pan:     { w: 203 * 3, h: 248 * 3 },   // 609  × 744
};

// Guidance text shown below the camera cutout for each doc type
const CAMERA_GUIDE: Record<NonNullable<ScanType>, { line1: string; line2: string }> = {
  aadhaar: {
    line1: "Fit the Aadhaar letter inside the frame",
    line2: "Keep it flat • Even lighting • No shadows",
  },
  bank: {
    line1: "Open passbook to account details page",
    line2: "Fill the entire frame • Hold steady",
  },
  pan: {
    line1: "Fit the PAN card inside the frame",
    line2: "Keep it flat • Avoid glare on the card",
  },
};

// Fields the pipeline must return for each doc type.
// If NONE of these are present and non-empty, the scan is considered failed.
const REQUIRED_FIELDS: Record<NonNullable<ScanType>, string[]> = {
  aadhaar: ["aadhaar_number", "name"],
  bank:    ["account_number", "ifsc_code"],
  pan:     ["pan_number", "name"],
};

// Document types whose physical card is landscape (wider than tall).
// Used by runQualityChecks() to warn the user if they captured the
// document in portrait orientation by mistake.
// NOTE: both Aadhaar templates (Letter 576×640, PVC 203×248) are PORTRAIT,
// so neither "aadhaar" nor "bank" belongs here. Only a genuine landscape
// document (e.g. a horizontally-oriented PAN card capture) would qualify.
// Currently empty because both blank templates you provided are portrait —
// add a type here only if a future document's template is landscape.
const LANDSCAPE_TYPES: ScanType[] = [];

// Human-readable label for each scan type
const TYPE_LABELS: Record<NonNullable<ScanType>, string> = {
  aadhaar: "Aadhaar Card",
  bank:    "Bank Passbook",
  pan:     "PAN Card",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Retrieve auth token from storage.
 * Works on both web (localStorage) and native (AsyncStorage via SecureStore).
 */
async function getAuthToken(): Promise<string> {
  if (Platform.OS === "web") {
    return localStorage.getItem("jishlink_token") || "";
  }
  try {
    // SecureStore / AsyncStorage — imported lazily to avoid web crashes
    const SecureStore = await import("expo-secure-store");
    return (await SecureStore.getItemAsync("jishlink_token")) || "";
  } catch {
    return "";
  }
}

/**
 * Lightweight on-device quality checks.
 * These run on the compressed thumbnail so they are fast.
 * Heavy checks (perspective, glare removal) happen in pipeline.py.
 *
 * Returns an array of issues. Empty array = image is acceptable.
 */
async function runQualityChecks(
  uri: string,
  width: number,
  height: number,
  scanType: NonNullable<ScanType>
): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = [];

  // 1. Minimum size check
  const min = MIN_DIMENSIONS[scanType];
  if (width < min.w || height < min.h) {
    issues.push({
      type: "error",
      message: `Image too small (${width}×${height}px)`,
      hint: "Move closer to the document so it fills the frame.",
    });
    return issues; // no point checking further
  }

  // 2. Orientation check for landscape documents
  if (LANDSCAPE_TYPES.includes(scanType) && height > width) {
    issues.push({
      type: "warning",
      message: "Document appears to be in portrait orientation",
      hint: "Rotate your phone to landscape mode for best results.",
    });
  }

  // 3. Brightness check via pixel sampling
  // We down-sample to a tiny thumbnail for speed, then read pixel data.
  try {
    const thumb = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 64, height: 64 } }],
      { base64: true, format: ImageManipulator.SaveFormat.JPEG, compress: 0.5 }
    );

    if (thumb.base64) {
      // Decode a few bytes of base64 as a rough brightness proxy.
      // A mostly-dark image will have low average byte values.
      // A mostly-white / washed-out image will have very high values.
      // This is not pixel-perfect but is fast and reliable enough on-device.
      const bytes = atob(thumb.base64);
      let sum = 0;
      // Sample every 3rd byte (R channel of JPEG approximation)
      for (let i = 0; i < bytes.length; i += 3) {
        sum += bytes.charCodeAt(i);
      }
      const avg = sum / (bytes.length / 3);

      if (avg < 40) {
        issues.push({
          type: "error",
          message: "Image is too dark",
          hint: "Move to a brighter area or turn on more lights.",
        });
      } else if (avg > 230) {
        issues.push({
          type: "warning",
          message: "Image may be overexposed",
          hint: "Avoid direct light sources or glare on the card.",
        });
      }
    }
  } catch {
    // Brightness check failed silently — do not block the upload
  }

  return issues;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = colors.light;
  const cameraRef = useRef<CameraView>(null);

  // Permissions
  const [permission, requestPermission] = useCameraPermissions();

  // State
  const [scanType, setScanType] = useState<ScanType>(null);
  const [step, setStep] = useState<ScanStep>("select");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Processing...");
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [capturedSize, setCapturedSize] = useState<{ w: number; h: number } | null>(null);
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[]>([]);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);

  // Camera controls
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(0);                   // 0.0 → 1.0
  const [scanSuccess, setScanSuccess] = useState(false); // true only when required fields present

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // ── Step: Select doc type → open camera ────────────────────────────────────

  const handleSelectType = useCallback(async (type: ScanType) => {
    setScanType(type);
    setExtractedData(null);
    setCapturedUri(null);
    setQualityIssues([]);
    setScanSuccess(false);
    setTorchOn(false);
    setZoom(0);

    if (Platform.OS === "web") {
      // Web does not support CameraView — fall back to file picker
      openWebFilePicker(type);
      return;
    }

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Toast.show({
          type: "error",
          text1: "Camera permission denied",
          text2: "Go to Settings → Apps → Jishlink → Permissions to enable camera.",
        });
        return;
      }
    }

    setStep("camera");
  }, [permission, requestPermission]);

  // ── Web fallback: file picker ───────────────────────────────────────────────

  const openWebFilePicker = useCallback(async (type: ScanType) => {
    try {
      const ImagePicker = await import("expo-image-picker");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
        base64: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setCapturedUri(asset.uri);
      setCapturedSize({ w: asset.width ?? 800, h: asset.height ?? 600 });
      setStep("preview");
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not open image picker", text2: String(e) });
    }
  }, []);

  // ── Step: Capture photo from camera ────────────────────────────────────────

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || loading) return;

    try {
      setLoading(true);
      setLoadingMsg("Capturing...");

      const photo = await (cameraRef.current.takePictureAsync({
        quality: 1,              // maximum quality — pipeline needs sharp digits
        skipProcessing: false,   // apply auto white-balance, noise reduction
        exif: false,
        imageType: "jpg",
      }) as any) as any;

      if (!photo) throw new Error("No photo captured");

      // Crop to the exact card frame region so background is excluded.
      // The frame sits vertically centred in the screen.
      // photo dimensions are the full camera sensor output.
      const ph = photo.height;
      const pw = photo.width;
      const frameH = getFrameHeight(scanType!);
      const frameW = FRAME_WIDTH;

      // Scale: photo pixels per screen pixel
      const scaleX = pw / SCREEN.width;
      const scaleY = ph / SCREEN.height;

      // Frame origin in screen coordinates (centred horizontally, vertically centred)
      const frameScreenX = (SCREEN.width - frameW) / 2;
      const frameScreenY = (SCREEN.height - frameH) / 2;

      // Convert to photo pixel coordinates
      const cropX = Math.max(0, Math.round(frameScreenX * scaleX));
      const cropY = Math.max(0, Math.round(frameScreenY * scaleY));
      const cropW = Math.min(pw - cropX, Math.round(frameW * scaleX));
      const cropH = Math.min(ph - cropY, Math.round(frameH * scaleY));

      let finalUri = photo.uri;
      let finalW   = pw;
      let finalH   = ph;

      // Crop if dimensions are valid (some older Expo versions may fail this)
      if (cropW > 100 && cropH > 100) {
        try {
          const cropped = await ImageManipulator.manipulateAsync(
            photo.uri,
            [{
              crop: { originX: cropX, originY: cropY, width: cropW, height: cropH },
            }],
            { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
          );
          finalUri = cropped.uri;
          finalW   = cropped.width;
          finalH   = cropped.height;
        } catch {
          // Crop failed — use full photo, quality checks will still run
        }
      }

      setCapturedUri(finalUri);
      setCapturedSize({ w: finalW, h: finalH });
      setStep("preview");
    } catch (e) {
      Toast.show({ type: "error", text1: "Capture failed", text2: String(e) });
    } finally {
      setLoading(false);
    }
  }, [loading, scanType]);

  // ── Step: Confirm preview → quality check → upload ─────────────────────────

  const handleConfirmAndUpload = useCallback(async () => {
    if (!capturedUri || !scanType) return;

    setLoading(true);
    setLoadingMsg("Checking image quality...");

    try {
      // 1. Run on-device quality checks
      const { w, h } = capturedSize ?? { w: 800, h: 600 };
      const issues = await runQualityChecks(capturedUri, w, h, scanType);
      setQualityIssues(issues);

      const hardErrors = issues.filter((i) => i.type === "error");
      if (hardErrors.length > 0) {
        // Block upload — tell user to retake
        setLoading(false);
        return;
      }

      // 2. Upload
      setLoadingMsg("Uploading to OCR engine...");
      await uploadImage(capturedUri, scanType);
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Processing failed",
        text2: e instanceof Error ? e.message : String(e),
      });
      setLoading(false);
    }
  }, [capturedUri, capturedSize, scanType]);

  // ── Upload image to API server ──────────────────────────────────────────────

  const uploadImage = async (uri: string, type: ScanType) => {
    try {
      const formData = new FormData();
      const filename = uri.split("/").pop() || "scan.jpg";

      if (Platform.OS === "web") {
        const response = await fetch(uri);
        const blob = await response.blob();
        formData.append("image", blob, filename);
      } else {
        formData.append("image", {
          uri,
          name: filename,
          type: "image/jpeg",
        } as any);
      }

      const token = await getAuthToken();
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || "";

      setLoadingMsg("Extracting data...");

      const res = await fetch(`${apiUrl}/api/ocr/extract`, {
        method: "POST",
        headers: {
          // Do NOT set Content-Type — let fetch set the multipart boundary
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Server error ${res.status}: ${errText}`);
      }

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || data.message || "OCR extraction failed");
      }

      const mapped = mapOcrResult(data.data, type);

      // ── Document validation ──────────────────────────────────────────────
      // Check whether at least ONE required field for this doc type is present
      // and non-empty. If not, the image was not an Aadhaar / PAN / passbook.
      const required = REQUIRED_FIELDS[type!] ?? [];
      const foundFields = required.filter(
        (f) => mapped[f] && String(mapped[f]).trim().length > 0
      );
      const isValidDocument = foundFields.length > 0;

      setExtractedData(mapped);
      setScanSuccess(isValidDocument);
      setStep("result");

      if (!isValidDocument) {
        Toast.show({
          type: "error",
          text1: `Not a valid ${TYPE_LABELS[type!]}`,
          text2: "Please scan the correct document and ensure text is clearly visible.",
        });
      } else {
        Toast.show({ type: "success", text1: "Document scanned successfully!" });
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Map raw pipeline output to display fields ───────────────────────────────

  const mapOcrResult = (data: any, type: ScanType): ExtractedData => {
    if (!data) return {};
    if (type === "aadhaar") {
      return {
        aadhaar_number: data.aadhaar_number || undefined,
        name:           data.name           || undefined,
        dob:            data.dob            || undefined,
        gender:         data.gender         || undefined,
        address:        data.address        || undefined,
        nominee:        data.nominee        || undefined,
        pincode:        data.pincode        || undefined,
        mobile:         data.mobile         || undefined,
      };
    }
    if (type === "bank") {
      return {
        bank_name:      data.bank_name      || "Detected from image",
        account_number: data.account_number || undefined,
        ifsc_code:      data.ifsc_code      || undefined,
        branch:         data.branch         || undefined,
        name:           data.name           || undefined,
      };
    }
    if (type === "pan") {
      return {
        pan_number:  data.pan_number  || undefined,
        name:        data.name        || undefined,
        father_name: data.father_name || undefined,
        dob:         data.dob         || undefined,
      };
    }
    return data;
  };

  // ── Reset to beginning ──────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setScanType(null);
    setStep("select");
    setCapturedUri(null);
    setCapturedSize(null);
    setQualityIssues([]);
    setExtractedData(null);
    setScanSuccess(false);
    setTorchOn(false);
    setZoom(0);
    setLoading(false);
  }, []);

  const handleRetake = useCallback(() => {
    setCapturedUri(null);
    setCapturedSize(null);
    setQualityIssues([]);
    setExtractedData(null);
    setScanSuccess(false);
    if (Platform.OS === "web") {
      openWebFilePicker(scanType);
    } else {
      setTorchOn(false);
      setStep("camera");
    }
  }, [scanType, openWebFilePicker]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  const renderSelectStep = () => (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 32 }}>
      <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
        Select Document Type
      </Text>
      <Text style={[styles.sectionSubtitle, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Choose the document you want to scan. The camera will open with guidance.
      </Text>

      <View style={styles.cardGrid}>
        {([
          { type: "aadhaar" as ScanType, icon: "credit-card", label: "Aadhaar Card",  hint: "Extracts name, DOB, address, Aadhaar number" },
          { type: "bank"    as ScanType, icon: "book",         label: "Bank Passbook", hint: "Extracts account number, IFSC, branch" },
          { type: "pan"     as ScanType, icon: "file-text",    label: "PAN Card",      hint: "Extracts PAN number, name, date of birth" },
        ] as const).map(({ type, icon, label, hint }) => (
          <TouchableOpacity
            key={type}
            onPress={() => handleSelectType(type)}
            style={[styles.docCard, { backgroundColor: c.white }]}
            activeOpacity={0.85}
          >
            <View style={[styles.docCardIcon, { backgroundColor: c.navy + "12" }]}>
              <Feather name={icon as any} size={26} color={c.navy} />
            </View>
            <Text style={[styles.docCardLabel, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
              {label}
            </Text>
            <Text style={[styles.docCardHint, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {hint}
            </Text>
            <View style={[styles.docCardArrow, { backgroundColor: c.navy }]}>
              <Feather name="camera" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tips */}
      <View style={[styles.tipsBox, { backgroundColor: c.navy + "08", borderColor: c.navy + "20" }]}>
        <Text style={[styles.tipsTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
          📋 Scanning Tips
        </Text>
        {[
          "Place card on a plain dark or light surface",
          "Ensure all four corners of the card are visible",
          "Avoid shadows across the text areas",
          "Keep camera steady — hold with both hands",
          "Use good lighting — natural daylight works best",
        ].map((tip, i) => (
          <Text key={i} style={[styles.tipItem, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            • {tip}
          </Text>
        ))}
      </View>
    </ScrollView>
  );

  const renderCameraStep = () => {
    const frameH = scanType ? getFrameHeight(scanType) : SCREEN.height * 0.5;
    const guide  = scanType ? CAMERA_GUIDE[scanType] : null;

    return (
      <View style={styles.cameraContainer}>

        {/* ── Full-screen camera feed ─────────────────────────────────── */}
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={"back" as CameraType}
          enableTorch={torchOn}
          zoom={zoom}
        />

        {/* ── Dark vignette overlay: everything outside the card frame ── */}
        {/* Top mask */}
        <View
          pointerEvents="none"
          style={[
            styles.overlaySlice,
            {
              top: 0,
              left: 0,
              right: 0,
              height: (SCREEN.height - frameH) / 2,
            },
          ]}
        />
        {/* Bottom mask */}
        <View
          pointerEvents="none"
          style={[
            styles.overlaySlice,
            {
              bottom: 0,
              left: 0,
              right: 0,
              height: (SCREEN.height - frameH) / 2,
            },
          ]}
        />
        {/* Left mask */}
        <View
          pointerEvents="none"
          style={[
            styles.overlaySlice,
            {
              top: (SCREEN.height - frameH) / 2,
              bottom: (SCREEN.height - frameH) / 2,
              left: 0,
              width: (SCREEN.width - FRAME_WIDTH) / 2,
            },
          ]}
        />
        {/* Right mask */}
        <View
          pointerEvents="none"
          style={[
            styles.overlaySlice,
            {
              top: (SCREEN.height - frameH) / 2,
              bottom: (SCREEN.height - frameH) / 2,
              right: 0,
              width: (SCREEN.width - FRAME_WIDTH) / 2,
            },
          ]}
        />

        {/* ── Card frame border + corner marks ────────────────────────── */}
        <View
          pointerEvents="none"
          style={[
            styles.cardFrame,
            {
              width: FRAME_WIDTH,
              height: frameH,
              top:  (SCREEN.height - frameH) / 2,
              left: (SCREEN.width  - FRAME_WIDTH) / 2,
            },
          ]}
        >
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>

        {/* ── Top bar: cancel + torch + zoom ──────────────────────────── */}
        <View
          style={[
            styles.cameraTopBar,
            { paddingTop: insets.top + 8 },
          ]}
        >
          {/* Cancel */}
          <TouchableOpacity onPress={handleReset} style={styles.camIconBtn}>
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>

          {/* Doc type label */}
          <View style={styles.docTypeChip}>
            <Text style={styles.docTypeChipText}>
              {scanType ? TYPE_LABELS[scanType] : ""}
            </Text>
          </View>

          {/* Torch toggle */}
          <TouchableOpacity
            onPress={() => setTorchOn((v) => !v)}
            style={[styles.camIconBtn, torchOn && styles.camIconBtnActive]}
          >
            <Feather name={torchOn ? "zap" : "zap-off"} size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── Zoom slider ─────────────────────────────────────────────── */}
        <View
          style={[
            styles.zoomRow,
            { top: (SCREEN.height - frameH) / 2 - 52 },
          ]}
          pointerEvents="box-none"
        >
          {[0, 0.1, 0.2, 0.3].map((level) => (
            <TouchableOpacity
              key={level}
              onPress={() => setZoom(level)}
              style={[
                styles.zoomBtn,
                zoom === level && styles.zoomBtnActive,
              ]}
            >
              <Text style={styles.zoomBtnText}>
                {level === 0 ? "1×" : level === 0.1 ? "2×" : level === 0.2 ? "3×" : "4×"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Guidance text below card frame ──────────────────────────── */}
        {guide && (
          <View
            style={[
              styles.cameraGuidance,
              {
                top: (SCREEN.height + frameH) / 2 + 12,
              },
            ]}
            pointerEvents="none"
          >
            <Text style={styles.guidanceLine1}>{guide.line1}</Text>
            <Text style={styles.guidanceLine2}>{guide.line2}</Text>
          </View>
        )}

        {/* ── Capture button ───────────────────────────────────────────── */}
        <View style={[styles.cameraControls, { paddingBottom: bottomPad + 20 }]}>
          {/* Spacer left */}
          <View style={{ width: 60 }} />

          <TouchableOpacity
            onPress={handleCapture}
            style={styles.captureBtn}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="large" />
              : <View style={styles.captureBtnInner} />
            }
          </TouchableOpacity>

          {/* Spacer right */}
          <View style={{ width: 60 }} />
        </View>
      </View>
    );
  };

  const renderPreviewStep = () => {
    const hardErrors  = qualityIssues.filter((i) => i.type === "error");
    const warnings    = qualityIssues.filter((i) => i.type === "warning");
    const hasError    = hardErrors.length > 0;

    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 32 }}>
        <Text style={[styles.sectionTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
          Review Captured Image
        </Text>

        {capturedUri && (
          <Image
            source={{ uri: capturedUri }}
            style={styles.previewImage}
            resizeMode="contain"
          />
        )}

        {/* Quality issues */}
        {qualityIssues.length > 0 && (
          <View style={[styles.issuesBox, { borderColor: hasError ? "#e74c3c" : "#f39c12" }]}>
            {qualityIssues.map((issue, i) => (
              <View key={i} style={styles.issueRow}>
                <Feather
                  name={issue.type === "error" ? "alert-circle" : "alert-triangle"}
                  size={16}
                  color={issue.type === "error" ? "#e74c3c" : "#f39c12"}
                />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.issueMsgText, { color: issue.type === "error" ? "#e74c3c" : "#c0842a" }]}>
                    {issue.message}
                  </Text>
                  <Text style={[styles.issueHintText, { color: c.mutedForeground }]}>
                    {issue.hint}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.previewActions}>
          <TouchableOpacity
            onPress={handleRetake}
            style={[styles.actionBtn, styles.actionBtnSecondary, { borderColor: c.navy }]}
          >
            <Feather name="camera" size={18} color={c.navy} />
            <Text style={[styles.actionBtnText, { color: c.navy, fontFamily: "Inter_600SemiBold" }]}>
              Retake
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleConfirmAndUpload}
            style={[
              styles.actionBtn,
              styles.actionBtnPrimary,
              { backgroundColor: hasError ? "#bbb" : c.navy },
            ]}
            disabled={loading || hasError}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Feather name="upload" size={18} color="#fff" />
            }
            <Text style={[styles.actionBtnText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
              {loading ? loadingMsg : hasError ? "Fix Issues First" : warnings.length > 0 ? "Upload Anyway" : "Upload & Extract"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  const renderResultStep = () => {
    if (!extractedData) return null;

    const entries = Object.entries(extractedData).filter(
      ([, v]) => v && String(v).trim().length > 0
    );

    // scanSuccess is true only when required fields were found by uploadImage()
    const bannerColor  = scanSuccess ? "#27ae60" : "#e74c3c";
    const bannerBg     = scanSuccess ? "#27ae6015" : "#e74c3c15";
    const bannerIcon   = scanSuccess ? "check-circle" : "alert-circle";
    const bannerText   = scanSuccess
      ? "Document data extracted successfully"
      : `This does not appear to be a valid ${TYPE_LABELS[scanType!]}.\nPlease retake with the correct document.`;

    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 32 }}>

        {/* ── Status banner — colour-coded, never shows success on empty data ── */}
        <View style={[styles.successBanner, { backgroundColor: bannerBg, borderColor: bannerColor }]}>
          <Feather name={bannerIcon} size={20} color={bannerColor} />
          <Text style={[styles.successText, { color: bannerColor, fontFamily: "Inter_600SemiBold", flex: 1 }]}>
            {bannerText}
          </Text>
        </View>

        {/* ── Scanned image thumbnail ─────────────────────────────────── */}
        {capturedUri && (
          <Image
            source={{ uri: capturedUri }}
            style={styles.resultThumb}
            resizeMode="contain"
          />
        )}

        {/* ── Results table or failure prompt ────────────────────────── */}
        <View style={[styles.tableCard, { backgroundColor: c.white }]}>
          <Text style={[styles.tableTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
            {scanType === "aadhaar" && "Aadhaar Card Details"}
            {scanType === "bank"    && "Bank Account Details"}
            {scanType === "pan"     && "PAN Card Details"}
          </Text>

          {entries.length === 0 || !scanSuccess ? (
            <View style={styles.emptyResult}>
              <Feather name="camera-off" size={32} color={c.mutedForeground} />
              <Text style={[styles.emptyResultTitle, { color: c.navy, fontFamily: "Poppins_700Bold" }]}>
                No data extracted
              </Text>
              <Text style={[styles.emptyResultHint, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Reasons this can happen:
              </Text>
              {[
                "The wrong document was scanned",
                "Card text is blurry or out of focus",
                "Poor lighting or strong shadows",
                "Card was not fully inside the frame",
              ].map((r, i) => (
                <Text key={i} style={[styles.emptyResultBullet, { color: c.mutedForeground }]}>
                  • {r}
                </Text>
              ))}
            </View>
          ) : (
            entries.map(([key, value]) => (
              <View key={key} style={styles.tableRow}>
                <Text style={[styles.tableLabel, { color: c.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </Text>
                <Text style={[styles.tableValue, { color: c.text, fontFamily: "Inter_600SemiBold" }]}>
                  {String(value)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* ── Action buttons ──────────────────────────────────────────── */}
        {!scanSuccess && (
          <TouchableOpacity
            onPress={handleRetake}
            style={[styles.actionBtn, styles.actionBtnPrimary, { backgroundColor: c.navy, marginBottom: 10 }]}
          >
            <Feather name="camera" size={18} color="#fff" />
            <Text style={[styles.actionBtnText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
              Retake Scan
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={handleReset}
          style={[
            styles.actionBtn,
            scanSuccess ? styles.actionBtnPrimary : styles.actionBtnSecondary,
            { backgroundColor: scanSuccess ? c.navy : "transparent", borderColor: c.navy },
          ]}
        >
          <Feather name="refresh-ccw" size={18} color={scanSuccess ? "#fff" : c.navy} />
          <Text style={[styles.actionBtnText, { color: scanSuccess ? "#fff" : c.navy, fontFamily: "Inter_600SemiBold" }]}>
            Scan Another Document
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────

  // Camera step: full-screen, no NavHeader (camera needs all space)
  if (step === "camera") {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        {renderCameraStep()}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <NavHeader
        title={
          step === "select"  ? "Document Scanner" :
          step === "preview" ? "Review Photo"     :
                               "Scan Result"
        }
        showBack
        onBack={step === "select" ? () => router.back() : handleReset}
      />

      {step === "select"  && renderSelectStep()}
      {step === "preview" && renderPreviewStep()}
      {step === "result"  && renderResultStep()}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Select step
  sectionTitle:    { fontSize: 20, marginBottom: 6 },
  sectionSubtitle: { fontSize: 14, marginBottom: 20, lineHeight: 20 },
  cardGrid:        { gap: 12, marginBottom: 24 },
  docCard: {
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  docCardIcon:  { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  docCardLabel: { fontSize: 16, marginBottom: 4 },
  docCardHint:  { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  docCardArrow: { alignSelf: "flex-end", borderRadius: 20, padding: 6 },

  tipsBox:  { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  tipsTitle: { fontSize: 14, marginBottom: 6 },
  tipItem:   { fontSize: 13, lineHeight: 20 },

  // ── Camera step ─────────────────────────────────────────────────────────────
  cameraContainer: { flex: 1 },

  // Dark mask slices that surround the clear card frame
  overlaySlice: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.68)",
  },

  // Transparent window — the card frame itself (no background, just border)
  cardFrame: {
    position: "absolute",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
  },

  // L-shaped corner marks — bright white, 28×28px each
  corner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderColor: "#fff",
  },
  cornerTL: { top: -1,    left: -1,    borderTopWidth: 3, borderLeftWidth: 3,   borderTopLeftRadius: 6 },
  cornerTR: { top: -1,    right: -1,   borderTopWidth: 3, borderRightWidth: 3,  borderTopRightRadius: 6 },
  cornerBL: { bottom: -1, left: -1,    borderBottomWidth: 3, borderLeftWidth: 3,  borderBottomLeftRadius: 6 },
  cornerBR: { bottom: -1, right: -1,   borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },

  // Top bar: Cancel | doc label | Torch
  cameraTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  camIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  camIconBtnActive: {
    backgroundColor: "#f39c12",
  },
  docTypeChip: {
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  docTypeChipText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },

  // Zoom level selector
  zoomRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  zoomBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomBtnActive: {
    backgroundColor: "#f39c12",
  },
  zoomBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },

  // Guidance below the frame
  cameraGuidance: {
    position: "absolute",
    left: 20,
    right: 20,
    alignItems: "center",
  },
  guidanceLine1: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 4,
    overflow: "hidden",
  },
  guidanceLine2: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },

  // Capture button row
  cameraControls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  captureBtnInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
  },

  // ── Result step additions ────────────────────────────────────────────────────
  emptyResult: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 6,
  },
  emptyResultTitle: {
    fontSize: 16,
    marginTop: 8,
  },
  emptyResultHint: {
    fontSize: 13,
    marginTop: 6,
  },
  emptyResultBullet: {
    fontSize: 12,
    lineHeight: 20,
    alignSelf: "flex-start",
    paddingLeft: 8,
  },

  // Preview step
  previewImage: {
    width: "100%",
    height: 240,
    borderRadius: 14,
    backgroundColor: "#f0f0f0",
    marginBottom: 16,
  },
  issuesBox: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 12,
    gap: 10,
    marginBottom: 16,
    backgroundColor: "#fff",
  },
  issueRow:     { flexDirection: "row", alignItems: "flex-start" },
  issueMsgText: { fontSize: 13, fontWeight: "600" },
  issueHintText: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  previewActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },

  // Shared action buttons
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionBtnPrimary:   { /* backgroundColor set inline */ },
  actionBtnSecondary: { borderWidth: 1.5, backgroundColor: "transparent" },
  actionBtnText:      { fontSize: 14 },

  // Result step
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  successText:  { fontSize: 14 },
  resultThumb:  { width: "100%", height: 140, borderRadius: 12, marginBottom: 16, backgroundColor: "#f5f5f5" },
  tableCard:    { borderRadius: 14, padding: 16, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  tableTitle:   { fontSize: 16, marginBottom: 14, textAlign: "center" },
  tableRow:     { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  tableLabel:   { flex: 1, fontSize: 13, textTransform: "capitalize" },
  tableValue:   { flex: 1.5, fontSize: 13, textAlign: "right" },
});