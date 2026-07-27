import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@sillabo/api-client-react";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  ScanLine,
  Mic,
  PenLine,
  Lock,
  Trash2,
  BrainCircuit,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { gradeTone } from "@/lib/grades";

interface Entry {
  kind: "compito" | "interrogazione" | "elaborato";
  id: number;
  date: string;
  subject: string;
  title: string;
  grade: number | null;
  feedback: string | null;
}

interface Note {
  id: number;
  body: string;
  createdAt: string;
}

interface Detail {
  student: { id: number; name: string; besDsa: boolean; className: string; gradeLevel: string };
  average: number | null;
  entries: Entry[];
  practice: { attempts: number; accuracyPercent: number | null; lastAt: string | null };
  notes: Note[];
}

const KIND: Record<Entry["kind"], { label: string; icon: LucideIcon }> = {
  compito: { label: "Compito", icon: ScanLine },
  interrogazione: { label: "Interrogazione", icon: Mic },
  elaborato: { label: "Elaborato", icon: PenLine },
};

/** Andamento dei voti nel tempo, dal più vecchio al più recente. */
function Andamento({ entries }: { entries: Entry[] }) {
  const graded = entries.filter((e) => e.grade !== null).slice().reverse();
  if (graded.length < 2) return null;

  const first = graded[0].grade!;
  const last = graded[graded.length - 1].grade!;
  const delta = Math.round((last - first) * 10) / 10;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-secondary" />
          Andamento
        </CardTitle>
        <CardDescription>
          {delta > 0
            ? `In crescita: dal ${first} al ${last}.`
            : delta < 0
              ? `In calo: dal ${first} al ${last}.`
              : `Stabile intorno al ${last}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-24 items-end gap-1.5">
          {graded.map((e) => (
            <div
              key={`${e.kind}-${e.id}`}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${e.title}: ${e.grade}/10`}
            >
              <div
                className={`w-full rounded-t ${e.grade! >= 6 ? "bg-secondary/60" : "bg-destructive/50"}`}
                style={{ height: `${(e.grade! / 10) * 100}%` }}
              />
              <span className="text-[10px] text-muted-foreground">{e.grade}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CattedraStudente() {
  const { id } = useParams();
  const studentId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const queryKey = ["studentRegistro", studentId];
  const { data, isLoading } = useQuery({
    queryKey,
    enabled: Number.isInteger(studentId),
    queryFn: () => customFetch<Detail>(`/api/students/${studentId}/registro`, { responseType: "json" }),
  });

  const addNote = useMutation({
    mutationFn: () =>
      customFetch(`/api/students/${studentId}/notes`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ body: note.trim() }),
      }),
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast({ title: "Nota non salvata", variant: "destructive" }),
  });

  const removeNote = useMutation({
    mutationFn: (noteId: number) => customFetch(`/api/student-notes/${noteId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  if (isLoading) {
    return (
      <TeacherLayout>
        <div className="mx-auto max-w-3xl space-y-6 p-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      </TeacherLayout>
    );
  }

  if (!data) {
    return (
      <TeacherLayout>
        <div className="mx-auto max-w-3xl p-8 text-center text-muted-foreground">Studente non trovato.</div>
      </TeacherLayout>
    );
  }

  const { student, entries, practice, notes } = data;

  return (
    <TeacherLayout>
      <div className="mx-auto max-w-3xl space-y-6 p-8">
        <Button variant="ghost" asChild className="-ml-4">
          <Link href="/cattedra/registro">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna al registro
          </Link>
        </Button>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">
              {student.name}
            </h1>
            <p className="mt-1 flex items-center gap-2 text-muted-foreground">
              {student.className} — {student.gradeLevel}
              {student.besDsa && (
                <Badge
                  variant="secondary"
                  className="bg-amber-100 text-[10px] text-amber-800 hover:bg-amber-100"
                >
                  BES/DSA
                </Badge>
              )}
            </p>
          </div>
          {data.average !== null && (
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Media</div>
              <div className={`font-display text-4xl font-semibold ${gradeTone(data.average)}`}>
                {data.average}
              </div>
            </div>
          )}
        </div>

        <Andamento entries={entries} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Valutazioni firmate</CardTitle>
            <CardDescription>
              Solo le prove che hai validato tu. Quelle in attesa restano in "Da validare".
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!entries.length ? (
              <p className="p-5 text-sm text-muted-foreground">
                Nessuna valutazione firmata per questo studente.
              </p>
            ) : (
              <div className="divide-y">
                {entries.map((e) => {
                  const meta = KIND[e.kind];
                  const Icon = meta.icon;
                  return (
                    <div key={`${e.kind}-${e.id}`} className="flex items-start gap-3 p-4">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground">{meta.label}</span>
                          <span className="text-xs text-muted-foreground">· {e.subject}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {new Date(e.date).toLocaleDateString("it-IT")}
                          </span>
                        </div>
                        <div className="mt-0.5 font-medium">{e.title}</div>
                        {e.feedback && (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                            {e.feedback}
                          </p>
                        )}
                      </div>
                      {e.grade !== null && (
                        <span className={`text-lg font-semibold ${gradeTone(e.grade)}`}>{e.grade}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BrainCircuit className="h-4 w-4 text-secondary" />
              Esercitazione autonoma
            </CardTitle>
            <CardDescription>
              Quanto si allena da solo con i quiz. Non è una valutazione e non fa media.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-8 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Sessioni</div>
              <div className="mt-1 text-2xl font-semibold">{practice.attempts}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Risposte corrette</div>
              <div className="mt-1 text-2xl font-semibold">
                {practice.accuracyPercent === null ? "—" : `${practice.accuracyPercent}%`}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Ultima volta</div>
              <div className="mt-1 text-2xl font-semibold">
                {practice.lastAt ? new Date(practice.lastAt).toLocaleDateString("it-IT") : "—"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Lock className="h-4 w-4 text-muted-foreground" />
              Le tue osservazioni
            </CardTitle>
            <CardDescription>
              Private: non le vede lo studente, non le vede un collega, e non vengono passate
              all'assistente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="es. Partecipa poco ma i compiti scritti sono curati. Provare a interrogarlo su temi che gli interessano."
                className="min-h-[70px] resize-none"
              />
              <Button
                onClick={() => addNote.mutate()}
                disabled={addNote.isPending || !note.trim()}
                className="self-end"
              >
                Salva
              </Button>
            </div>

            {notes.map((n) => (
              <div key={n.id} className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">
                    {new Date(n.createdAt).toLocaleDateString("it-IT")}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{n.body}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeNote.mutate(n.id)}
                  aria-label="Elimina la nota"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </TeacherLayout>
  );
}
