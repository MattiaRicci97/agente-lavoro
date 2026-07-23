import { useListMaterials, useGetMe } from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { timeGreeting, firstName } from "@/lib/greeting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { BookOpen, BrainCircuit, PlayCircle, FileText, GraduationCap, ScanLine, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CurriculumBadge } from "@/components/CurriculumBadge";

export default function StudioDashboard() {
  const { data: materials, isLoading } = useListMaterials();
  const { data: me } = useGetMe();

  const name = firstName(me?.studentMemberships?.[0]?.name);
  const greeting = name ? `${timeGreeting()}, ${name}!` : "Cosa studiamo oggi?";

  return (
    <StudentLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-3 mb-10">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-secondary sm:text-5xl">
            {greeting}
          </h1>
          <p className="text-muted-foreground text-lg text-balance max-w-lg mx-auto">
            Cosa studiamo oggi? Scegli un argomento e mettiti alla prova con quiz e simulazioni.
          </p>
        </div>

        <Link href="/studio/foto">
          <div className="group hover-elevate flex cursor-pointer items-center gap-4 rounded-2xl border border-secondary/20 bg-gradient-to-r from-secondary/10 to-secondary/5 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
              <ScanLine className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-semibold text-secondary">Correggi un compito da una foto</h3>
              <p className="text-sm text-muted-foreground">
                Fotografa il compito scritto a mano: l'AI lo legge, lo corregge e ti dà voto e consigli.
              </p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-secondary transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : materials?.length === 0 ? (
           <div className="text-center p-12 border rounded-lg bg-card border-dashed">
            <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Nessun materiale disponibile</h3>
            <p className="text-muted-foreground">I docenti non hanno ancora caricato materiali.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {materials?.map(material => (
              <Card key={material.id} className="flex flex-col overflow-hidden hover:shadow-md transition-shadow border-secondary/15">
                <CardHeader className="relative bg-secondary/5 pb-4 border-b border-secondary/10">
                  <div className="absolute left-0 top-0 h-full w-1 bg-secondary/40" />
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-secondary">{material.subject}</span>
                      <CardTitle className="font-display text-xl">{material.title}</CardTitle>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{material.gradeLevel}</p>
                  <CurriculumBadge topic={material.curriculumTopic} subtopic={material.curriculumSubtopic} />
                </CardHeader>
                <CardContent className="p-6 flex-1 flex flex-col justify-end space-y-4">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <BrainCircuit className="w-4 h-4 mr-2" />
                    {material.questionCount} domande disponibili
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 pt-4">
                    <Button asChild variant="outline" className="w-full">
                      <Link href={`/studio/material/${material.id}/quiz`}>
                        <BookOpen className="w-4 h-4 mr-2" />
                        Quiz
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full">
                      <Link href={`/studio/material/${material.id}/scritto`}>
                        <FileText className="w-4 h-4 mr-2" />
                        Scritto
                      </Link>
                    </Button>
                    <Button asChild className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground">
                      <Link href={`/studio/material/${material.id}/orale`}>
                        <PlayCircle className="w-4 h-4 mr-2" />
                        Orale
                      </Link>
                    </Button>
                  </div>

                  <Button asChild variant="ghost" className="w-full justify-center text-secondary hover:bg-secondary/10">
                    <Link href={`/studio/material/${material.id}/tutor`}>
                      <GraduationCap className="w-4 h-4 mr-2" />
                      Hai un dubbio? Chiedi al tutor
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
