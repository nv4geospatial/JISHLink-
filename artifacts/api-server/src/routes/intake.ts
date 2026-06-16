import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { validateEmployeeData } from "../lib/validation.js";

const router = Router();

/** POST /api/intake — Google Form webhook (no auth required) */
router.post("/", async (req, res) => {
  const { source, submittedAt, data: formData } = req.body as {
    source: string; submittedAt?: string; data: Record<string, unknown>;
  };

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

  // Always return 200 — Google Apps Script doesn't retry on error
  res.json({ message: "Received" });
});

export { router as intakeRouter };
