import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, AuthRequest } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

/** GET /api/notifications — list user's notifications */
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

/** GET /api/notifications/unread-count */
router.get("/unread-count", async (req: AuthRequest, res) => {
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", req.user!.employee_id)
    .eq("read", false);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ count: count ?? 0 });
});

/** POST /api/notifications/:id/read — mark single as read */
router.post("/:id/read", async (req: AuthRequest, res) => {
  await supabase.from("notifications").update({ read: true }).eq("id", req.params["id"]).eq("user_id", req.user!.employee_id);
  res.json({ message: "Marked as read" });
});

/** POST /api/notifications/read-all — mark all as read */
router.post("/read-all", async (req: AuthRequest, res) => {
  await supabase.from("notifications").update({ read: true }).eq("user_id", req.user!.employee_id).eq("read", false);
  res.json({ message: "All marked as read" });
});

/** DELETE /api/notifications/clear-all — delete ALL notifications for user */
router.delete("/clear-all", async (req: AuthRequest, res) => {
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", req.user!.employee_id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "All notifications cleared" });
});

/** DELETE /api/notifications/clear-old — delete notifications older than 30 days */
router.delete("/clear-old", async (req: AuthRequest, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", req.user!.employee_id)
    .lt("created_at", thirtyDaysAgo);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: "Old notifications cleared" });
});

export { router as notificationsRouter };
