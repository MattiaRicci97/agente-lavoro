import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BookOpen, GraduationCap } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-3xl w-full text-center space-y-8">
        <div className="space-y-4">
          <Logo className="text-primary justify-center" size="xl" />
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Il sistema operativo della didattica.
            Preciso, professionale, ma caldo e umano.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/sign-up">Crea un account</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/sign-in">Accedi</Link>
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-4 max-w-2xl mx-auto">
          <div className="p-8 bg-card rounded-xl border shadow-sm flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <BookOpen className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-semibold">Cattedra</h2>
            <p className="text-muted-foreground">Area docenti: gestisci materiali, analizza le lacune e monitora l'apprendimento.</p>
          </div>

          <div className="p-8 bg-card rounded-xl border shadow-sm flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center text-secondary">
              <GraduationCap className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-semibold">Studio</h2>
            <p className="text-muted-foreground">Area studenti: esercitati sui materiali, affronta i quiz e simula interrogazioni.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
