import { useListInstitutions, useGetInstitutionDashboard, getGetInstitutionDashboardQueryKey, useListClasses, useListStudents } from "@sillabo/api-client-react";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, BookOpen, AlertTriangle, GraduationCap } from "lucide-react";
import { useState } from "react";

function ClassRoster({ classId, className }: { classId: number; className: string }) {
  const { data: students, isLoading } = useListStudents(classId);

  return (
    <div className="border rounded-lg p-4 bg-muted/20">
      <div className="font-semibold mb-3">{className}</div>
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : !students?.length ? (
        <div className="text-sm text-muted-foreground">Nessuno studente iscritto.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {students.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-card border rounded-md text-sm">
              {s.name}
              {s.besDsa && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 hover:bg-amber-100">
                  BES/DSA
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CattedraIstituto() {
  const { data: institutions, isLoading: institutionsLoading } = useListInstitutions();
  const institutionId = institutions?.[0]?.id;

  const { data: dashboard, isLoading: dashboardLoading } = useGetInstitutionDashboard(institutionId as number, {
    query: { enabled: !!institutionId, queryKey: getGetInstitutionDashboardQueryKey(institutionId as number) },
  });

  const { data: classes, isLoading: classesLoading } = useListClasses();

  const isLoading = institutionsLoading || dashboardLoading;

  if (isLoading) {
    return (
      <TeacherLayout>
        <div className="p-8 max-w-6xl mx-auto space-y-8">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      </TeacherLayout>
    );
  }

  if (!institutionId || !dashboard) {
    return (
      <TeacherLayout>
        <div className="p-8 max-w-6xl mx-auto">
          <div className="text-center p-12 border rounded-lg bg-card border-dashed">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Nessun istituto configurato</h3>
            <p className="text-muted-foreground">Configura un istituto per vedere la vista del dirigente scolastico.</p>
          </div>
        </div>
      </TeacherLayout>
    );
  }

  return (
    <TeacherLayout>
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{dashboard.institutionName}</h1>
          <p className="text-muted-foreground mt-1">Vista aggregata del dirigente scolastico su tutte le classi.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Classi</CardTitle>
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard.classesCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Studenti</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard.studentsCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Materiali</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard.materialsCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Media Quiz</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard.averageQuizScorePercent}%</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Andamento per classe</CardTitle>
                <CardDescription>Confronto tra le classi dell'istituto</CardDescription>
              </CardHeader>
              <CardContent>
                {!dashboard.classBreakdown.length ? (
                  <div className="text-center p-6 text-muted-foreground text-sm">Dati insufficienti</div>
                ) : (
                  <div className="space-y-4">
                    {dashboard.classBreakdown.map((c) => (
                      <div key={c.classId} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                        <div>
                          <div className="font-medium">{c.className}</div>
                          <div className="text-xs text-muted-foreground">{c.studentsCount} studenti</div>
                        </div>
                        <div className="flex items-center gap-4">
                          {c.atRiskCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {c.atRiskCount} a rischio
                            </span>
                          )}
                          <div className="text-sm font-semibold w-14 text-right">{c.averageQuizScorePercent}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mappa delle lacune di istituto</CardTitle>
                <CardDescription>Argomenti più critici in tutte le classi</CardDescription>
              </CardHeader>
              <CardContent>
                {!dashboard.topicGaps.length ? (
                  <div className="text-center p-6 text-muted-foreground text-sm">Dati insufficienti</div>
                ) : (
                  <div className="space-y-4">
                    {dashboard.topicGaps.map((gap, i) => (
                      <div key={i} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                        <div>
                          <div className="font-medium">{gap.topic}</div>
                          <div className="text-xs text-muted-foreground">{gap.attemptsCount} tentativi</div>
                        </div>
                        <div className="text-sm font-semibold">{gap.accuracyRate}% corretti</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-destructive/20 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Studenti a rischio
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!dashboard.atRiskStudents.length ? (
                  <div className="text-sm text-muted-foreground">Nessuno studente a rischio rilevato.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {dashboard.atRiskStudents.map((name, i) => (
                      <span key={i} className="px-2 py-1 bg-destructive/10 text-destructive text-xs font-medium rounded-md">
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Classi e studenti</h2>
          {classesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !classes?.length ? (
            <div className="text-sm text-muted-foreground">Nessuna classe configurata.</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {classes.map((c) => (
                <ClassRoster key={c.id} classId={c.id} className={`${c.name} — ${c.gradeLevel} (${c.teacherName})`} />
              ))}
            </div>
          )}
        </div>
      </div>
    </TeacherLayout>
  );
}
