import { inArray } from "drizzle-orm";
import { db, materialClassesTable } from "@sillabo/db";

export async function attachClassIds<T extends { id: number }>(
  rows: T[],
): Promise<(T & { classIds: number[] })[]> {
  if (!rows.length) return [];
  const links = await db
    .select({ materialId: materialClassesTable.materialId, classId: materialClassesTable.classId })
    .from(materialClassesTable)
    .where(
      inArray(
        materialClassesTable.materialId,
        rows.map((r) => r.id),
      ),
    );
  const classIdsByMaterial = new Map<number, number[]>();
  for (const link of links) {
    const list = classIdsByMaterial.get(link.materialId) ?? [];
    list.push(link.classId);
    classIdsByMaterial.set(link.materialId, list);
  }
  return rows.map((row) => ({ ...row, classIds: classIdsByMaterial.get(row.id) ?? [] }));
}
