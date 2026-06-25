import bcrypt from "bcryptjs";
import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, AuthRequest } from "../middlewares/auth.js";
import { sanitizeEmployee } from "./auth.js";

const router = Router();
router.use(requireAuth);

/** GET /api/recruiters — list all recruiters */
router.get("/", requireRole("admin"), async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("employees")
    .select("*, workplace:workplaces(id, name, client_name, address)")
    .eq("role", "recruiter")
    .order("full_name");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json((data ?? []).map((e) => sanitizeEmployee(e, req.user!.role)));
});

/** GET /api/recruiters/:id — single recruiter details */
router.get("/:id", requireRole("admin", "recruiter"), async (req: AuthRequest, res) => {
  const recruiterId = String(req.params["id"]);
  
  const { data, error } = await supabase
    .from("employees")
    .select("*, workplace:workplaces(*)")
    .eq("id", recruiterId)
    .eq("role", "recruiter")
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Recruiter not found" });
    return;
  }

  // Recruiter can only view their own profile
  if (req.user!.role === "recruiter" && data.id !== req.user!.employee_id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(sanitizeEmployee(data, req.user!.role));
});

/** POST /api/recruiters — create recruiter (admin only) */
router.post("/", requireRole("admin"), async (req: AuthRequest, res) => {
  const body = req.body as Record<string, unknown>;
  
  if (body.password) {
    body.password_hash = await bcrypt.hash(String(body.password), 12);
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
    role: "recruiter",
    password: undefined,
    employment_status: "active",
    created_by: req.user!.employee_id,
    password_changed: false,
  };

  // Remove empty optional fields
  Object.keys(insertData).forEach((key) => {
    if (insertData[key] === "" || insertData[key] === null || insertData[key] === undefined) {
      delete insertData[key];
    }
  });

  const { data, error } = await supabase
    .from("employees")
    .insert(insertData)
    .select("*, workplace:workplaces(*)")
    .single();

  if (error) {
    console.error("CREATE RECRUITER ERROR:", error);
    res.status(400).json({ error: error.message, details: error.details, hint: error.hint });
    return;
  }

  // Notify all admins about new recruiter
  const { data: admins } = await supabase.from("employees").select("id").eq("role", "admin");
  for (const admin of admins ?? []) {
    await supabase.from("notifications").insert({
      user_id: admin.id,
      message: `New recruiter added: ${data.full_name} (${data.employee_code}) by ${req.user!.username}`,
    });
  }

  res.status(201).json(sanitizeEmployee(data, req.user!.role));
});

/** PUT /api/recruiters/:id — update recruiter */
router.put("/:id", requireRole("admin"), async (req: AuthRequest, res) => {
  const recruiterId = String(req.params["id"]);
  const body = req.body as Record<string, unknown>;

  const { data: old } = await supabase.from("employees").select("*").eq("id", recruiterId).single();

  const { data, error } = await supabase
    .from("employees")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", recruiterId)
    .eq("role", "recruiter")
    .select("*, workplace:workplaces(*)")
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json(sanitizeEmployee(data, req.user!.role));
});

/** DELETE /api/recruiters/:id — soft delete recruiter */
router.delete("/:id", requireRole("admin"), async (req: AuthRequest, res) => {
  const recruiterId = String(req.params["id"]);
  
  const { data, error } = await supabase
    .from("employees")
    .update({ employment_status: "inactive", updated_at: new Date().toISOString() })
    .eq("id", recruiterId)
    .eq("role", "recruiter")
    .select("*, workplace:workplaces(*)")
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ message: "Recruiter deactivated", recruiter: sanitizeEmployee(data, req.user!.role) });
});

