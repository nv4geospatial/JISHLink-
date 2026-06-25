import bcrypt from "bcryptjs";
import { Router } from "express";
import multer from "multer";
import { google } from "googleapis";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, AuthRequest } from "../middlewares/auth.js";
import { sanitizeEmployee } from "./auth.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

// OAuth 2.0 setup (since service account keys are blocked by organization policy)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/auth/google/callback";
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

// Store refresh tokens in memory (in production, use database)
const userTokens: Record<string, string> = {};

function getOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

/** GET /api/auth/google — start OAuth flow */
router.get("/auth/google", (req, res) => {
  const oauth2Client = getOAuth2Client();
  const scopes = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.readonly",
  ];
  
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent", // Force refresh token
    state: req.query.user_id as string || "default",
  });
  
  res.redirect(url);
});

/** GET /api/auth/google/callback — OAuth callback */
router.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code as string;
  const userId = req.query.state as string || "default";
  
  if (!code) {
    res.status(400).json({ error: "No code provided" });
    return;
  }
  
  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    
    if (tokens.refresh_token) {
      userTokens[userId] = tokens.refresh_token;
      // Also store in database for persistence
      await supabase.from("user_google_tokens").upsert({
        user_id: userId,
        refresh_token: tokens.refresh_token,
        updated_at: new Date().toISOString(),
      });
    }
    
    res.send("Google Drive connected successfully! You can close this window and return to the app.");
  } catch (e) {
    console.error("OAuth callback error:", e);
    res.status(500).json({ error: "Failed to authenticate with Google" });
  }
});

