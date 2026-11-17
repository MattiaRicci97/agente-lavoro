import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, reviewItemsTable, teachersTable } from "@sillabo/db";
import {
  ListReviewItemsParams,
  ListReviewItemsResponse,
  UpdateReviewItemParams,
  UpdateReviewItemBody,
  UpdateReviewItemResponse,
} from "@sillabo/api-zod";
import { requireAuth, findApprovedStudentForMaterial } from "../middlewares/auth";
import { teacherCanManageMaterial } from "../lib/materialAccess";

/**
 * I ripassi sono identificati dal nome dello studente (schema precedente
 * all'introduzione di auth_user_id): chi li chiede deve essere quello
 * studente, nella classe a cui il materiale e' assegnato, oppure un docente
 * che gestisce il materiale.
 */
async function canSeeReviewItems(authUserId: string, materialId: number, studentName: string): Promise<boolean> {
  const student = await findApprovedStudentForMaterial(authUserId, materialId);
  if (student && student.name === studentName) return true;
  const [teacher] = await db
    .select({ id: teachersTable.id })
    .from(teachersTable)
    .where(eq(teachersTable.authUserId, authUserId));
  return !!teacher && (await teacherCanManageMaterial(teacher.id, materialId));
}

const router: IRouter = Router();

router.get("/materials/:id/review-items/:studentName", requireAuth, async (req, res): Promise<void> => {
  const params = ListReviewItemsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!(await canSeeReviewItems(req.authUserId!, params.data.id, params.data.studentName))) {
    res.status(404).json({ error: "Materiale non trovato" });
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

  const [item] = await db.select().from(reviewItemsTable).where(eq(reviewItemsTable.id, params.data.id));
  if (!item) {
    res.status(404).json({ error: "Elemento di ripasso non trovato" });
    return;
  }
  // Solo lo studente a cui appartiene il ripasso puo' segnarlo come fatto.
  const student = await findApprovedStudentForMaterial(req.authUserId!, item.materialId);
  if (!student || student.name !== item.studentName) {
    res.status(404).json({ error: "Elemento di ripasso non trovato" });
    return;
  }

  const [updated] = await db
    .update(reviewItemsTable)
    .set({ status: parsed.data.status })
    .where(eq(reviewItemsTable.id, params.data.id))
    .returning();

  res.json(UpdateReviewItemResponse.parse(updated));
});

export default router;
