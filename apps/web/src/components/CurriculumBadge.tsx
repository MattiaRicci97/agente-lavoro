import { Map } from "lucide-react";

export function CurriculumBadge({ topic, subtopic }: { topic?: string | null; subtopic?: string | null }) {
  if (!topic) return null;

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs font-medium">
      <Map className="h-3 w-3" />
      <span>{topic}{subtopic ? ` · ${subtopic}` : ""}</span>
    </div>
  );
}
