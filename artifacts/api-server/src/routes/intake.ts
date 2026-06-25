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
    // Personal Info
    full_name: formData["Full Name"] ?? formData["full_name"],
    dob: formData["Date of Birth"] ?? formData["dob"],
    gender: formData["Gender"] ?? formData["gender"],
    blood_group: formData["Blood Group"] ?? formData["blood_group"],
    marital_status: formData["Marital Status"] ?? formData["marital_status"],
    qualification: formData["Qualification"] ?? formData["qualification"],
    
    // Contact
    contact_number: formData["Contact Number"] ?? formData["contact_number"],
    email: formData["Email ID"] ?? formData["Email"] ?? formData["email"],
    address: formData["Current Address"] ?? formData["Address"] ?? formData["address"],
    emergency_contact: formData["Emergency Contact Number"] ?? formData["emergency_contact"],
    nominee_name: formData["Nominee Name"] ?? formData["nominee_name"],
    nominee_relation: formData["Nominee Relation"] ?? formData["nominee_relation"],
    
    // Employment
    designation: formData["Designation Applied For"] ?? formData["Designation"] ?? formData["designation"],
    employment_type: formData["Employment Type"] ?? formData["employment_type"],
    date_of_joining: formData["Date of Joining"] ?? formData["date_of_joining"],
    
    // Statutory
    aadhar_number: formData["Aadhar Number"] ?? formData["aadhar_number"],
    pan_number: formData["PAN Number"] ?? formData["pan_number"],
    
    // Bank
    bank_name: formData["Bank Name"] ?? formData["bank_name"],
    bank_branch: formData["Bank Branch"] ?? formData["bank_branch"],
    account_number: formData["Account Number"] ?? formData["account_number"],
    ifsc_code: formData["IFSC Code"] ?? formData["ifsc_code"],
    
    // Transport
    driving_license_number: formData["Driving License Number"] ?? formData["driving_license_number"],
    vehicle_details: formData["Vehicle Type and Registration Number"] ?? formData["vehicle_details"],
    
    // Preferred location (will be mapped to workplace during approval)
    preferred_work_location: formData["Preferred Work Location"] ?? formData["preferred_work_location"],
    
    // Keep any other fields that might be present
    ...formData,
  };

  const validation_results = validateEmployeeData(mapped);

  // Check duplicates only against APPROVED employees (not pending submissions)
  const { data: dupAadhar } = mapped["aadhar_number"]
    ? await supabase.from("employees").select("id").eq("aadhar_number", mapped["aadhar_number"]).maybeSingle()
    : { data: null };
  const { data: dupPan } = mapped["pan_number"]
    ? await supabase.from("employees").select("id").eq("pan_number", mapped["pan_number"]).maybeSingle()
    : { data: null };

  const hasDuplicateAadhar = !!dupAadhar;
  const hasDuplicatePan = !!dupPan;

  if (hasDuplicateAadhar) validation_results.push({ field: "aadhar_number_duplicate", valid: false, message: "Aadhar already registered" });
  if (hasDuplicatePan) validation_results.push({ field: "pan_number_duplicate", valid: false, message: "PAN already registered" });

  // Check for duplicate submission in last 5 minutes (same Aadhar or Email)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  let dupQuery = supabase
    .from("pending_submissions")
    .select("id")
    .gte("submitted_at", fiveMinutesAgo);

  if (mapped["aadhar_number"]) {
    dupQuery = dupQuery.eq("submitted_data->>aadhar_number", mapped["aadhar_number"]);
  }

  const { data: recentDup } = await dupQuery.maybeSingle();

  if (recentDup) {
    res.json({ message: "Duplicate submission detected, ignored" });
    return;
  }

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
