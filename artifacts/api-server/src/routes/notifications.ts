import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, AuthRequest } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

/** GET /api/notifications */
router.get("/", async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", req.user!.employee_id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

/** POST /api/notifications/:id/read */
router.post("/:id/read", async (req: AuthRequest, res) => {
  await supabase.from("notifications").update({ read: true }).eq("id", req.params["id"]).eq("user_id", req.user!.employee_id);
  res.json({ message: "Marked as read" });
});

export { router as notificationsRouter };
