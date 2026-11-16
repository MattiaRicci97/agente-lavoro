import { useEffect, useState } from "react";
import { customFetch } from "@sillabo/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Riproduce una registrazione dal bucket privato: come per le immagini, il
 * tag <audio> non puo' inviare il token, quindi il file si scarica e si
 * ascolta da memoria.
 */
export function ProtectedAudio({ objectPath, seconds }: { objectPath: string; seconds?: number | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    const key = objectPath.startsWith("/objects/") ? objectPath.slice("/objects/".length) : objectPath;
    // Il tipo si ricava dall'estensione: il server lo consegna come file generico.
    const type = key.endsWith(".mp4") || key.endsWith(".m4a") ? "audio/mp4" : key.endsWith(".ogg") ? "audio/ogg" : "audio/webm";

    customFetch<Blob>(`/api/storage/objects/${key}`, { responseType: "blob" })
      .then((blob) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(new Blob([blob], { type }));
        revoked = objectUrl;
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [objectPath]);

  if (failed) {
    return <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">Registrazione non disponibile</div>;
  }
  if (!url) return <Skeleton className="h-12 w-full" />;
  return (
    <div className="space-y-1">
      <audio controls src={url} className="w-full" />
      {seconds ? (
        <div className="text-xs text-muted-foreground">
          Durata: {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </div>
      ) : null}
    </div>
  );
}
