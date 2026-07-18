import { useState } from "react";
import { customFetch } from "@sillabo/api-client-react";

interface UploadResponse {
  uploadURL: string;
  objectPath: string;
  metadata: { name: string; size: number; contentType: string };
}

interface UseUploadOptions {
  onSuccess?: (response: UploadResponse) => void;
}

/**
 * Carica un file sul bucket Supabase Storage in due passi:
 * 1. chiede all'API un URL firmato di upload
 * 2. invia il file direttamente a quell'URL
 */
export function useUpload({ onSuccess }: UseUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function uploadFile(file: File): Promise<UploadResponse | null> {
    setIsUploading(true);
    setError(null);
    try {
      const response = await customFetch<UploadResponse>("/api/storage/uploads/request-url", {
        method: "POST",
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
        responseType: "json",
      });

      const put = await fetch(response.uploadURL, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) {
        throw new Error(`Caricamento del file non riuscito (HTTP ${put.status})`);
      }

      onSuccess?.(response);
      return response;
    } catch (err) {
      const e = err instanceof Error ? err : new Error("Errore durante il caricamento del file");
      setError(e);
      return null;
    } finally {
      setIsUploading(false);
    }
  }

  return { uploadFile, isUploading, error };
}
