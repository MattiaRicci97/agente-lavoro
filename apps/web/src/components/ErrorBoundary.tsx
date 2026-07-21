import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Rete di sicurezza: se un componente va in errore durante il rendering,
 * mostra un messaggio leggibile invece di una pagina bianca. Il testo
 * dell'errore aiuta la diagnosi.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Visibile nella console del browser per la diagnosi.
    console.error("Sillabo — errore di rendering:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <h1 className="font-display text-2xl font-semibold text-primary">Qualcosa è andato storto</h1>
            <p className="text-muted-foreground">
              Si è verificato un errore imprevisto. Riprova a ricaricare la pagina.
            </p>
            <pre className="text-left text-xs bg-muted/60 border rounded-lg p-3 overflow-auto max-h-40 text-muted-foreground">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.assign("/")}
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
            >
              Torna alla home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
