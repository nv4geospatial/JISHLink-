import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, AuthRequest } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

/** GET /api/dashboard/admin */
router.get("/admin", requireRole("admin"), async (req: AuthRequest, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [total, active, pending, todayLogins, unreadNotif] = await Promise.all([
    supabase.from("employees").select("*", { count: "exact", head: true }),
    supabase.from("employees").select("*", { count: "exact", head: true }).eq("employment_status", "active"),
    supabase.from("pending_submissions").select("*", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("attendance_logs").select("employee_id", { count: "exact" }).eq("type", "login").gte("timestamp", today.toISOString()),
    supabase.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", req.user!.employee_id).eq("read", false),
  ]);

  const activeCount = active.count ?? 0;
  const todaySignIns = todayLogins.count ?? 0;
  const absentToday = Math.max(0, activeCount - todaySignIns);

  res.json({
    total_employees: total.count ?? 0,
    active_employees: activeCount,
    pending_approvals: pending.count ?? 0,
    today_sign_ins: todaySignIns,
    absent_today: absentToday,
    unread_notifications: unreadNotif.count ?? 0,
  });
});

/** GET /api/dashboard/recruiter */
router.get("/recruiter", requireRole("recruiter", "admin"), async (req: AuthRequest, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: myEmployees } = await supabase
    .from("employees")
    .select("*, workplace:workplaces(id, name, client_name, address)")
    .eq("reporting_manager_id", req.user!.employee_id)
    .eq("employment_status", "active");

  const employees = myEmployees ?? [];
  const ids = employees.map((e) => e.id);

  const { data: todayLogs } = ids.length > 0
    ? await supabase
        .from("attendance_logs")
        .select("*")
        .in("employee_id", ids)
        .gte("timestamp", today.toISOString())
    : { data: [] };

  const statusMap = employees.map((emp) => {
    const logs = (todayLogs ?? []).filter((l) => l.employee_id === emp.id);
    const loginEntry = logs.find((l) => l.type === "login");
    const signoffEntry = logs.find((l) => l.type === "signoff");
    return {
      employee: emp,
      logged_in: !!loginEntry,
      signed_off: !!signoffEntry,
      login_time: loginEntry?.timestamp ?? null,
      signoff_time: signoffEntry?.timestamp ?? null,
      login_address: loginEntry?.resolved_address ?? null,
    };
  });

  res.json({
    team_count: employees.length,
    signed_in_today: statusMap.filter((s) => s.logged_in).length,
    not_signed_in: statusMap.filter((s) => !s.logged_in).length,
    employees: statusMap,
  });
});

/** GET /api/recruiter-oversight */
router.get("/recruiter-oversight", requireRole("admin"), async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  const { data: recruiters } = await supabase
    .from("employees")
    .select("*")
    .eq("role", "recruiter")
    .eq("employment_status", "active");

  if (!recruiters || recruiters.length === 0) {
    res.json([]);
    return;
  }

  const results = await Promise.all(
    recruiters.map(async (recruiter) => {
      const { data: team } = await supabase
        .from("employees")
        .select("id")
        .eq("reporting_manager_id", recruiter.id);

      const ids = (team ?? []).map((e) => e.id);

      const [todayLogins, absenceNotes, reassignments] = await Promise.all([
        ids.length > 0
          ? supabase.from("attendance_logs").select("employee_id", { count: "exact" }).in("employee_id", ids).eq("type", "login").gte("timestamp", today.toISOString())
          : Promise.resolve({ count: 0 }),
        supabase.from("absence_notes").select("*", { count: "exact", head: true }).eq("recruiter_id", recruiter.id).gte("created_at", monthStart),
        supabase.from("audit_logs").select("*", { count: "exact", head: true }).eq("actor_id", recruiter.id).eq("action", "reassign_employee").gte("timestamp", monthStart),
      ]);

      const signedIn = (todayLogins as { count: number }).count ?? 0;
      return {
        recruiter,
        total_employees: ids.length,
        signed_in_today: signedIn,
        not_signed_in_today: Math.max(0, ids.length - signedIn),
        absence_notes_this_month: absenceNotes.count ?? 0,
        reassignments_this_month: reassignments.count ?? 0,
      };
    })
  );

  res.json(results);
});

export { router as dashboardRouter };
