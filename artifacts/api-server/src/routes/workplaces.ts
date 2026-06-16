import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, AuthRequest } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

/** GET /api/workplaces */
router.get("/", async (_req, res) => {
  const { data, error } = await supabase.from("workplaces").select("*").order("name");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

/** POST /api/workplaces */
router.post("/", requireRole("admin"), async (req: AuthRequest, res) => {
  const { data, error } = await supabase.from("workplaces").insert(req.body).select().single();
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.status(201).json(data);
});

export { router as workplacesRouter };