async function getDriveClient(userId: string) {
  const oauth2Client = getOAuth2Client();
  
  // Try to get refresh token from database
  let refreshToken = userTokens[userId];
  
  if (!refreshToken) {
    const { data } = await supabase
      .from("user_google_tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .single();
    
    if (data?.refresh_token) {
      refreshToken = data.refresh_token;
      userTokens[userId] = refreshToken;
    }
  }
  
  if (!refreshToken) {
    throw new Error("No Google refresh token found. Please connect Google Drive first.");
  }
  
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  
  // Refresh token if needed
  const { credentials } = await oauth2Client.refreshAccessToken();
  oauth2Client.setCredentials(credentials);
  
  return google.drive({ version: "v3", auth: oauth2Client });
}

async function uploadToGoogleDrive(userId: string, buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
  const drive = await getDriveClient(userId);
  
  const fileMetadata: any = {
    name: fileName,
  };
  
  if (GOOGLE_DRIVE_FOLDER_ID) {
    fileMetadata.parents = [GOOGLE_DRIVE_FOLDER_ID];
  }
  
  const media = { mimeType, body: buffer };
  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media as any,
    fields: "id, webViewLink",
  });
  
  if (response.data.id) {
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: { role: "reader", type: "anyone" },
    });
  }
  
  return response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`;
}
function generateExcelFromData(
  docType: string, 
  extractedData: Record<string, unknown>,
  employeeId?: string,
  employeeCode?: string,
  employeeName?: string
): Buffer {
  // ─── Column headers as the FIRST row (standard Excel format) ──────────────
  const headers = ["Employee ID", "Employee Code", "Employee Name", "Document Type", "Field", "Value", "Extracted At"];
  const rows: (string | number)[][] = [headers];
  const timestamp = new Date().toISOString();

  // ─── Generate rows based on document type ─────────────────────────────────
  if (docType === "aadhar") {
    const aadharFields = [
      ["Name", String(extractedData.full_name || "")],
      ["Father Name", String(extractedData.father_name || "")],
      ["Aadhar Number", String(extractedData.aadhar_number || "")],
      ["Address", String(extractedData.address || "")],
      ["Phone", String(extractedData.phone || "")],
      ["DOB", String(extractedData.dob || "")],
      ["Year of Birth", String(extractedData.year_of_birth || "")],
      ["Gender", String(extractedData.gender || "")],
    ];
    aadharFields.forEach(([field, value]) => {
      rows.push([employeeId || "", employeeCode || "", employeeName || "", "Aadhar Card", field, value, timestamp]);
    });
  } else if (docType === "pan") {
    const panFields = [
      ["Name", String(extractedData.full_name || "")],
      ["Father Name", String(extractedData.father_name || "")],
      ["PAN Number", String(extractedData.pan_number || "")],
      ["DOB", String(extractedData.dob || "")],
    ];
    panFields.forEach(([field, value]) => {
      rows.push([employeeId || "", employeeCode || "", employeeName || "", "PAN Card", field, value, timestamp]);
    });
  } else if (docType === "bank") {
    const bankFields = [
      ["Account Number", String(extractedData.account_number || "")],
      ["IFSC Code", String(extractedData.ifsc_code || "")],
      ["Bank Name", String(extractedData.bank_name || "")],
      ["Bank Branch", String(extractedData.bank_branch || "")],
      ["MICR", String(extractedData.micr || "")],
    ];
    bankFields.forEach(([field, value]) => {
      rows.push([employeeId || "", employeeCode || "", employeeName || "", "Bank Document", field, value, timestamp]);
    });
  } else if (docType === "photo") {
    rows.push([
      employeeId || "", 
      employeeCode || "", 
      employeeName || "", 
      "Passport Photo", 
      "Photo", 
      "Passport Size Photo Uploaded", 
      timestamp
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  
  // ─── Formatting: set column widths ───────────────────────────────────────
  const wscols = [
    { wch: 20 }, // Employee ID
    { wch: 15 }, // Employee Code
    { wch: 25 }, // Employee Name
    { wch: 18 }, // Document Type
    { wch: 20 }, // Field
    { wch: 60 }, // Value
    { wch: 25 }, // Extracted At
  ];
  ws["!cols"] = wscols;

  // Style header row (bold)
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!ws[cellRef]) continue;
    ws[cellRef].s = { font: { bold: true }, fill: { fgColor: { rgb: "E0E0E0" } } };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Document Data");
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
}

router.use(requireAuth);

/** GET /api/employees — list employees */
router.get("/", async (req: AuthRequest, res) => {
  let query = supabase
    .from("employees")
    .select("*, workplace:workplaces(id, name, client_name, address), reporting_manager:employees!reporting_manager_id(id, full_name)")
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

  // Admin: filter by reporting_manager_id
  const { reporting_manager_id } = req.query as Record<string, string>;
  if (reporting_manager_id && req.user!.role === "admin") {
    query = query.eq("reporting_manager_id", reporting_manager_id);
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

/** POST /api/employees — create employee (admin or recruiter) */
router.post("/", requireRole("admin", "recruiter"), async (req: AuthRequest, res) => {
  const body = req.body as Record<string, unknown>;
  let password_hash: string | undefined;

  // Recruiter can only create employees with role=employee
  if (req.user!.role === "recruiter" && body.role && body.role !== "employee") {
    res.status(403).json({ error: "Recruiter can only create employees with role=employee" });
    return;
  }

  // Force role to employee for recruiter-created accounts
  if (req.user!.role === "recruiter") {
    body.role = "employee";
    body.reporting_manager_id = req.user!.employee_id;
    body.workplace_id = req.user!.workplace_id ?? body.workplace_id;
    if (!body.recruiter_name) {
      const { data: recruiter } = await supabase.from("employees").select("full_name").eq("id", req.user!.employee_id).single();
      body.recruiter_name = recruiter?.full_name;
    }
  }

  if (body.password) {
    password_hash = await bcrypt.hash(String(body.password), 12);
  }

  // Generate employee code if not provided
  if (!body.employee_code) {
    const { count } = await supabase.from("employees").select("*", { count: "exact", head: true });
    body.employee_code = `EMP${String((count ?? 0) + 1).padStart(4, "0")}`;
  }

  // Validate custom_id uniqueness
  if (body.custom_id) {
    const { data: existing } = await supabase.from("employees").select("id").eq("custom_id", body.custom_id).single();
    if (existing) {
      res.status(400).json({ error: `Custom ID ${body.custom_id} already exists` });
      return;
    }
  }

  const insertData: Record<string, unknown> = {
    ...body,
    password_hash,
    password: undefined,
    employment_status: "active",
    created_by: req.user!.employee_id,
    password_changed: false,
  };

  // Remove shift fields if they're empty
  if (!insertData.shift_start_time) delete insertData.shift_start_time;
  if (!insertData.shift_end_time) delete insertData.shift_end_time;
  if (!insertData.shift_days) delete insertData.shift_days;

  const { data, error } = await supabase
    .from("employees")
    .insert(insertData)
    .select("*, workplace:workplaces(*)")
    .single();

  if (error) {
    console.error("CREATE EMPLOYEE ERROR:", error);
    res.status(400).json({ error: error.message, details: error.details, hint: error.hint });
    return;
  }

  await logAudit(req.user!.employee_id, "create_employee", "employees", data.id, null, data);

  // Notify admin if recruiter created employee
  if (req.user!.role === "recruiter") {
    const { data: admins } = await supabase
      .from("employees")
      .select("id")
      .eq("role", "admin");
    
    for (const admin of admins ?? []) {
      await supabase.from("notifications").insert({
        user_id: admin.id,
        message: `Recruiter ${req.user!.username} added new employee: ${data.full_name} (${data.employee_code})`,
      });
    }
  }

  // Notify recruiter if admin created and assigned to recruiter
  if (req.user!.role === "admin" && data.reporting_manager_id) {
    await supabase.from("notifications").insert({
      user_id: data.reporting_manager_id,
      message: `Admin assigned new employee to you: ${data.full_name} (${data.employee_code})`,
    });
  }

  res.status(201).json(sanitizeEmployee(data, req.user!.role));
});

/** GET /api/employees/:id */
router.get("/:id", async (req: AuthRequest, res) => {
  const employeeId = String(req.params["id"]);
  const { data, error } = await supabase
    .from("employees")
    .select("*, workplace:workplaces(*)")
    .eq("id", employeeId)
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

  // Recruiter can only view their own employees
  if (req.user!.role === "recruiter" && data.reporting_manager_id !== req.user!.employee_id) {
    res.status(403).json({ error: "You can only view employees assigned to you" });
    return;
  }

  res.json(sanitizeEmployee(data, req.user!.role));
});

/** PUT /api/employees/:id — admin, recruiter, or self (employee) */
router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
  const employeeId = String(req.params["id"]);
  const { data: existing } = await supabase.from("employees").select("*").eq("id", employeeId).single();
  
  if (!existing) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  const body = req.body as Record<string, unknown>;

  // Employee can only update their own profile
  if (req.user!.role === "employee") {
    if (existing.id !== req.user!.employee_id) {
      res.status(403).json({ error: "You can only update your own profile" });
      return;
    }
    // Employee cannot change role, reporting_manager, workplace, or employment_status
    delete body.role;
    delete body.reporting_manager_id;
    delete body.workplace_id;
    delete body.employment_status;
  }

  // Recruiter can only update their own employees
  if (req.user!.role === "recruiter") {
    if (existing.reporting_manager_id !== req.user!.employee_id) {
      res.status(403).json({ error: "You can only update employees assigned to you" });
      return;
    }
    // Recruiter cannot change role, reporting_manager, or workplace
    delete body.role;
    delete body.reporting_manager_id;
    delete body.workplace_id;
  }

  const { data: old } = await supabase.from("employees").select("*").eq("id", employeeId).single();

  const { data, error } = await supabase
    .from("employees")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", employeeId)
    .select("*, workplace:workplaces(*)")
    .single();

  if (error) {
    console.error("UPDATE EMPLOYEE ERROR:", error);
    res.status(400).json({ error: error.message, details: error.details, hint: error.hint });
    return;
  }

  await logAudit(req.user!.employee_id, "update_employee", "employees", employeeId, old, data);
  res.json(sanitizeEmployee(data, req.user!.role));
});

/** POST /api/employees/import — bulk import employees (admin only) */
router.post("/import", requireRole("admin"), async (req: AuthRequest, res) => {
  const { rows } = req.body as { rows: Record<string, unknown>[] };
  let success_count = 0;
  const errors: { row: number; error: string; details?: string }[] = [];

  // Pre-fetch total count once
  const { count: totalCount } = await supabase.from("employees").select("*", { count: "exact", head: true });
  let currentCount = totalCount ?? 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    try {
      if (!row["full_name"]) {
        errors.push({ row: i + 1, error: "Full name is required" });
        continue;
      }

      currentCount++;
      const employee_code = row["employee_code"] ?? `EMP${String(currentCount).padStart(4, "0")}`;
      
      const password = row["password"] ?? `Welcome@${Math.floor(Math.random() * 10000)}`;
      const password_hash = await bcrypt.hash(String(password), 12);

      // Find recruiter by name if provided
      let reporting_manager_id = row["reporting_manager_id"];
      const recruiter_name = row["recruiter_name"] ?? row["reporting_manager_name"];
      
      console.log(`[IMPORT] Row ${i + 1}: full_name=${row["full_name"]}, recruiter_name=${recruiter_name}, reporting_manager_id=${reporting_manager_id}`);
      
      if (!reporting_manager_id && recruiter_name) {
        const cleanName = String(recruiter_name).trim();
        console.log(`[IMPORT] Looking for recruiter: "${cleanName}"`);
        
        // Get all recruiters for fuzzy matching
        const { data: allRecruiters } = await supabase
          .from("employees")
          .select("id, full_name")
          .eq("role", "recruiter");
        
        console.log(`[IMPORT] Available recruiters:`, allRecruiters?.map(r => r.full_name));
        
        // Try exact match first
        let recruiter = allRecruiters?.find(r => r.full_name === cleanName);
        
        if (!recruiter) {
          // Try case-insensitive match
          recruiter = allRecruiters?.find(r => r.full_name.toLowerCase() === cleanName.toLowerCase());
        }
        
        if (!recruiter) {
          // Try partial match (contains)
          recruiter = allRecruiters?.find(r => 
            r.full_name.toLowerCase().includes(cleanName.toLowerCase()) ||
            cleanName.toLowerCase().includes(r.full_name.toLowerCase())
          );
        }
        
        if (recruiter) {
          reporting_manager_id = recruiter.id;
          console.log(`[IMPORT] ✓ Matched employee to recruiter: "${cleanName}" -> "${recruiter.full_name}" (${recruiter.id})`);
        } else {
          console.warn(`[IMPORT] ✗ Could not find recruiter: "${cleanName}"`);
        }
      }

      // Find workplace by name if provided, auto-create if not found
      let workplace_id = row["workplace_id"];
      const workplace_name = row["workplace"];
      
      if (!workplace_id && workplace_name) {
        const cleanWpName = String(workplace_name).trim();
        console.log(`[IMPORT] Looking for workplace: "${cleanWpName}"`);
        
        const { data: existingWp } = await supabase
          .from("workplaces")
          .select("id, name")
          .ilike("name", cleanWpName)
          .maybeSingle();
        
        if (existingWp) {
          workplace_id = existingWp.id;
          console.log(`[IMPORT] ✓ Matched workplace: ${cleanWpName} -> ${existingWp.name} (${existingWp.id})`);
        } else {
          // Auto-create workplace if not found
          const { data: newWp, error: wpError } = await supabase
            .from("workplaces")
            .insert({ name: cleanWpName, client_name: cleanWpName, address: cleanWpName })
            .select("id")
            .single();
          
          if (wpError) {
            console.error(`[IMPORT] Failed to create workplace: ${cleanWpName}`, wpError);
          } else if (newWp) {
            workplace_id = newWp.id;
            console.log(`[IMPORT] ✓ Auto-created workplace: ${cleanWpName} (${newWp.id})`);
          }
        }
      }

      const insertData: Record<string, unknown> = {
        role: "employee",
        employee_code,
        password_hash,
        password: undefined,
        employment_status: "active",
        created_by: req.user!.employee_id,
        password_changed: false,
      };

      // Copy only valid fields from row (workplace is NOT included - it's used for lookup only)
      const validFields = [
        "full_name", "dob", "gender", "blood_group", "marital_status", "qualification",
        "contact_number", "email", "address", "emergency_contact", "nominee_name", "nominee_relation",
        "designation", "employment_type", "date_of_joining", "aadhar_number", "pan_number",
        "pf_number", "esi_number", "uan_number", "bank_name", "bank_branch", "account_number",
        "ifsc_code", "driving_license_number", "vehicle_details", "username", "recruiter_name"
      ];
      
      validFields.forEach((field) => {
        if (row[field] !== undefined && row[field] !== "") {
          insertData[field] = row[field];
        }
      });

      if (reporting_manager_id) {
        insertData.reporting_manager_id = reporting_manager_id;
      }

      if (workplace_id) {
        insertData.workplace_id = workplace_id;
      }

      // Map employee_id from Excel to custom_id
      if (row["employee_id"]) {
        insertData.custom_id = row["employee_id"];
      }

      // Remove empty optional fields
      Object.keys(insertData).forEach((key) => {
        if (insertData[key] === "" || insertData[key] === null || insertData[key] === undefined) {
          delete insertData[key];
        }
      });

      const { error } = await supabase.from("employees").insert(insertData);

      if (error) {
        console.error(`[IMPORT-EMPLOYEES] Row ${i + 1} error:`, error);
        errors.push({ row: i + 1, error: error.message, details: error.details });
      } else {
        success_count++;
      }
    } catch (e) {
      console.error(`[IMPORT-EMPLOYEES] Row ${i + 1} exception:`, e);
      errors.push({ row: i + 1, error: String(e) });
    }
  }

  console.log(`[IMPORT-EMPLOYEES] Completed: ${success_count} success, ${errors.length} errors`);
  res.json({ success_count, error_count: errors.length, errors });
});

/** DELETE /api/employees/:id — soft delete */
router.delete("/:id", requireRole("admin", "recruiter"), async (req: AuthRequest, res) => {
  const employeeId = String(req.params["id"]);
  const { data: existing } = await supabase.from("employees").select("*").eq("id", employeeId).single();
  
  if (!existing) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  if (req.user!.role === "recruiter" && existing.reporting_manager_id !== req.user!.employee_id) {
    res.status(403).json({ error: "You can only delete employees assigned to you" });
    return;
  }

  const { data, error } = await supabase
    .from("employees")
    .update({ employment_status: "inactive", updated_at: new Date().toISOString() })
    .eq("id", employeeId)
    .select("*, workplace:workplaces(*)")
    .single();

  if (error) {
    res.status(400).json({ error: error.message, details: error.details, hint: error.hint });
    return;
  }

  await logAudit(req.user!.employee_id, "delete_employee", "employees", employeeId, existing, data);

  // Notify employee that they are deactivated
  await supabase.from("notifications").insert({
    user_id: employeeId,
    message: "Your account has been deactivated. Contact your recruiter or admin for more information.",
  });

  // Notify admin about deactivation
  const { data: admins } = await supabase.from("employees").select("id").eq("role", "admin");
  for (const admin of admins ?? []) {
    await supabase.from("notifications").insert({
      user_id: admin.id,
      message: `Employee ${data.full_name} (${data.employee_code}) has been deactivated by ${req.user!.username}`,
    });
  }

  // Notify recruiter if admin deactivated their employee
  if (req.user!.role === "admin" && data.reporting_manager_id && data.reporting_manager_id !== req.user!.employee_id) {
    await supabase.from("notifications").insert({
      user_id: data.reporting_manager_id,
      message: `Your employee ${data.full_name} (${data.employee_code}) has been deactivated by admin ${req.user!.username}`,
    });
  }

  res.json({ message: "Employee deactivated", employee: sanitizeEmployee(data, req.user!.role) });
});

/** POST /api/employees/:id/activate */
router.post("/:id/activate", requireRole("admin"), async (req: AuthRequest, res) => {
  const employeeId = String(req.params["id"]);
  const { data: existing } = await supabase.from("employees").select("*").eq("id", employeeId).single();
  
  if (!existing) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  const { data, error } = await supabase
    .from("employees")
    .update({ employment_status: "active", updated_at: new Date().toISOString() })
    .eq("id", employeeId)
    .select("*, workplace:workplaces(*)")
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  await logAudit(req.user!.employee_id, "activate_employee", "employees", employeeId, { employment_status: "inactive" }, { employment_status: "active" });

  // Notify employee that they are activated
  await supabase.from("notifications").insert({
    user_id: employeeId,
    message: "Your account has been activated. You can now log in and mark attendance.",
  });

  // Notify admin about activation
  const { data: admins } = await supabase.from("employees").select("id").eq("role", "admin");
  for (const admin of admins ?? []) {
    await supabase.from("notifications").insert({
      user_id: admin.id,
      message: `Employee ${data.full_name} (${data.employee_code}) has been activated by ${req.user!.username}`,
    });
  }

  res.json(sanitizeEmployee(data, req.user!.role));
});

/** POST /api/employees/:id/reassign */
router.post("/:id/reassign", requireRole("recruiter", "admin"), async (req: AuthRequest, res) => {
  const employeeId = String(req.params["id"]);
  const { workplace_id } = req.body as { workplace_id: string };
  const { data: old } = await supabase.from("employees").select("workplace_id").eq("id", employeeId).single();

  const { data, error } = await supabase
    .from("employees")
    .update({ workplace_id, updated_at: new Date().toISOString() })
    .eq("id", employeeId)
    .select("*, workplace:workplaces(*)")
    .single();

  if (error) {
    res.status(400).json({ error: error.message, details: error.details, hint: error.hint });
    return;
  }

  await logAudit(req.user!.employee_id, "reassign_employee", "employees", employeeId,
    { workplace_id: old?.workplace_id }, { workplace_id });

  await supabase.from("notifications").insert([
    { user_id: employeeId, message: `You have been reassigned to a new workplace.` },
  ]);

  res.json(sanitizeEmployee(data, req.user!.role));
});

/** DELETE /api/employees/clear-all — clear all non-admin employees (for testing) */
router.delete("/clear-all", requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const { error } = await supabase
      .from("employees")
      .delete()
      .neq("role", "admin");
    
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    
    res.json({ message: "All non-admin employees cleared successfully" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
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

/** POST /api/employees/:id/documents — upload document image + save to Google Drive with employee-named Excel */
router.post("/:id/documents", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
  const employeeId = String(req.params["id"]);
  
  // Only admin, recruiter, or the employee themselves can upload
  if (req.user!.role === "employee" && req.user!.employee_id !== employeeId) {
    res.status(403).json({ error: "You can only upload your own documents" });
    return;
  }
  if (req.user!.role === "recruiter") {
    const { data: emp } = await supabase.from("employees").select("reporting_manager_id").eq("id", employeeId).single();
    if (emp?.reporting_manager_id !== req.user!.employee_id) {
      res.status(403).json({ error: "You can only upload documents for your assigned employees" });
      return;
    }
  }

  const { doc_type, extracted_data, image_base64, is_color_original } = req.body as {
    doc_type: string;
    extracted_data: string;
    image_base64?: string;
    is_color_original?: string;
  };

  // ─── VALIDATION: Aadhar must be color original, not B&W xerox ─────────────
  if (doc_type === "aadhar" && is_color_original !== "true") {
    res.status(400).json({ 
      error: "Color original Aadhar card required", 
      message: "Please upload a color printed or original Aadhar card. Black & white xerox copies are not accepted (* mandatory requirement)." 
    });
    return;
  }

  let parsedData: Record<string, unknown> = {};
  try {
    parsedData = JSON.parse(extracted_data);
  } catch {
    parsedData = {};
  }

  // Fetch employee details for naming
  const { data: employee } = await supabase
    .from("employees")
    .select("full_name, employee_code")
    .eq("id", employeeId)
    .single();

  const employeeName = employee?.full_name || employeeId;
  const empCode = employee?.employee_code || "";

  let googleDriveUrl = null;
  let imageDriveUrl = null;

  // ─── Upload document image to Google Drive (named with employee name) ──────
  if (image_base64) {
    try {
      const imageBuffer = Buffer.from(image_base64.replace(/^data:image\/\w+;base64,/, ""), "base64");
      const imageFileName = `${employeeName}_${doc_type}_${Date.now()}.jpg`;
      imageDriveUrl = await uploadToGoogleDrive(
        req.user!.employee_id,
        imageBuffer,
        imageFileName,
        "image/jpeg"
      );
    } catch (e) {
      console.error("Image upload to Google Drive error:", e);
    }
  }

  // ─── Generate formatted Excel and upload to Google Drive ───────────────────
  try {
    const excelBuffer = generateExcelFromData(doc_type, parsedData, employeeId, empCode, employeeName);
    const excelFileName = `${employeeName}_${doc_type}_${Date.now()}.xlsx`;
    googleDriveUrl = await uploadToGoogleDrive(
      req.user!.employee_id,
      excelBuffer,
      excelFileName,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  } catch (e) {
    console.error("Excel upload to Google Drive error:", e);
  }

  // Save document metadata in Supabase
  const { data, error } = await supabase
    .from("employee_documents")
    .insert({
      employee_id: employeeId,
      doc_type,
      extracted_data: parsedData,
      google_drive_url: googleDriveUrl,
      image_drive_url: imageDriveUrl,
      is_color_original: doc_type === "aadhar" ? true : null,
      uploaded_by: req.user!.employee_id,
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ 
    message: "Document saved", 
    document: data, 
    google_drive_url: googleDriveUrl,
    image_drive_url: imageDriveUrl 
  });
});

/** GET /api/employees/:id/documents — list employee documents */
router.get("/:id/documents", requireAuth, async (req: AuthRequest, res) => {
  const employeeId = String(req.params["id"]);

  // Authorization check
  if (req.user!.role === "employee" && req.user!.employee_id !== employeeId) {
    res.status(403).json({ error: "You can only view your own documents" });
    return;
  }
  if (req.user!.role === "recruiter") {
    const { data: emp } = await supabase.from("employees").select("reporting_manager_id").eq("id", employeeId).single();
    if (emp?.reporting_manager_id !== req.user!.employee_id) {
      res.status(403).json({ error: "You can only view documents for your assigned employees" });
      return;
    }
  }

  const { data, error } = await supabase
    .from("employee_documents")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json(data ?? []);
});

export { router as employeesRouter };