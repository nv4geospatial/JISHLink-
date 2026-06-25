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
  // Use local date for today
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayDayName = dayNames[today.getDay()];

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


  // Get today's absence notes for all employees (check both date field and created_at)
  const todayStr = today.toISOString().split("T")[0];
  const todayStart = today.toISOString();
  const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();
  
  // Try by date field first
  // Get today's absence notes for all employees
  let { data: todayAbsences } = ids.length > 0
    ? await supabase
        .from("absence_notes")
        .select("*")
        .in("employee_id", ids)
        .eq("date", todayStr)
    : { data: [] };
    
  // If no results, try by created_at as fallback
  if ((todayAbsences ?? []).length === 0 && ids.length > 0) {
    const { data: createdAtAbsences } = await supabase
      .from("absence_notes")
      .select("*")
      .in("employee_id", ids)
      .gte("created_at", todayStart)
      .lt("created_at", todayEnd);
      
    todayAbsences = createdAtAbsences ?? [];
  }

  const statusMap = employees.map((emp) => {
    const logs = (todayLogs ?? []).filter((l) => l.employee_id === emp.id);
    const loginEntry = logs.find((l) => l.type === "login");
    const signoffEntry = logs.find((l) => l.type === "signoff");
    const hasAbsenceNote = (todayAbsences ?? []).some((a) => a.employee_id === emp.id);
    
    // DEBUG
    console.log(`Employee ${emp.full_name}: hasAbsenceNote=${hasAbsenceNote}, todayAbsencesCount=${(todayAbsences ?? []).length}, date=${today.toISOString().split("T")[0]}`);
    
    // Check if shift is configured for today
    const shiftDays = (emp.shift_days ?? "Mon,Tue,Wed,Thu,Fri,Sat").split(",");
    const hasShiftToday = shiftDays.includes(todayDayName);
    
    // Check if shift start time has passed by 1 hour
    let shiftStatus = "no_shift";
    let shiftOverdue = false;
    
    if (hasShiftToday && emp.shift_start_time) {
      const [hours, minutes] = emp.shift_start_time.split(":").map(Number);
      const shiftStart = new Date(today);
      shiftStart.setHours(hours, minutes, 0, 0);
      const shiftEnd = new Date(shiftStart.getTime() + 60 * 60 * 1000); // 1 hour after shift start
      
      if (today < shiftStart) {
        shiftStatus = "upcoming";
      } else if (today >= shiftStart && today < shiftEnd) {
        shiftStatus = "in_window";
      } else {
        shiftStatus = "overdue";
        shiftOverdue = true;
      }
    }

    // Send shift overdue notification to employee (only if not already logged in and not already sent today)
    if (shiftOverdue && !loginEntry && !hasAbsenceNote) {
      // Check if notification already sent today
      const todayStart = today.toISOString();
      const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();
      supabase.from("notifications")
        .select("id")
        .eq("user_id", emp.id)
        .ilike("message", "%shift has started%")
        .gte("created_at", todayStart)
        .lt("created_at", todayEnd)
        .then(({ data: existingNotif }) => {
          if (!existingNotif || existingNotif.length === 0) {
            supabase.from("notifications").insert({
              user_id: emp.id,
              message: `Your shift has started at ${emp.shift_start_time}. Please log in now!`,
            });
            // Also notify recruiter
            if (emp.reporting_manager_id) {
              supabase.from("notifications").insert({
                user_id: emp.reporting_manager_id,
                message: `${emp.full_name} has not logged in. Shift started at ${emp.shift_start_time}.`,
              });
            }
          }
        });
    }

    // Send 15-min before shift notification
    if (hasShiftToday && emp.shift_start_time && !loginEntry) {
      const [hours, minutes] = emp.shift_start_time.split(":").map(Number);
      const shiftStart = new Date(today);
      shiftStart.setHours(hours, minutes, 0, 0);
      const fifteenMinBefore = new Date(shiftStart.getTime() - 15 * 60 * 1000);
      const now = new Date();
      
      if (now >= fifteenMinBefore && now < shiftStart) {
        const todayStart = today.toISOString();
        const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();
        supabase.from("notifications")
          .select("id")
          .eq("user_id", emp.id)
          .ilike("message", "%Shift starts in 15 minutes%")
          .gte("created_at", todayStart)
          .lt("created_at", todayEnd)
          .then(({ data: existingNotif }) => {
            if (!existingNotif || existingNotif.length === 0) {
              supabase.from("notifications").insert({
                user_id: emp.id,
                message: `Shift starts in 15 minutes (${emp.shift_start_time}). Get ready!`,
              });
            }
          });
      }
    }

    return {
      employee: emp,
      logged_in: !!loginEntry,
      signed_off: !!signoffEntry,
      login_time: loginEntry?.timestamp ?? null,
      signoff_time: signoffEntry?.timestamp ?? null,
      login_address: loginEntry?.resolved_address ?? null,
      shift_status: shiftStatus,
      shift_overdue: shiftOverdue,
      has_shift_today: hasShiftToday,
      has_absence_note: hasAbsenceNote,
    };
  });

  res.json({
    team_count: employees.length,
    signed_in_today: statusMap.filter((s) => s.logged_in).length,
    not_signed_in: statusMap.filter((s) => !s.logged_in).length,
    shift_overdue_count: statusMap.filter((s) => s.shift_overdue && !s.logged_in).length,
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

/** GET /api/dashboard/documents — all documents (admin) or recruiter's team documents */
router.get("/documents", requireAuth, async (req: AuthRequest, res) => {
  let query = supabase
    .from("employee_documents")
    .select("*, employee:employees(id, full_name, employee_code, reporting_manager_id)")
    .order("created_at", { ascending: false });

  if (req.user!.role === "recruiter") {
    // Get recruiter's employees first
    const { data: myEmployees } = await supabase
      .from("employees")
      .select("id")
      .eq("reporting_manager_id", req.user!.employee_id);
    const employeeIds = (myEmployees ?? []).map((e) => e.id);
    if (employeeIds.length === 0) {
      res.json([]);
      return;
    }
    query = query.in("employee_id", employeeIds);
  } else if (req.user!.role === "employee") {
    query = query.eq("employee_id", req.user!.employee_id);
  }

  const { data, error } = await query;
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json(data ?? []);
});

export { router as dashboardRouter };
