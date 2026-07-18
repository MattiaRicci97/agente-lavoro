import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  GraduationCap,
  Mic,
  CalendarClock,
  Sparkles,
  BrainCircuit,
  ArrowRight,
} from "lucide-react";
import { Logo } from "@/components/Logo";

const features = [
  {
    icon: BrainCircuit,
    title: "Quiz che si adattano",
    text: "La difficoltà cambia con lo studente e insiste sugli argomenti più deboli.",
  },
  {
    icon: Mic,
    title: "Interrogazioni a voce",
    text: "Simulazioni orali con un esaminatore AI: si parla, non si digita.",
  },
  {
    icon: CalendarClock,
    title: "Ripasso pianificato",
    text: "Dalla data della verifica al piano di ripasso, in automatico.",
  },
  {
    icon: Sparkles,
    title: "Assistente per il docente",
    text: "Chiedi chi è in difficoltà e su cosa. Risposte sui dati reali della classe.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <Logo className="text-primary" size="md" />
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Accedi</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Crea un account</Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6">
        {/* Hero */}
        <section className="mx-auto max-w-3xl pt-14 pb-16 text-center sm:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-secondary/25 bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            La suite AI-nativa per scuole e università
          </span>

          <h1 className="mt-6 text-balance font-display text-5xl font-semibold leading-[1.05] tracking-tight text-primary sm:text-6xl">
            Il sistema operativo
            <br className="hidden sm:block" /> della didattica
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-muted-foreground">
            Preciso e professionale, ma caldo e umano. Sillabo trasforma i materiali del
            docente in quiz, interrogazioni e piani di ripasso su misura per ogni studente.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Inizia gratis
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-in">Ho già un account</Link>
            </Button>
          </div>
        </section>

        {/* Due mondi: Cattedra e Studio */}
        <section className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2">
          <div className="group relative overflow-hidden rounded-2xl border border-card-border bg-card p-8 shadow-sm transition-shadow hover:shadow-md">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/5 transition-transform group-hover:scale-125" />
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BookOpen className="h-6 w-6" />
              </div>
              <h2 className="mt-5 font-display text-2xl font-semibold text-primary">Cattedra</h2>
              <p className="mt-2 text-muted-foreground">
                Carica i materiali, tieni d'occhio le lacune della classe e lascia che
                l'AI prepari le esercitazioni al posto tuo.
              </p>
              <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                Area docenti
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-card-border bg-card p-8 shadow-sm transition-shadow hover:shadow-md">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-secondary/10 transition-transform group-hover:scale-125" />
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                <GraduationCap className="h-6 w-6" />
              </div>
              <h2 className="mt-5 font-display text-2xl font-semibold text-secondary">Studio</h2>
              <p className="mt-2 text-muted-foreground">
                Esercitati sui materiali della tua classe, affronta i quiz e prova le
                interrogazioni orali quando vuoi, al tuo ritmo.
              </p>
              <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-secondary">
                Area studenti
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
          </div>
        </section>

        {/* Cosa sa fare */}
        <section className="mx-auto max-w-5xl py-20">
          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-secondary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <Logo className="text-primary/80" size="sm" />
          <span>Dati in Europa · Costruito per la scuola italiana</span>
        </div>
      </footer>
    </div>
  );
}
