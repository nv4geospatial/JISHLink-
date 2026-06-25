import { Router } from "express";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as url from "url";
import axios from "axios";
import { requireAuth, AuthRequest } from "../middlewares/auth.js";

const router = Router();

// ── Python OCR microservice management ───────────────────────────────────────
const PYTHON_SERVICE_PORT = 5001;
const PYTHON_SERVICE_URL = `http://127.0.0.1:${PYTHON_SERVICE_PORT}/ocr`;
let pythonProcess: ChildProcess | null = null;
let serviceReady = false;

function getPythonScriptPath(): string {
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  // Resolution order: handles dev (src/), built dist/, and monorepo root
  const candidates = [
    // Dev: src/routes/ → src/lib/
    path.resolve(__dirname, "../lib/ocr_service.py"),
    // Dist: dist/routes/ → dist/lib/  (if build copies lib/)
    path.resolve(__dirname, "../lib/ocr_service.py"),
    // Dist fallback: dist/routes/ → ../src/lib/ (source still available)
    path.resolve(__dirname, "../../src/lib/ocr_service.py"),
    // Monorepo root fallback: api-server/src/lib/
    path.resolve(__dirname, "../../../api-server/src/lib/ocr_service.py"),
    // Absolute from project root
    path.resolve(process.cwd(), "src/lib/ocr_service.py"),
    path.resolve(process.cwd(), "lib/ocr_service.py"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log(`[OCR] Found ocr_service.py at: ${p}`);
      return p;
    }
  }
  throw new Error(
    `ocr_service.py not found. Checked:\n${candidates.join("\n")}`
  );
}

async function waitForService(maxWaitMs = 600000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await axios.post(
        PYTHON_SERVICE_URL,
        { image_base64: "dGVzdA==", doc_type: "photo" },
        { timeout: 3000 }
      );
      if (res.status === 200) {
        serviceReady = true;
        console.log("[OCR] Python microservice is ready");
        return;
      }
    } catch {
      // Not ready yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Python OCR service did not become ready within the timeout");
}

export function startPythonOCRService(): void {
  // Use "python" on Windows, "python3" on Linux/Mac
  const pythonExe =
    process.env.PYTHON_PATH ||
    (process.platform === "win32"
      ? path.resolve(process.cwd(), ".venv", "Scripts", "python.exe")
      : "python3");

  let scriptPath: string;
  try {
    scriptPath = getPythonScriptPath();
  } catch (e) {
    console.error("[OCR] Cannot start Python service:", e);
    return;
  }

  console.log(
    `[OCR] Starting Python OCR microservice: ${pythonExe} ${scriptPath}`
  );

  pythonProcess = spawn(pythonExe, [scriptPath, String(PYTHON_SERVICE_PORT)], {
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8", // Force UTF-8 for Hindi/Unicode output on Windows
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  pythonProcess.stdout?.on("data", (d: Buffer) =>
    process.stdout.write(`[OCR-PY] ${d.toString()}`)
  );
  pythonProcess.stderr?.on("data", (d: Buffer) =>
    process.stderr.write(`[OCR-PY-ERR] ${d.toString()}`)
  );
  pythonProcess.on("exit", (code) => {
    console.warn(`[OCR] Python service exited with code ${code}`);
    serviceReady = false;
    pythonProcess = null;
  });

  // Wait for ready in the background — the first /scan request will also wait
  waitForService().catch((e) =>
    console.error("[OCR] Python service startup failed:", e)
  );
}

export function stopPythonOCRService(): void {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
    serviceReady = false;
  }
}

// ── Helper: Ensure all expected fields are present (NA for missing) ──────────
function normalizeExtractedData(
  data: Record<string, string>,
  docType: string
): Record<string, string> {
  const normalized: Record<string, string> = {};

  if (docType === "aadhar") {
    normalized.full_name = data.full_name || "NA";
    normalized.father_name = data.father_name || "NA";
    normalized.aadhar_number = data.aadhar_number || "NA";
    normalized.dob = data.dob || "NA";
    normalized.address = data.address || "NA";
    normalized.phone = data.phone || "NA";
    normalized.gender = data.gender || "NA";
    normalized.pincode = data.pincode || "NA";
  } else if (docType === "pan") {
    normalized.full_name = data.full_name || "NA";
    normalized.father_name = data.father_name || "NA";
    normalized.pan_number = data.pan_number || "NA";
    normalized.dob = data.dob || "NA";
  } else if (docType === "bank") {
    normalized.full_name = data.full_name || "NA";
    normalized.account_number = data.account_number || "NA";
    normalized.ifsc_code = data.ifsc_code || "NA";
    normalized.bank_name = data.bank_name || "NA";
    normalized.bank_branch = data.bank_branch || "NA";
  } else if (docType === "photo") {
    // Photo has no text fields
  }

  // Copy any additional fields that were extracted
  for (const [key, value] of Object.entries(data)) {
    if (!(key in normalized)) {
      normalized[key] = value;
    }
  }

  return normalized;
}

// ── OCR Endpoint ─────────────────────────────────────────────────────────────
router.post("/scan", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { image_base64, doc_type } = req.body as {
      image_base64: string;
      doc_type: string;
    };

    if (!image_base64 || !doc_type) {
      res.status(400).json({ error: "image_base64 and doc_type are required" });
      return;
    }

    // Photo documents have no text — return immediately
    if (doc_type === "photo") {
      res.json({ success: true, extracted_data: {}, raw_text: "", doc_type });
      return;
    }

    // If the Python service is still starting up, wait up to 10 minutes.
    // EasyOCR downloads its model on first run (~150MB) which can take 5-8 min.
    if (!serviceReady) {
      console.log("[OCR] Service not ready — waiting up to 10 min for Python service...");
      try {
        await waitForService(600000);
      } catch {
        throw new Error(
          "OCR service failed to start. Check that Python is installed and " +
          "'pip install easyocr Pillow numpy requests opencv-python-headless' has been run. " +
          "See server logs for details."
        );
      }
    }

    console.log(`[OCR] Sending to Python OCR service — doc_type=${doc_type}`);

    const pyResponse = await axios.post(
      PYTHON_SERVICE_URL,
      { image_base64, doc_type },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 600000, // 10 minutes
        timeoutErrorMessage: "Python OCR service timeout — model may still be loading",
      }
    );

    const pyResult = pyResponse.data as Record<string, string>;

    if (pyResult["error"]) {
      throw new Error(`OCR processing error: ${pyResult["error"]}`);
    }

    // Separate internal metadata from actual extracted fields
    const rawText: string = pyResult["_raw_text"] ?? "";
    const source: string = pyResult["_source"] ?? "unknown";
    const extractedData: Record<string, string> = {};

    for (const [k, v] of Object.entries(pyResult)) {
      // Keys starting with "_" are internal — skip them
      if (!k.startsWith("_") && v) {
        extractedData[k] = String(v);
      }
    }

    // Normalize: ensure all expected fields are present (NA for missing)
    const normalizedData = normalizeExtractedData(extractedData, doc_type);

    console.log(`[OCR] Source: ${source}`);
    console.log(`[OCR] Extracted fields:`, normalizedData);

    res.json({
      success: true,
      raw_text: rawText,
      extracted_data: normalizedData,
      doc_type,
      source,
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error("[OCR] Error:", e);
    res.status(500).json({
      error: err?.message ?? "OCR processing failed",
    });
  }
});

export { router as ocrRouter };