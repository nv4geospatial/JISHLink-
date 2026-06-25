import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, AuthRequest } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

/** GET /api/designations — list all designations */
router.get("/", async (_req, res) => {
  const { data, error } = await supabase
    .from("designations")
    .select("*")
    .order("name");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json((data ?? []).map((d) => d.name));
});

/** POST /api/designations — create new designation (recruiter/admin) */
router.post("/", async (req: AuthRequest, res) => {
  if (!req.user || (req.user.role !== "recruiter" && req.user.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name } = req.body as { name: string };
  if (!name || !name.trim()) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  const { data, error } = await supabase
    .from("designations")
    .insert({ name: name.trim(), created_by: req.user.employee_id })
    .select()
    .single();
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.status(201).json(data);
});

/** DELETE /api/designations/:name — delete designation */
router.delete("/:name", async (req: AuthRequest, res) => {
  if (!req.user || (req.user.role !== "recruiter" && req.user.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rawName = req.params["name"];
  const name = decodeURIComponent(Array.isArray(rawName) ? rawName[0] : rawName);
  const { error } = await supabase
    .from("designations")
    .delete()
    .eq("name", name);
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json({ message: "Designation deleted" });
});

export { router as designationsRouter };