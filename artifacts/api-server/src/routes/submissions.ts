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

  const submittedData = submission.submitted_data as Record<string, unknown>;
  const password_hash = await bcrypt.hash(password, 12);

  // Check username uniqueness
  const { data: existing } = await supabase.from("employees").select("id").eq("username", username).single();
  if (existing) { res.status(400).json({ error: "Username already taken" }); return; }

  const { count } = await supabase.from("employees").select("*", { count: "exact", head: true });
  const employee_code = `EMP${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { data: employee, error } = await supabase
    .from("employees")
    .insert({
      ...submittedData,
      employee_code,
      designation: designation ?? submittedData["designation"],
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

/** POST /api/submissions/:id/reject */
router.post("/:id/reject", requireRole("admin"), async (req: AuthRequest, res) => {
  const { remarks } = req.body as { remarks: string };

  const { data: submission } = await supabase
    .from("pending_submissions")
    .select("*")
    .eq("id", req.params["id"])
    .single();

  if (!submission) { res.status(404).json({ error: "Not found" }); return; }

  await supabase
    .from("pending_submissions")
    .update({ status: "rejected", admin_remarks: remarks })
    .eq("id", req.params["id"]);

  const submittedData = submission.submitted_data as Record<string, unknown>;
  if (submittedData["email"]) {
    try {
      await sendRejectionEmail({
        to: String(submittedData["email"]),
        name: String(submittedData["full_name"] ?? "Applicant"),
        remarks,
      });
    } catch (e) {
      req.log.warn({ err: e }, "Failed to send rejection email");
    }
  }

  res.json({ message: "Submission rejected" });
});

/** POST /api/intake — Google Form webhook */
router.post("/intake-public", async (req, res) => {
  const { source, submittedAt, data: formData } = req.body as {
    source: string; submittedAt?: string; data: Record<string, unknown>;
  };

  // Map Google Form field titles to schema fields
  const mapped: Record<string, unknown> = {
    full_name: formData["Full Name"] ?? formData["full_name"],
    dob: formData["Date of Birth"] ?? formData["dob"],
    gender: formData["Gender"] ?? formData["gender"],
    aadhar_number: formData["Aadhar Number"] ?? formData["aadhar_number"],
    pan_number: formData["PAN Number"] ?? formData["pan_number"],
    contact_number: formData["Contact Number"] ?? formData["contact_number"],
    email: formData["Email"] ?? formData["email"],
    address: formData["Address"] ?? formData["address"],
    designation: formData["Designation"] ?? formData["designation"],
    qualification: formData["Qualification"] ?? formData["qualification"],
    bank_name: formData["Bank Name"] ?? formData["bank_name"],
    account_number: formData["Account Number"] ?? formData["account_number"],
    ifsc_code: formData["IFSC Code"] ?? formData["ifsc_code"],
    ...formData,
  };

  const validation_results = validateEmployeeData(mapped);

  // Duplicate check
  const hasDuplicateAadhar = mapped["aadhar_number"]
    ? (await supabase.from("employees").select("id").eq("aadhar_number", mapped["aadhar_number"]).single()).data
    : null;
  const hasDuplicatePan = mapped["pan_number"]
    ? (await supabase.from("employees").select("id").eq("pan_number", mapped["pan_number"]).single()).data
    : null;

  if (hasDuplicateAadhar) validation_results.push({ field: "aadhar_number_duplicate", valid: false, message: "Aadhar already registered" });
  if (hasDuplicatePan) validation_results.push({ field: "pan_number_duplicate", valid: false, message: "PAN already registered" });

  await supabase.from("pending_submissions").insert({
    source: source ?? "google_form",
    submitted_data: mapped,
    validation_results,
    status: "submitted",
    submitted_at: submittedAt ?? new Date().toISOString(),
  });

  res.json({ message: "Received" });
});

export { router as submissionsRouter };