/** POST /api/recruiters/import — bulk import recruiters (admin only) */
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

      // Find workplace by name if provided, auto-create if not found
      let workplace_id = row["workplace_id"];
      const workplace_name = row["workplace"];
      
      if (!workplace_id && workplace_name) {
        const cleanWpName = String(workplace_name).trim();
        const { data: existingWp } = await supabase
          .from("workplaces")
          .select("id, name")
          .ilike("name", cleanWpName)
          .maybeSingle();
        
        if (existingWp) {
          workplace_id = existingWp.id;
        } else {
          // Auto-create workplace if not found
          const { data: newWp, error: wpError } = await supabase
            .from("workplaces")
            .insert({ name: cleanWpName, client_name: cleanWpName, address: cleanWpName })
            .select("id")
            .single();
          
          if (wpError) {
            console.error(`[IMPORT-RECRUITERS] Failed to create workplace: ${cleanWpName}`, wpError);
          } else if (newWp) {
            workplace_id = newWp.id;
            console.log(`[IMPORT-RECRUITERS] Auto-created workplace: ${cleanWpName} (${newWp.id})`);
          }
        }
      }

      const insertData: Record<string, unknown> = {
        role: "recruiter",
        employee_code,
        password_hash,
        password: undefined,
        employment_status: "active",
        created_by: req.user!.employee_id,
        password_changed: false,
      };

      if (workplace_id) {
        insertData.workplace_id = workplace_id;
      }

      // Copy only valid fields from row (workplace is NOT included - it's used for lookup only)
      const validFields = [
        "full_name", "dob", "gender", "blood_group", "marital_status", "qualification",
        "contact_number", "email", "address", "emergency_contact", "nominee_name", "nominee_relation",
        "designation", "employment_type", "date_of_joining", "aadhar_number", "pan_number",
        "pf_number", "esi_number", "uan_number", "bank_name", "bank_branch", "account_number",
        "ifsc_code", "driving_license_number", "vehicle_details", "username"
      ];
      
      validFields.forEach((field) => {
        if (row[field] !== undefined && row[field] !== "") {
          insertData[field] = row[field];
        }
      });

      // Map recruiter_id from Excel to custom_id
      if (row["recruiter_id"]) {
        insertData.custom_id = row["recruiter_id"];
      }

      // Remove empty optional fields
      Object.keys(insertData).forEach((key) => {
        if (insertData[key] === "" || insertData[key] === null || insertData[key] === undefined) {
          delete insertData[key];
        }
      });

      const { error } = await supabase.from("employees").insert(insertData);

      if (error) {
        console.error(`[IMPORT-RECRUITERS] Row ${i + 1} error:`, error);
        errors.push({ row: i + 1, error: error.message, details: error.details });
      } else {
        success_count++;
        // Notify admin about new recruiter
        const { data: admins } = await supabase.from("employees").select("id").eq("role", "admin");
        for (const admin of admins ?? []) {
          await supabase.from("notifications").insert({
            user_id: admin.id,
            message: `New recruiter added: ${row["full_name"]} (${insertData.employee_code}) by ${req.user!.username}`,
          });
        }
      }
    } catch (e) {
      console.error(`[IMPORT-RECRUITERS] Row ${i + 1} exception:`, e);
      errors.push({ row: i + 1, error: String(e) });
    }
  }

  res.json({ success_count, error_count: errors.length, errors });
});

/** GET /api/recruiters/:id/team — get recruiter's team */
router.get("/:id/team", requireRole("admin", "recruiter"), async (req: AuthRequest, res) => {
  const recruiterId = String(req.params["id"]);

  // Recruiter can only view their own team
  if (req.user!.role === "recruiter" && req.user!.employee_id !== recruiterId) {
    res.status(403).json({ error: "You can only view your own team" });
    return;
  }

  const { data, error } = await supabase
    .from("employees")
    .select("*, workplace:workplaces(id, name, client_name, address)")
    .eq("reporting_manager_id", recruiterId)
    .eq("role", "employee")
    .order("full_name");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json((data ?? []).map((e) => sanitizeEmployee(e, req.user!.role)));
});

export { router as recruitersRouter };