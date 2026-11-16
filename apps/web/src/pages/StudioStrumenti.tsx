import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { customFetch, useGetMaterial, getGetMaterialQueryKey } from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AudioScript } from "@/components/AudioScript";
import { ArrowLeft, BookA, Languages, Headphones } from "lucide-react";

interface SharedTool {
  kind: "glossario" | "traduzione" | "ripasso_audio";
  language: string | null;
  body: string;
}

/** Glossario e sintesi tradotta che il docente ha scelto di condividere su un materiale. */
export default function StudioStrumenti() {
  const { id } = useParams();
  const materialId = parseInt(id || "0");
  const { data: material } = useGetMaterial(materialId, {
    query: { enabled: !!materialId, queryKey: getGetMaterialQueryKey(materialId) },
  });
  const { data, isLoading } = useQuery({
    queryKey: ["sharedTools", materialId],
    enabled: !!materialId,
    queryFn: () => customFetch<{ tools: SharedTool[] }>(`/api/materials/${materialId}/shared-tools`, { responseType: "json" }),
  });
  const tools = data?.tools ?? [];
  // Prima il ripasso da ascoltare, poi il glossario, poi la traduzione.
  const ORDER = { ripasso_audio: 0, glossario: 1, traduzione: 2 };
  const sorted = [...tools].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" asChild className="-ml-4">
          <Link href="/studio">
            <ArrowLeft className="mr-2 h-4 w-4" /> Torna ai materiali
          </Link>
        </Button>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-secondary">{material?.title ?? "Materiale"}</h1>
          <p className="text-muted-foreground">Preparato dal tuo docente per aiutarti a studiare.</p>
        </div>
        {isLoading ? (
          <Skeleton className="h-64" />
        ) : sorted.length === 0 ? (
          <div className="text-center p-12 border rounded-lg bg-card border-dashed text-muted-foreground">
            Per questo materiale non c'è ancora nulla di condiviso.
          </div>
        ) : (
          sorted.map((t) => (
            <Card key={t.kind}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {t.kind === "glossario" ? (
                    <BookA className="h-5 w-5 text-secondary" />
                  ) : t.kind === "ripasso_audio" ? (
                    <Headphones className="h-5 w-5 text-secondary" />
                  ) : (
                    <Languages className="h-5 w-5 text-secondary" />
                  )}
                  {t.kind === "glossario"
                    ? "Glossario"
                    : t.kind === "ripasso_audio"
                      ? "Ripasso da ascoltare"
                      : `Sintesi in ${t.language?.toLowerCase() ?? "un'altra lingua"}`}
                </CardTitle>
                {t.kind === "traduzione" && (
                  <p className="text-xs text-muted-foreground">
                    Traduzione automatica: può contenere imprecisioni. Per i dubbi vale il materiale in italiano.
                  </p>
                )}
              </CardHeader>
              {t.kind === "ripasso_audio" ? (
                <CardContent>
                  <AudioScript body={t.body} />
                </CardContent>
              ) : (
                <CardContent className="whitespace-pre-wrap text-sm leading-relaxed" dir="auto">
                  {t.body}
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>
    </StudentLayout>
  );
}
