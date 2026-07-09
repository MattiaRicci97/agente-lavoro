import { useListMaterials } from "@sillabo/api-client-react";
import { StudentLayout } from "@/components/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { BookOpen, BrainCircuit, PlayCircle, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CurriculumBadge } from "@/components/CurriculumBadge";

export default function StudioDashboard() {
  const { data: materials, isLoading } = useListMaterials();

  return (
    <StudentLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-secondary">Cosa studiamo oggi?</h1>
          <p className="text-muted-foreground text-lg">Scegli un argomento e mettiti alla prova con quiz e simulazioni.</p>
        </div>

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
              <Card key={material.id} className="flex flex-col overflow-hidden hover:shadow-md transition-all border-secondary/20">
                <CardHeader className="bg-secondary/5 pb-4 border-b border-secondary/10">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-secondary">{material.subject}</span>
                      <CardTitle className="text-xl">{material.title}</CardTitle>
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
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
