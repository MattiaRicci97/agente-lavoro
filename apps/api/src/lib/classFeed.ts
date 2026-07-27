import { db, classPostsTable } from "@sillabo/db";

/**
 * Avvisi automatici sulla bacheca.
 *
 * Non sono messaggi che Sillabo inventa: sono la registrazione di cose che il
 * docente ha appena fatto (condiviso un materiale, assegnato un compito,
 * fissato una verifica), pubblicate a suo nome perche' la classe le trovi in
 * un posto solo. Restano avvisi come gli altri: il docente puo' modificarli,
 * fissarli in cima o cancellarli.
 *
 * Se la pubblicazione fallisce non deve far fallire l'azione principale:
 * l'errore viene ingoiato di proposito.
 */
export async function announceToClasses(input: {
  classIds: number[];
  teacherId: number;
  authorName: string;
  kind: "compito" | "materiale" | "verifica";
  title: string;
  body?: string;
  materialId?: number | null;
  writtenExamId?: number | null;
  examDateId?: number | null;
}): Promise<void> {
  if (!input.classIds.length) return;

  try {
    await db.insert(classPostsTable).values(
      input.classIds.map((classId) => ({
        classId,
        teacherId: input.teacherId,
        authorName: input.authorName,
        kind: input.kind,
        title: input.title,
        body: input.body ?? "",
        materialId: input.materialId ?? null,
        writtenExamId: input.writtenExamId ?? null,
        examDateId: input.examDateId ?? null,
      })),
    );
  } catch {
    // La bacheca e' un di piu': non deve mai bloccare il gesto del docente.
  }
}
