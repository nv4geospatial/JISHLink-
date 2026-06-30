import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { shiftsRouter } from "./routes/shifts.js";
import { ocrRouter } from "./routes/ocr";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));


app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "jishlink-api", timestamp: new Date().toISOString() });
});

app.use("/api", router);
app.use("/api/shifts", shiftsRouter);
app.use("/api/ocr", ocrRouter);

export default app;
