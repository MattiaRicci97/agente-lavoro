import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch, useListClasses } from "@sillabo/api-client-react";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClipboardList, Download, ArrowRight, GraduationCap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { gradeTone } from "@/lib/grades";

interface Row {
  studentId: number;
  name: string;
  besDsa: boolean;
  average: number | null;
  gradesCount: number;
  lastDate: string | null;
}

interface Registro {
  class: { id: number; name: string; gradeLevel: string };
  students: Row[];
}

export default function CattedraRegistro() {
  const { toast } = useToast();
  const { data: classes, isLoading: classesLoading } = useListClasses();
  const [classId, setClassId] = useState<number | null>(null);
  const activeClassId = classId ?? classes?.[0]?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["registro", activeClassId],
    enabled: !!activeClassId,
    queryFn: () => customFetch<Registro>(`/api/classes/${activeClassId}/registro`, { responseType: "json" }),
  });

  // Il download passa da una fetch autenticata: su un <a href> il browser non
  // manderebbe il token e l'API risponderebbe 401.
  const exportCsv = useMutation({
    mutationFn: async () => {
      const blob = await customFetch<Blob>(`/api/classes/${activeClassId}/registro/export`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `registro-${data?.class.name ?? "classe"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: () =>
      toast({ title: "Esportazione non riuscita", description: "Riprova.", variant: "destructive" }),
  });

  if (classesLoading) {
    return (
      <TeacherLayout>
        <div className="mx-auto max-w-4xl space-y-6 p-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </TeacherLayout>
    );
  }

  if (!classes?.length) {
    return (
      <TeacherLayout>
        <div className="mx-auto max-w-4xl p-8">
          <div className="rounded-lg border border-dashed bg-card p-12 text-center">
            <GraduationCap className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">Nessuna classe</h3>
            <p className="text-muted-foreground">Crea una classe per aprire il registro.</p>
          </div>
        </div>
      </TeacherLayout>
    );
  }

  const students = data?.students ?? [];
  const conVoti = students.filter((s) => s.average !== null);
  const mediaClasse = conVoti.length
    ? Math.round((conVoti.reduce((s, r) => s + (r.average ?? 0), 0) / conVoti.length) * 10) / 10
    : null;

  return (
    <TeacherLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-8">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">Registro</h1>
          <p className="mt-1 text-muted-foreground">
            Le valutazioni che hai firmato, raccolte per studente. Le proposte dell'assistente non entrano qui.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={String(activeClassId ?? "")} onValueChange={(v) => setClassId(Number(v))}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name} — {c.gradeLevel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {mediaClasse !== null && (
            <Badge variant="outline" className="h-9 px-3">
              Media di classe {mediaClasse}
            </Badge>
          )}

          <Button
            variant="outline"
            className="ml-auto"
            onClick={() => exportCsv.mutate()}
            disabled={exportCsv.isPending || !activeClassId}
          >
            <Download className="mr-2 h-4 w-4" />
            {exportCsv.isPending ? "Preparo il file..." : "Esporta per il registro elettronico"}
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !students.length ? (
          <div className="rounded-lg border border-dashed bg-card p-12 text-center">
            <ClipboardList className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">Nessuno studente iscritto</h3>
            <p className="text-muted-foreground">
              Condividi il codice della classe: appena si iscrivono compaiono qui.
            </p>
          </div>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {students.map((s) => (
                <Link key={s.studentId} href={`/cattedra/registro/studente/${s.studentId}`}>
                  <div className="hover-elevate flex cursor-pointer items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        {s.name}
                        {s.besDsa && (
                          <Badge
                            variant="secondary"
                            className="bg-amber-100 px-1.5 py-0 text-[10px] text-amber-800 hover:bg-amber-100"
                          >
                            BES/DSA
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.gradesCount === 0
                          ? "Nessuna valutazione firmata"
                          : `${s.gradesCount} valutazion${s.gradesCount === 1 ? "e" : "i"}` +
                            (s.lastDate
                              ? ` · ultima il ${new Date(s.lastDate).toLocaleDateString("it-IT")}`
                              : "")}
                      </div>
                    </div>

                    {s.average !== null ? (
                      <span className={`text-lg font-semibold ${gradeTone(s.average)}`}>{s.average}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </TeacherLayout>
  );
}
