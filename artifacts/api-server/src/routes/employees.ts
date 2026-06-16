import bcrypt from "bcryptjs";
import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, AuthRequest } from "../middlewares/auth.js";
import { sanitizeEmployee } from "./auth.js";

const router = Router();

router.use(requireAuth);

/** GET /api/employees — list employees */
router.get("/", async (req: AuthRequest, res) => {
  let query = supabase
    .from("employees")
    .select("*, workplace:workplaces(id, name, client_name, address)")
    .order("full_name");

  const { search, status, workplace_id } = req.query as Record<string, string>;

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,designation.ilike.%${search}%,employee_code.ilike.%${search}%`);
  }
  if (status) {
    query = query.eq("employment_status", status);
  }
  if (workplace_id) {
    query = query.eq("workplace_id", workplace_id);
  }

  // Recruiter: only their assigned employees
  if (req.user!.role === "recruiter") {
    query = query.eq("reporting_manager_id", req.user!.employee_id);
  }

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const role = req.user!.role;
  res.json((data ?? []).map((e) => sanitizeEmployee(e, role)));
});

/** POST /api/employees — create employee (admin only) */
router.post("/", requireRole("admin"), async (req: AuthRequest, res) => {
  const body = req.body as Record<string, unknown>;
  let password_hash: string | undefined;

  if (body.password) {
    password_hash = await bcrypt.hash(String(body.password), 12);
  }

  // Generate employee code if not provided
  if (!body.employee_code) {
    const { count } = await supabase.from("employees").select("*", { count: "exact", head: true });
    body.employee_code = `EMP${String((count ?? 0) + 1).padStart(4, "0")}`;
  }

  const { data, error } = await supabase
    .from("employees")
    .insert({
      ...body,
      password_hash,
      password: undefined,
      employment_status: "active",
      created_by: req.user!.employee_id,
      password_changed: false,
    })
    .select("*, workplace:workplaces(*)")
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  await logAudit(req.user!.employee_id, "create_employee", "employees", data.id, null, data);
  res.status(201).json(sanitizeEmployee(data, "admin"));
});

/** GET /api/employees/:id */
router.get("/:id", async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("employees")
    .select("*, workplace:workplaces(*)")
    .eq("id", req.params["id"])
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Employees can only view their own profile
  if (req.user!.role === "employee" && data.id !== req.user!.employee_id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(sanitizeEmployee(data, req.user!.role));
});

/** PUT /api/employees/:id */
router.put("/:id", requireRole("admin"), async (req: AuthRequest, res) => {
  const { data: old } = await supabase.from("employees").select("*").eq("id", req.params["id"]).single();
  const body = req.body as Record<string, unknown>;

  const { data, error } = await supabase
    .from("employees")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", req.params["id"])
    .select("*, workplace:workplaces(*)")
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  await logAudit(req.user!.employee_id, "update_employee", "employees", req.params["id"]!, old, data);
  res.json(sanitizeEmployee(data, "admin"));
});

/** POST /api/employees/import — bulk import */
router.post("/import", requireRole("admin"), async (req: AuthRequest, res) => {
  const { rows } = req.body as { rows: Record<string, unknown>[] };
  let success_count = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    try {
      const { count } = await supabase.from("employees").select("*", { count: "exact", head: true });
      const employee_code = row["employee_code"] ?? `EMP${String((count ?? 0) + success_count + 1).padStart(4, "0")}`;
      let password_hash: string | undefined;
      if (row["password"]) {
        password_hash = await bcrypt.hash(String(row["password"]), 12);
      }

      const { error } = await supabase.from("employees").insert({
        ...row,
        employee_code,
        password_hash,
        password: undefined,
        employment_status: "active",
        created_by: req.user!.employee_id,
        password_changed: false,
      });

      if (error) {
        errors.push({ row: i + 1, error: error.message });
      } else {
        success_count++;
      }
    } catch (e) {
      errors.push({ row: i + 1, error: String(e) });
    }
  }

  res.json({ success_count, error_count: errors.length, errors });
});

/** POST /api/employees/:id/reassign */
router.post("/:id/reassign", requireRole("recruiter", "admin"), async (req: AuthRequest, res) => {
  const { workplace_id } = req.body as { workplace_id: string };
  const { data: old } = await supabase.from("employees").select("workplace_id").eq("id", req.params["id"]).single();

  const { data, error } = await supabase
    .from("employees")
    .update({ workplace_id, updated_at: new Date().toISOString() })
    .eq("id", req.params["id"])
    .select("*, workplace:workplaces(*)")
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  await logAudit(req.user!.employee_id, "reassign_employee", "employees", req.params["id"]!,
    { workplace_id: old?.workplace_id }, { workplace_id });

  // Create notification for employee and admin
  await supabase.from("notifications").insert([
    { user_id: req.params["id"], message: `You have been reassigned to a new workplace.` },
  ]);

  res.json(sanitizeEmployee(data, req.user!.role));
});

async function logAudit(
  actorId: string,
  action: string,
  targetTable: string,
  targetId: string,
  oldValue: unknown,
  newValue: unknown,
) {
  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action,
    target_table: targetTable,
    target_id: targetId,
    old_value: oldValue,
    new_value: newValue,
  });
}

export { router as employeesRouter };
