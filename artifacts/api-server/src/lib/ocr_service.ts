/**
 * OCR Service client for Aadhaar extraction.
 * Connects to Python OCR pipeline via HTTP API or direct execution.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
// Use native fetch if available (Node 18+), otherwise require node-fetch
const _fetch: typeof fetch = typeof fetch !== 'undefined' ? fetch : require('node-fetch');

import FormData from 'form-data';
import { logger } from './logger';

const execAsync = promisify(exec);

// Configuration
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:8002';
const OCR_PYTHON_PATH = process.env.OCR_PYTHON_PATH || 'python';
const OCR_PIPELINE_PATH = process.env.OCR_PIPELINE_PATH || path.join(__dirname, '../../../aadhaar-pipeline/run_pipeline.py');
export interface AadhaarResult {
  success: boolean;
  data?: {
    image: string;
    format: string;
    aadhaar_number: string;
    name: string;
    dob: string;
    gender: string;
    address: string;
    nominee: string;
    pincode: string;
    mobile: string;
    quality: Record<string, string>;
    confidence: Record<string, number>;
    preprocessed: boolean;
  };
  error?: string;
}

/**
 * Extract Aadhaar data from image using OCR pipeline
 */
export async function extractAadhaar(imagePath: string): Promise<AadhaarResult> {
  try {
    // Validate image exists
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image not found: ${imagePath}`);
    }

    // Method 1: Try API first
    try {
      const result = await callOCRAPI(imagePath);
      if (result.success) {
        return result;
      }
    } catch (apiError: any) {
      logger.warn('OCR API failed, falling back to direct execution: ' + apiError.message);
    }

    // Method 2: Direct Python execution
    return await executeOCRScript(imagePath);

  } catch (error) {
    logger.error('OCR extraction failed: ' + (error instanceof Error ? error.message : String(error)));
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown OCR error'
    };
  }
}

/**
 * Call OCR service via HTTP API
 */
async function callOCRAPI(imagePath: string): Promise<AadhaarResult> {
  const formData = new FormData();
  // Python FastAPI endpoint expects field name "file" (matches api.py: File(...))
  formData.append('file', fs.createReadStream(imagePath));

  const controller = new AbortController();
  // 90-second timeout: PaddleOCR with 5× multi-scale on CPU can take ~30-60s
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const response = await _fetch(`${OCR_SERVICE_URL}/ocr/extract`, {
      method: 'POST',
      body: formData as any,
      headers: formData.getHeaders(),
      signal: controller.signal as any,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OCR API returned ${response.status}: ${body}`);
    }

    const json = await response.json() as AadhaarResult;

    // Normalise: Python pipeline returns {"success": true, "data": {...}}
    // but may also return flat result directly on some versions
    if (json.success !== undefined) {
      return json;
    }
    // Flat result — wrap it
    return { success: true, data: json as any };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Execute OCR Python script directly
 */
async function executeOCRScript(imagePath: string): Promise<AadhaarResult> {
  // Validate pipeline script exists
  if (!fs.existsSync(OCR_PIPELINE_PATH)) {
    throw new Error(`OCR pipeline not found: ${OCR_PIPELINE_PATH}`);
  }

  // 90-second timeout — same as API call above
  const { stdout, stderr } = await execAsync(
    // --preprocess flag tells pipeline.py to call preprocess_scanned_image()
    // which handles perspective correction, glare removal, sharpening
    `"${OCR_PYTHON_PATH}" "${OCR_PIPELINE_PATH}" --input "${imagePath}" --preprocess`,
    { timeout: 90_000 }
  );

  if (stderr) {
    // pipeline.py prints progress lines to stderr; filter out normal output
    const errLines = stderr.split('\n').filter(
      l => l && !l.startsWith('✅') && !l.startsWith('🔧') && !l.startsWith('    ')
    );
    if (errLines.length > 0) {
      logger.warn('OCR script stderr: ' + errLines.join('\n'));
    }
  }

  // stdout may contain print() lines before the final JSON — extract last valid JSON
  const lines = stdout.trim().split('\n');
  let result: any = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      result = JSON.parse(lines[i]);
      break;
    } catch {
      continue;
    }
  }

  if (!result) {
    throw new Error('OCR script produced no valid JSON output. stdout: ' + stdout.slice(0, 300));
  }

  return {
    success: true,
    data: result
  };
}

/**
 * Check if OCR service is available
 */
export async function checkOCRHealth(): Promise<boolean> {
  try {
    const response = await _fetch(`${OCR_SERVICE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Start OCR service if not running
 */
export async function startOCRService(): Promise<void> {
  const isHealthy = await checkOCRHealth();
  
  if (isHealthy) {
    logger.info('OCR service already running');
    return;
  }

  logger.info('Starting OCR service...');
  
  const serverPath = path.join(__dirname, '../../../aadhaar-pipeline/run_server.py');
  
  if (!fs.existsSync(serverPath)) {
    throw new Error(`OCR server script not found: ${serverPath}`);
  }

  exec(
    `"${OCR_PYTHON_PATH}" "${serverPath}" --host 0.0.0.0 --port 8002`,
    (error, stdout, stderr) => {
      if (error) {
        logger.error('OCR server error: ' + error.message);
      }
    }
  );

  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (await checkOCRHealth()) {
      logger.info('OCR service started successfully');
      return;
    }
    
    attempts++;
  }

  throw new Error('OCR service failed to start');
}