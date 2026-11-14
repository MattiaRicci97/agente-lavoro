import { isNativeApp } from "./native";

/**
 * Salva un file generato dall'app (es. un CSV). Nel browser e' un normale
 * download; nell'app il file va nella cache e si apre il menu di condivisione
 * del telefono, da cui salvarlo o mandarlo (Drive, mail, WhatsApp...).
 */
export async function saveBlob(blob: Blob, fileName: string): Promise<void> {
  if (!isNativeApp) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const data = await blobToBase64(blob);
  const written = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
  await Share.share({ title: fileName, url: written.uri, dialogTitle: "Salva o condividi il file" });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
