import app from "./app";
import { logger } from "./lib/logger";
import 'dotenv/config';
import { ocrRouter, startPythonOCRService, stopPythonOCRService } from "./routes/ocr.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Start the Python OCR microservice before accepting requests
startPythonOCRService();

// Graceful shutdown — kill Python service when Node exits
process.on("SIGTERM", () => { stopPythonOCRService(); process.exit(0); });
process.on("SIGINT",  () => { stopPythonOCRService(); process.exit(0); });

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
