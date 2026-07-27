/** Colore del voto in decimi, con la soglia della sufficienza italiana. */
export function gradeTone(grade: number): string {
  if (grade >= 8) return "text-emerald-700";
  if (grade >= 6) return "text-foreground";
  if (grade >= 5) return "text-amber-700";
  return "text-destructive";
}
