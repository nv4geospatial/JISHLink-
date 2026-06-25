import bcrypt from "bcryptjs";
import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, AuthRequest } from "../middlewares/auth.js";
import { validateEmployeeData } from "../lib/validation.js";
import { sendApprovalEmail, sendRejectionEmail } from "../lib/email.js";

const router = Router();
router.use(requireAuth);

/** GET /api/submissions */
router.get("/", requireRole("admin"), async (req, res) => {
  const { status } = req.query as { status?: string };
  let query = supabase.from("pending_submissions").select("*").order("submitted_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

/** POST /api/submissions/:id/approve */
router.post("/:id/approve", requireRole("admin"), async (req: AuthRequest, res) => {
  const { workplace_id, reporting_manager_id, username, password, designation } = req.body as {
    workplace_id: string; reporting_manager_id: string; username: string; password: string; designation?: string;
  };

  const { data: submission } = await supabase
    .from("pending_submissions")
    .select("*")
    .eq("id", req.params["id"])
    .single();

  if (!submission) { res.status(404).json({ error: "Submission not found" }); return; }

  if (!workplace_id || !reporting_manager_id || !username || !password) {
    res.status(400).json({ error: "Missing required fields: workplace_id, reporting_manager_id, username, password" });
    return;
  }

  const submittedData = submission.submitted_data as Record<string, unknown>;
  const password_hash = await bcrypt.hash(password, 12);

  // Check username uniqueness
  const { data: existing } = await supabase.from("employees").select("id").eq("username", username).single();
  if (existing) { res.status(400).json({ error: "Username already taken" }); return; }

  const { count } = await supabase.from("employees").select("*", { count: "exact", head: true });
  const employee_code = `EMP${String((count ?? 0) + 1).padStart(4, "0")}`;

  // Clean submittedData — only keep valid employee columns
  const allowedFields = [
    "full_name", "dob", "gender", "aadhar_number", "pan_number",
    "contact_number", "email", "address", "designation", "qualification",
    "bank_name", "account_number", "ifsc_code", "driving_license",
    "vehicle_details", "blood_group", "marital_status", "emergency_contact",
    "nominee_name", "nominee_relation", "pf_number", "esi_number", "uan_number"
  ];
  const cleanData: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (submittedData[key] !== undefined && submittedData[key] !== null && submittedData[key] !== "") {
      cleanData[key] = submittedData[key];
    }
  }

  const { data: employee, error } = await supabase
    .from("employees")
    .insert({
      ...cleanData,
      employee_code,
      designation: designation ?? cleanData["designation"] ?? submittedData["designation"],
      workplace_id,
      reporting_manager_id,
      username,
      password_hash,
      employment_status: "active",
      password_changed: false,
      created_by: req.user!.employee_id,
    })
    .select("*, workplace:workplaces(*)")
    .single();

  if (error) { res.status(400).json({ error: error.message }); return; }

  await supabase.from("pending_submissions").update({ status: "approved" }).eq("id", req.params["id"]);

  // Create notification
  await supabase.from("notifications").insert({
    user_id: employee.id,
    message: "Your application has been approved. Welcome to JISHLink!",
  });

  // Send email
  const { data: workplace } = await supabase.from("workplaces").select("name").eq("id", workplace_id).single();
  if (submittedData["email"]) {
    try {
      await sendApprovalEmail({
        to: String(submittedData["email"]),
        name: String(submittedData["full_name"] ?? ""),
        workplace: workplace?.name ?? "your workplace",
        designation: String(designation ?? submittedData["designation"] ?? ""),
        username,
        tempPassword: password,
      });
    } catch (e) {
      req.log.warn({ err: e }, "Failed to send approval email");
    }
  }

  res.json(employee);
});



export { router as submissionsRouter };
