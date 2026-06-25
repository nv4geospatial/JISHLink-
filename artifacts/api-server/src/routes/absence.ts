import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, AuthRequest } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

/** POST /api/absence-notes */
router.post("/", requireRole("recruiter", "admin"), async (req: AuthRequest, res) => {
  const { employee_id, date, reason, notes } = req.body as {
    employee_id: string; date: string; reason: string; notes?: string;
  };

  // Ensure date is in YYYY-MM-DD format
  const formattedDate = date ? new Date(date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
  
  const { data, error } = await supabase
    .from("absence_notes")
    .insert({
      employee_id,
      date: formattedDate,
      recruiter_id: req.user!.employee_id,
      reason,
      notes,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) { res.status(400).json({ error: error.message }); return; }

  await supabase.from("audit_logs").insert({
    actor_id: req.user!.employee_id,
    action: "create_absence_note",
    target_table: "absence_notes",
    target_id: data.id,
    new_value: data,
  });

  // Notify employee about absence note
  const { data: employee } = await supabase
    .from("employees")
    .select("full_name")
    .eq("id", employee_id)
    .single();

  await supabase.from("notifications").insert({
    user_id: employee_id,
    message: `Your recruiter has marked you as absent on ${formattedDate}. Reason: ${reason}`,
  });

  // Notify admin about absence note
  const { data: admins } = await supabase.from("employees").select("id").eq("role", "admin");
  for (const admin of admins ?? []) {
    await supabase.from("notifications").insert({
      user_id: admin.id,
      message: `Absence note created for ${employee?.full_name ?? "employee"} on ${formattedDate} by ${req.user!.username}`,
    });
  }

  res.status(201).json(data);
});

/** GET /api/absence-notes/summary — leave summary by employee */
router.get("/summary", async (req: AuthRequest, res) => {
  // Role check
  if (!req.user || (req.user.role !== "recruiter" && req.user.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const yearStart = new Date(today.getFullYear(), 0, 1).toISOString();

  let empQuery = supabase
    .from("employees")
    .select("id, full_name")
    .eq("employment_status", "active");

  if (req.user!.role === "recruiter") {
    empQuery = empQuery.eq("reporting_manager_id", req.user!.employee_id);
  }

  const { data: employees } = await empQuery;
  const ids = (employees ?? []).map((e) => e.id);

  if (ids.length === 0) {
    res.json([]);
    return;
  }

  const { data: allNotes } = await supabase
    .from("absence_notes")
    .select("*")
    .in("employee_id", ids);

  const { data: monthNotes } = await supabase
    .from("absence_notes")
    .select("*")
    .in("employee_id", ids)
    .gte("created_at", monthStart);

  const { data: yearNotes } = await supabase
    .from("absence_notes")
    .select("*")
    .in("employee_id", ids)
    .gte("created_at", yearStart);

  const summary = (employees ?? []).map((emp) => ({
    employee_id: emp.id,
    employee_name: emp.full_name,
    total_leaves: (allNotes ?? []).filter((n) => n.employee_id === emp.id).length,
    this_month: (monthNotes ?? []).filter((n) => n.employee_id === emp.id).length,
    this_year: (yearNotes ?? []).filter((n) => n.employee_id === emp.id).length,
  }));

  res.json(summary);
});

/** GET /api/absence-notes/details — all absence details */
router.get("/details", async (req: AuthRequest, res) => {
  // Role check
  if (!req.user || (req.user.role !== "recruiter" && req.user.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let empQuery = supabase
    .from("employees")
    .select("id, full_name")
    .eq("employment_status", "active");

  if (req.user!.role === "recruiter") {
    empQuery = empQuery.eq("reporting_manager_id", req.user!.employee_id);
  }

  const { data: employees } = await empQuery;
  const ids = (employees ?? []).map((e) => e.id);

  if (ids.length === 0) {
    res.json([]);
    return;
  }

  const { data: notes, error: notesError } = await supabase
    .from("absence_notes")
    .select("*")
    .in("employee_id", ids)
    .order("created_at", { ascending: false });

  if (notesError) {
    res.status(500).json({ error: notesError.message });
    return;
  }

  // Build employee name lookup from already-fetched employees
  const nameMap = new Map((employees ?? []).map(e => [e.id, e.full_name]));

  const formatted = (notes ?? []).map((n) => ({
    id: n.id,
    employee_id: n.employee_id,
    employee_name: nameMap.get(n.employee_id) ?? "Unknown",
    date: n.date,
    reason: n.reason,
    notes: n.notes,
    created_at: n.created_at,
  }));

  res.json(formatted);
});

/** POST /api/call-logs — log a call to employee */
router.post("/call-log", async (req: AuthRequest, res) => {
  // Role check
  if (!req.user || (req.user.role !== "recruiter" && req.user.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { employee_id } = req.body as { employee_id: string };

  const { data, error } = await supabase
    .from("call_logs")
    .insert({
      employee_id,
      recruiter_id: req.user!.employee_id,
      called_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) { res.status(400).json({ error: error.message }); return; }

  // Notify employee that recruiter called them
  const { data: employee } = await supabase
    .from("employees")
    .select("full_name")
    .eq("id", employee_id)
    .single();

  const { data: recruiter } = await supabase
    .from("employees")
    .select("full_name")
    .eq("id", req.user!.employee_id)
    .single();

  await supabase.from("notifications").insert({
    user_id: employee_id,
    message: `Your recruiter ${recruiter?.full_name ?? req.user!.username} tried to reach you. Please contact them if needed.`,
  });

  res.status(201).json(data);
});

/** GET /api/call-logs/today — get today's call logs */
router.get("/call-logs/today", async (req: AuthRequest, res) => {
  // Role check
  if (!req.user || (req.user.role !== "recruiter" && req.user.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const today = new Date().toISOString().split("T")[0];

  let query = supabase
    .from("call_logs")
    .select("*")
    .gte("called_at", today);

  if (req.user!.role === "recruiter") {
    query = query.eq("recruiter_id", req.user!.employee_id);
  }

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

export { router as absenceRouter };
