import app from "./app";
import { logger } from "./lib/logger";
import 'dotenv/config';

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

// Production: Python OCR service runs separately as a systemd service / Docker container / PM2 process
// Development: Start manually with: cd artifacts/aadhaar-pipeline && venv\Scripts\Activate.ps1 && python run_server.py --port 8002
// Node.js connects to it via HTTP on OCR_SERVICE_URL (default: http://localhost:8002)
app.listen(port, "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
