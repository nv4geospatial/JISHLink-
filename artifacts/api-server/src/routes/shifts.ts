import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, AuthRequest } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

/** GET /api/shifts/templates — get recruiter's templates */
router.get("/templates", async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("shift_templates")
    .select("*")
    .eq("recruiter_id", req.user!.employee_id)
    .order("name");

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

/** POST /api/shifts/templates — create template */
router.post("/templates", async (req: AuthRequest, res) => {
  // Role check
  if (!req.user || (req.user.role !== "recruiter" && req.user.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name, start_time, end_time, days } = req.body as {
    name: string; start_time: string; end_time: string; days?: string;
  };

  const { data, error } = await supabase
    .from("shift_templates")
    .insert({ recruiter_id: req.user!.employee_id, name, start_time, end_time, days: days ?? "Mon,Tue,Wed,Thu,Fri,Sat" })
    .select()
    .single();

  if (error) { res.status(400).json({ error: error.message }); return; }
  res.status(201).json(data);
});

/** GET /api/shifts/assignments/:employee_id — get employee's current shift */
router.get("/assignments/:employee_id", async (req: AuthRequest, res) => {
  const employeeId = String(req.params["employee_id"]);
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("shift_assignments")
    .select("*, template:shift_templates(*)")
    .eq("employee_id", employeeId)
    .lte("start_date", today)
    .gte("end_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    res.status(404).json({ error: "No active shift assignment" });
    return;
  }
  res.json(data);
});

/** POST /api/shifts/assign — assign shift to employee(s) */
router.post("/assign", async (req: AuthRequest, res) => {
  // Role check
  if (!req.user || (req.user.role !== "recruiter" && req.user.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { employee_ids, template_id, start_date, end_date } = req.body as {
    employee_ids: string[]; template_id: string; start_date: string; end_date: string;
  };

  // Verify all employees belong to this recruiter
  if (req.user!.role === "recruiter") {
    const { data: employees } = await supabase
      .from("employees")
      .select("id")
      .in("id", employee_ids)
      .eq("reporting_manager_id", req.user!.employee_id);

    if ((employees ?? []).length !== employee_ids.length) {
      res.status(403).json({ error: "You can only assign shifts to your own employees" });
      return;
    }
  }

  const assignments = employee_ids.map((empId) => ({
    employee_id: empId,
    template_id,
    start_date,
    end_date,
    created_by: req.user!.employee_id,
  }));

  const { data, error } = await supabase
    .from("shift_assignments")
    .insert(assignments)
    .select();

  if (error) { res.status(400).json({ error: error.message }); return; }
  res.status(201).json({ assigned: data?.length ?? 0 });
});

export { router as shiftsRouter };