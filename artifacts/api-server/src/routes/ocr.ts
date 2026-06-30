import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { extractAadhaar, checkOCRHealth, AadhaarResult } from '../lib/ocr_service';

const router = Router();

// Extend Express Request to include user
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    [key: string]: any;
  };
}

// Configure multer for image uploads
const upload = multer({
  dest: path.join(process.cwd(), 'uploads', 'ocr'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// OCR Service configuration
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:8002';

/**
 * POST /api/ocr/extract
 * Upload Aadhaar image and extract data
 */
router.post('/extract', upload.single('image'), async (req: AuthenticatedRequest, res: Response) => {
  let uploadedFilePath: string | null = null;
  
  try {
    // Accept field name "image" (from scanner.tsx) or "file" (legacy)
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image uploaded. Send the image as multipart field named "image".' });
    }

    uploadedFilePath = req.file.path;
    const userId = req.user?.id;

    logger.info(`OCR extraction requested for: ${req.file.originalname || 'unnamed'} (${req.file.size} bytes)`);

    // Reject files that are clearly too small to contain a readable card
    if (req.file.size < 20 * 1024) {
      return res.status(400).json({ success: false, error: 'Image file is too small (< 20KB). Please upload a higher-quality photo.' });
    }

    let result: AadhaarResult;
    
    try {
      // Use the OCR service (tries API first, falls back to direct execution)
      result = await extractAadhaar(uploadedFilePath);
    } catch (error) {
      throw new Error('OCR extraction failed: ' + (error instanceof Error ? error.message : String(error)));
    }

    // Store result in Supabase if user is authenticated and data exists
    if (userId && result.success && result.data) {
      const { error } = await supabase
        .from('aadhaar_extractions')
        .insert({
          user_id: userId,
          image_name: req.file.originalname,
          extracted_data: result.data,
          confidence: result.data.confidence || {},
          quality: result.data.quality || {},
          created_at: new Date().toISOString()
        });

      if (error) {
        logger.error('Supabase insert error: ' + JSON.stringify(error));
      }
    }

    // Clean up uploaded file
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      fs.unlinkSync(uploadedFilePath);
    }

    return res.json({
      success: result.success,
      data: result.data || null,
      error: result.error || null
    });

  } catch (error) {
    logger.error('OCR extraction error: ' + (error instanceof Error ? error.message : String(error)));
    
    // Clean up on error
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      fs.unlinkSync(uploadedFilePath);
    }
    
    return res.status(500).json({
      success: false,
      error: 'OCR extraction failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/ocr/health
 * Check OCR service health
 */
/**
 * GET /api/ocr/health
 * Check OCR service health
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const isHealthy = await checkOCRHealth();
    if (isHealthy) {
      return res.json({ success: true, ocr_service: { status: 'ok' } });
    }
    // OCR service offline, but API server is healthy
    return res.json({ 
      success: true, 
      ocr_service: { status: 'offline', note: 'Scanner temporarily unavailable' },
      api: { status: 'ok' }
    });
  } catch (error) {
    // OCR service offline, but API server is healthy
    return res.json({ 
      success: true, 
      ocr_service: { status: 'offline', note: 'Scanner temporarily unavailable' },
      api: { status: 'ok' }
    });
  }
});
/**
 * GET /api/ocr/history
 * Get user's OCR extraction history
 */
router.get('/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { data, error } = await supabase
      .from('aadhaar_extractions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(JSON.stringify(error));
    }

    return res.json({ success: true, data });
  } catch (error) {
    logger.error('OCR history error: ' + (error instanceof Error ? error.message : String(error)));
    return res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

export const ocrRouter = router;

// Python OCR service process management
let pythonProcess: ReturnType<typeof exec> | null = null;

export function startPythonOCRService(): void {
  const OCR_PYTHON_PATH = process.env.OCR_PYTHON_PATH || 'python3';
  const OCR_PIPELINE_PATH = process.env.OCR_PIPELINE_PATH || path.join(process.cwd(), 'aadhaar-pipeline', 'run_server.py');
  
  if (!fs.existsSync(OCR_PIPELINE_PATH)) {
    logger.warn('OCR server script not found: ' + OCR_PIPELINE_PATH);
    return;
  }

  if (!fs.existsSync(OCR_PYTHON_PATH)) {
    logger.error('Python executable not found: ' + OCR_PYTHON_PATH);
    return;
  }

  logger.info('Starting Python OCR service using: ' + OCR_PYTHON_PATH);
  
  pythonProcess = exec(
    `"${OCR_PYTHON_PATH}" "${OCR_PIPELINE_PATH}" --host 127.0.0.1 --port 8002`,
    (error, stdout, stderr) => {
      if (error) {
        logger.error('Python OCR service error: ' + error.message);
      }
    }
  );
  
  logger.info('Python OCR service started (PID: ' + (pythonProcess.pid || 'unknown') + ')');
}

export function stopPythonOCRService(): void {
  if (pythonProcess) {
    logger.info('Stopping Python OCR service...');
    pythonProcess.kill();
    pythonProcess = null;
  }
}