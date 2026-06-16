import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, AuthRequest } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

/** POST /api/absence-notes */
router.post("/", requireRole("recruiter", "admin"), async (req: AuthRequest, res) => {
  const { employee_id, date, reason, notes } = req.body as {
    employee_id: string; date: string; reason: string; notes?: string;
  };

  const { data, error } = await supabase
    .from("absence_notes")
    .insert({
      employee_id,
      date,
      recruiter_id: req.user!.employee_id,
      reason,
      notes,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) { res.status(400).json({ error: error.message }); return; }

  await supabase.from("audit_logs").insert({
    actor_id: req.user!.employee_id,
    action: "create_absence_note",
    target_table: "absence_notes",
    target_id: data.id,
    new_value: data,
  });

  res.status(201).json(data);
});

export { router as absenceRouter };
