import { useEffect, useState } from "react";
import { customFetch } from "@sillabo/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mostra un'immagine dal bucket privato: il tag <img> non può inviare il
 * token di autenticazione, quindi la scarichiamo e la mostriamo da memoria.
 */
export function ProtectedImage({
  objectPath,
  alt,
  className,
}: {
  objectPath: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    const key = objectPath.startsWith("/objects/") ? objectPath.slice("/objects/".length) : objectPath;

    customFetch<Blob>(`/api/storage/objects/${key}`, { responseType: "blob" })
      .then((blob) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
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
    return <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">Immagine non disponibile</div>;
  }
  if (!url) return <Skeleton className="h-48 w-full" />;
  return <img src={url} alt={alt} className={className} />;
}
