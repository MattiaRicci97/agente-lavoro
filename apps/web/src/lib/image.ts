/**
 * Ridimensiona una foto e la riconverte in JPEG nel browser prima dell'invio.
 * - riduce il peso (le foto dei telefoni sono spesso 3-8 MB)
 * - normalizza il formato (anche gli HEIC degli iPhone, che l'AI non legge,
 *   vengono ridisegnati su canvas come JPEG)
 */
export async function downscaleToJpeg(file: File, maxEdge = 2000, quality = 0.85): Promise<File> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Non riesco a leggere il file."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Il file non sembra un'immagine valida."));
    image.src = dataUrl;
  });

  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Il browser non supporta l'elaborazione dell'immagine.");
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Conversione dell'immagine non riuscita.");

  return new File([blob], "compito.jpg", { type: "image/jpeg" });
}
