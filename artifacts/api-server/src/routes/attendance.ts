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

export { router as attendanceRouter };
