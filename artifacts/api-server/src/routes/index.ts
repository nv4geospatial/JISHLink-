import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import { authRouter } from "./auth.js";
import { employeesRouter } from "./employees.js";
import { workplacesRouter } from "./workplaces.js";
import { attendanceRouter } from "./attendance.js";
import { absenceRouter } from "./absence.js";
import { submissionsRouter } from "./submissions.js";
import { notificationsRouter } from "./notifications.js";
import { dashboardRouter } from "./dashboard.js";
import { intakeRouter } from "./intake.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/employees", employeesRouter);
router.use("/workplaces", workplacesRouter);
router.use("/attendance", attendanceRouter);
router.use("/absence-notes", absenceRouter);
router.use("/submissions", submissionsRouter);
router.use("/notifications", notificationsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/recruiter-oversight", dashboardRouter);
router.use("/intake", intakeRouter);

export default router;
