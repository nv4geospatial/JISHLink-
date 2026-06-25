import bcrypt from "bcryptjs";
import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { signToken } from "../lib/jwt.js";
import { requireAuth, AuthRequest } from "../middlewares/auth.js";

const router = Router();

/** POST /api/auth/login — authenticate with username + password */
router.post("/login", async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  const { data: employee, error } = await supabase
    .from("employees")
    .select("*, workplace:workplaces(*)")
    .eq("username", username)
    .single();

  if (error || !employee) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, employee.password_hash ?? "");
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({
    employee_id: employee.id,
    role: employee.role ?? "employee",
    username: employee.username,
    workplace_id: employee.workplace_id,
  });

  // Sanitize sensitive fields based on role
  const safe = sanitizeEmployee(employee, employee.role ?? "employee");

  res.json({ token, employee: safe, passwordChanged: employee.password_changed ?? false });
});

/** POST /api/auth/change-password */
router.post("/change-password", requireAuth, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

  const { data: employee } = await supabase
    .from("employees")
    .select("password_hash")
    .eq("id", req.user!.employee_id)
    .single();

  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, employee.password_hash ?? "");
  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await supabase
    .from("employees")
    .update({ password_hash: hash, password_changed: true })
    .eq("id", req.user!.employee_id);

  res.json({ message: "Password changed successfully" });
});

/** GET /api/auth/me — get current user profile */
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const { data: employee } = await supabase
    .from("employees")
    .select("*, workplace:workplaces(*)")
    .eq("id", req.user!.employee_id)
    .single();

  if (!employee) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(sanitizeEmployee(employee, req.user!.role));
});

/** Strip sensitive fields for non-admin roles */
function sanitizeEmployee(emp: Record<string, unknown>, role: string) {
  if (role === "admin") return emp;
  const { aadhar_number, pan_number, account_number, ifsc_code, bank_name, bank_branch, aadhar_doc_url, pan_doc_url, bank_doc_url, password_hash, ...safe } = emp as Record<string, unknown>;
  void aadhar_number; void pan_number; void account_number; void ifsc_code;
  void bank_name; void bank_branch; void aadhar_doc_url; void pan_doc_url; void bank_doc_url;
  void password_hash;
  // Ensure reporting_manager and recruiter_name are preserved
  return safe;
}

export { router as authRouter, sanitizeEmployee };
