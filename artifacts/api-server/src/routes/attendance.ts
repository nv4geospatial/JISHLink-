import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, AuthRequest } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

/** POST /api/attendance — log attendance */
router.post("/", async (req: AuthRequest, res) => {
  const { type, latitude, longitude, resolved_address } = req.body as {
    type: string; latitude?: number; longitude?: number; resolved_address?: string;
  };

  const { data, error } = await supabase
    .from("attendance_logs")
    .insert({
      employee_id: req.user!.employee_id,
      type,
      timestamp: new Date().toISOString(),
      latitude,
      longitude,
      resolved_address,
    })
    .select()
    .single();

  if (error) { res.status(400).json({ error: error.message }); return; }

  // Notify recruiter on login/signoff
  const { data: employee } = await supabase
    .from("employees")
    .select("full_name, reporting_manager_id")
    .eq("id", req.user!.employee_id)
    .single();

  if (employee?.reporting_manager_id) {
    const action = type === "login" ? "logged in" : type === "signoff" ? "signed off" : "marked attendance";
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    await supabase.from("notifications").insert({
      user_id: employee.reporting_manager_id,
      message: `${employee.full_name} has ${action} at ${timeStr}${resolved_address ? ` from ${resolved_address}` : ""}`,
    });
  }

  res.status(201).json(data);
});

/** GET /api/attendance/my — own logs */
router.get("/my", async (req: AuthRequest, res) => {
  const days = Number(req.query["days"] ?? 30);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("attendance_logs")
    .select("*")
    .eq("employee_id", req.user!.employee_id)
    .gte("timestamp", since)
    .order("timestamp", { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

/** GET /api/attendance/today-status */
router.get("/today-status", async (req: AuthRequest, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("attendance_logs")
    .select("*")
    .eq("employee_id", req.user!.employee_id)
    .gte("timestamp", today.toISOString())
    .order("timestamp");

  const loginEntry = data?.find((l) => l.type === "login");
  const signoffEntry = data?.find((l) => l.type === "signoff");

  res.json({
    logged_in: !!loginEntry,
    signed_off: !!signoffEntry,
    login_time: loginEntry?.timestamp ?? null,
    signoff_time: signoffEntry?.timestamp ?? null,
    login_address: loginEntry?.resolved_address ?? null,
  });
});

/** GET /api/attendance/tracking — recruiter attendance tracking */
router.get("/tracking", async (req: AuthRequest, res) => {
  // Role check
  if (!req.user || (req.user.role !== "recruiter" && req.user.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { date, employee_id } = req.query as { date?: string; employee_id?: string };
  const targetDate = date ? new Date(date) : new Date();
  targetDate.setHours(0, 0, 0, 0);
  const nextDay = new Date(targetDate);
  nextDay.setDate(nextDay.getDate() + 1);

  let query = supabase
    .from("employees")
    .select("*, workplace:workplaces(*)")
    .eq("employment_status", "active");

  if (req.user!.role === "recruiter") {
    query = query.eq("reporting_manager_id", req.user!.employee_id);
  }
  if (employee_id) {
    query = query.eq("id", employee_id);
  }

  const { data: employees } = await query;
  const ids = (employees ?? []).map((e) => e.id);

  const { data: logs } = ids.length > 0
    ? await supabase
        .from("attendance_logs")
        .select("*")
        .in("employee_id", ids)
        .gte("timestamp", targetDate.toISOString())
        .lt("timestamp", nextDay.toISOString())
    : { data: [] };

  const records = (employees ?? []).map((emp) => {
    const empLogs = (logs ?? []).filter((l) => l.employee_id === emp.id);
    const login = empLogs.find((l) => l.type === "login");
    const signoff = empLogs.find((l) => l.type === "signoff");

    let status: "present" | "absent" | "late" | "early_exit" = "absent";
    if (login) {
      status = "present";
      if (emp.shift_start_time) {
        const [h, m] = emp.shift_start_time.split(":").map(Number);
        const shiftStart = new Date(targetDate);
        shiftStart.setHours(h, m, 0, 0);
        if (new Date(login.timestamp) > shiftStart) {
          status = "late";
        }
      }
      if (signoff && emp.shift_end_time) {
        const [h, m] = emp.shift_end_time.split(":").map(Number);
        const shiftEnd = new Date(targetDate);
        shiftEnd.setHours(h, m, 0, 0);
        if (new Date(signoff.timestamp) < shiftEnd) {
          status = "early_exit";
        }
      }
    }

    return {
      employee_id: emp.id,
      employee_name: emp.full_name,
      date: date || targetDate.toISOString().split("T")[0],
      login_time: login?.timestamp ?? null,
      login_address: login?.resolved_address ?? null,
      signoff_time: signoff?.timestamp ?? null,
      signoff_address: signoff?.resolved_address ?? null,
      status,
      shift_start: emp.shift_start_time,
      shift_end: emp.shift_end_time,
    };
  });

  res.json(records);
});

export { router as attendanceRouter };
  function requireRole(arg0: string, arg1: string) {
    throw new Error("Function not implemented.");
  }

