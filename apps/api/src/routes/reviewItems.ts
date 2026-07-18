import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, reviewItemsTable } from "@sillabo/db";
import {
  ListReviewItemsParams,
  ListReviewItemsResponse,
  UpdateReviewItemParams,
  UpdateReviewItemBody,
  UpdateReviewItemResponse,
} from "@sillabo/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/materials/:id/review-items/:studentName", requireAuth, async (req, res): Promise<void> => {
  const params = ListReviewItemsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(reviewItemsTable)
    .where(
      and(
        eq(reviewItemsTable.materialId, params.data.id),
        eq(reviewItemsTable.studentName, params.data.studentName),
      ),
    )
    .orderBy(asc(reviewItemsTable.dueDate));

  res.json(ListReviewItemsResponse.parse(rows));
});

router.patch("/review-items/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateReviewItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateReviewItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(reviewItemsTable)
    .set({ status: parsed.data.status })
    .where(eq(reviewItemsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Elemento di ripasso non trovato" });
    return;
  }

  res.json(UpdateReviewItemResponse.parse(updated));
});

export default router;
