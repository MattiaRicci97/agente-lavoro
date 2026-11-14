import { isNativeApp } from "./native";

/**
 * Scatta (o sceglie dalla galleria) una foto con la fotocamera nativa e la
 * restituisce come File, cosi' il resto del flusso (riduzione, caricamento,
 * correzione) resta identico al portale. Null se lo studente annulla.
 */
export async function takeNativePhoto(): Promise<File | null> {
  if (!isNativeApp) return null;
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.Uri,
      source: CameraSource.Prompt,
      promptLabelHeader: "Foto del compito",
      promptLabelPhoto: "Dalla galleria",
      promptLabelPicture: "Scatta una foto",
      promptLabelCancel: "Annulla",
      correctOrientation: true,
    });
    if (!photo.webPath) return null;
    const blob = await (await fetch(photo.webPath)).blob();
    return new File([blob], `compito.${photo.format || "jpeg"}`, { type: blob.type || "image/jpeg" });
  } catch (err) {
    // Annullare la scelta non e' un errore.
    if (err instanceof Error && /cancel/i.test(err.message)) return null;
    throw err;
  }
}
