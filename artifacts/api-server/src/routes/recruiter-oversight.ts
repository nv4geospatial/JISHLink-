import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, AuthRequest } from "../middlewares/auth.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("admin"));

/** GET /api/recruiter-oversight — list all recruiters with their employee stats */
router.get("/", async (req: AuthRequest, res) => {
  // Get all recruiters
  const { data: recruiters, error: recruitersError } = await supabase
    .from("employees")
    .select("id, full_name, designation")
    .eq("role", "recruiter")
    .eq("employment_status", "active");

  if (recruitersError) {
    res.status(500).json({ error: recruitersError.message });
    return;
  }

  if (!recruiters || recruiters.length === 0) {
    res.json([]);
    return;
  }

  // Get today's date range
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

  // Get month start
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  const result = await Promise.all(
    recruiters.map(async (recruiter) => {
      // Get all employees assigned to this recruiter (via reporting_manager_id or recruiter_name)
      const { data: employees, error: empError } = await supabase
        .from("employees")
        .select("id")
        .or(`reporting_manager_id.eq.${recruiter.id},recruiter_name.ilike.%${recruiter.full_name}%`)
        .eq("role", "employee");

      if (empError) {
        return {
          recruiter: { id: recruiter.id, full_name: recruiter.full_name, designation: recruiter.designation },
          total_employees: 0,
          signed_in_today: 0,
          not_signed_in_today: 0,
          absence_notes_this_month: 0,
          reassignments_this_month: 0,
        };
      }

      const employeeIds = (employees ?? []).map((e) => e.id);
      const totalEmployees = employeeIds.length;

      // Signed in today
      let signedInToday = 0;
      if (employeeIds.length > 0) {
        const { data: signIns } = await supabase
          .from("attendance_logs")
          .select("employee_id")
          .in("employee_id", employeeIds)
          .eq("type", "login")
          .gte("timestamp", todayStart)
          .lt("timestamp", todayEnd);

        // Count unique employees who signed in
        const signedInIds = new Set((signIns ?? []).map((a) => a.employee_id));
        signedInToday = signedInIds.size;
      }

      const notSignedInToday = totalEmployees - signedInToday;

      // Absence notes this month
      let absenceNotes = 0;
      if (employeeIds.length > 0) {
        const { count } = await supabase
          .from("absence_notes")
          .select("*", { count: "exact", head: true })
          .in("employee_id", employeeIds)
          .gte("created_at", monthStart);
        absenceNotes = count ?? 0;
      }

      // Reassignments this month (from audit logs)
      let reassignments = 0;
      if (employeeIds.length > 0) {
        const { count } = await supabase
          .from("audit_logs")
          .select("*", { count: "exact", head: true })
          .in("target_id", employeeIds)
          .eq("action", "reassign_employee")
          .gte("timestamp", monthStart);
        reassignments = count ?? 0;
      }

      return {
        recruiter: { id: recruiter.id, full_name: recruiter.full_name, designation: recruiter.designation },
        total_employees: totalEmployees,
        signed_in_today: signedInToday,
        not_signed_in_today: notSignedInToday,
        absence_notes_this_month: absenceNotes,
        reassignments_this_month: reassignments,
      };
    })
  );

  res.json(result);
});

/** GET /api/recruiter-oversight/:id — single recruiter oversight for admin */
router.get("/:id", async (req: AuthRequest, res) => {
  const recruiterId = String(req.params["id"]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  // Get recruiter details
  const { data: recruiter } = await supabase
    .from("employees")
    .select("*, workplace:workplaces(*)")
    .eq("id", recruiterId)
    .single();

  if (!recruiter) {
    res.status(404).json({ error: "Recruiter not found" });
    return;
  }

  // Get team
  const { data: team } = await supabase
    .from("employees")
    .select("*, workplace:workplaces(id, name, client_name, address)")
    .eq("reporting_manager_id", recruiterId)
    .eq("employment_status", "active");

  const employees = team ?? [];
  const ids = employees.map((e) => e.id);

  // Get today's logs
  const { data: todayLogs } = ids.length > 0
    ? await supabase.from("attendance_logs").select("*").in("employee_id", ids).gte("timestamp", today.toISOString())
    : { data: [] };

  // Get today's absences
  const todayStr = today.toISOString().split("T")[0];
  let { data: todayAbsences } = ids.length > 0
    ? await supabase.from("absence_notes").select("*").in("employee_id", ids).eq("date", todayStr)
    : { data: [] };

  if ((todayAbsences ?? []).length === 0 && ids.length > 0) {
    const todayStart = today.toISOString();
    const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const { data: createdAtAbsences } = await supabase
      .from("absence_notes").select("*").in("employee_id", ids).gte("created_at", todayStart).lt("created_at", todayEnd);
    todayAbsences = createdAtAbsences ?? [];
  }

  // Get month stats
  const [absenceNotesMonth, reassignmentsMonth] = await Promise.all([
    supabase.from("absence_notes").select("*", { count: "exact", head: true }).eq("recruiter_id", recruiterId).gte("created_at", monthStart),
    supabase.from("audit_logs").select("*", { count: "exact", head: true }).eq("actor_id", recruiterId).eq("action", "reassign_employee").gte("timestamp", monthStart),
  ]);

  // Build employee status map
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayDayName = dayNames[today.getDay()];

  const employeeStatuses = employees.map((emp) => {
    const logs = (todayLogs ?? []).filter((l) => l.employee_id === emp.id);
    const loginEntry = logs.find((l) => l.type === "login");
    const signoffEntry = logs.find((l) => l.type === "signoff");
    const hasAbsenceNote = (todayAbsences ?? []).some((a) => a.employee_id === emp.id);

    const shiftDays = (emp.shift_days ?? "Mon,Tue,Wed,Thu,Fri,Sat").split(",");
    const hasShiftToday = shiftDays.includes(todayDayName);
    let shiftOverdue = false;

    if (hasShiftToday && emp.shift_start_time) {
      const [hours, minutes] = emp.shift_start_time.split(":").map(Number);
      const shiftStart = new Date(today);
      shiftStart.setHours(hours, minutes, 0, 0);
      const shiftEnd = new Date(shiftStart.getTime() + 60 * 60 * 1000);
      shiftOverdue = today >= shiftEnd;
    }

    return {
      employee: emp,
      logged_in: !!loginEntry,
      signed_off: !!signoffEntry,
      login_time: loginEntry?.timestamp ?? null,
      signoff_time: signoffEntry?.timestamp ?? null,
      login_address: loginEntry?.resolved_address ?? null,
      shift_overdue: shiftOverdue,
      has_shift_today: hasShiftToday,
      has_absence_note: hasAbsenceNote,
    };
  });

  const signedIn = employeeStatuses.filter((s) => s.logged_in).length;

  res.json({
    recruiter,
    stats: {
      total_employees: employees.length,
      signed_in_today: signedIn,
      not_signed_in: employees.length - signedIn,
      shift_overdue_count: employeeStatuses.filter((s) => s.shift_overdue && !s.logged_in).length,
      absence_notes_this_month: absenceNotesMonth.count ?? 0,
      reassignments_this_month: reassignmentsMonth.count ?? 0,
    },
    employees: employeeStatuses,
  });
});

export { router as recruiterOversightRouter };