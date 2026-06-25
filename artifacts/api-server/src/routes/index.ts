import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import { authRouter } from "./auth.js";
import { employeesRouter } from "./employees.js";
import { recruitersRouter } from "./recruiters.js";
import { workplacesRouter } from "./workplaces.js";
import { attendanceRouter } from "./attendance.js";
import { absenceRouter } from "./absence.js";
import { submissionsRouter } from "./submissions.js";
import { notificationsRouter } from "./notifications.js";
import { dashboardRouter } from "./dashboard.js";
import { intakeRouter } from "./intake.js";
import { designationsRouter } from "./designations.js";
import { recruiterOversightRouter } from "./recruiter-oversight.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/employees", employeesRouter);
router.use("/recruiters", recruitersRouter);
router.use("/workplaces", workplacesRouter);
router.use("/attendance", attendanceRouter);
router.use("/absence-notes", absenceRouter);
router.use("/submissions", submissionsRouter);
router.use("/notifications", notificationsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/recruiter-oversight", recruiterOversightRouter);
// Health check endpoint
router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
router.use("/intake", intakeRouter);
router.use("/designations", designationsRouter);

export default router;
