export const CATALOG_IMAGE_LIMIT = 5 * 1024 * 1024;
export const CATALOG_IMAGE_COUNT = 6;

export async function validateCatalogImages(files: File[]) {
  if (files.length > CATALOG_IMAGE_COUNT)
    throw new Error("Selecciona hasta seis imágenes.");
  for (const file of files) {
    if (!file.size || file.size > CATALOG_IMAGE_LIMIT)
      throw new Error(
        `${file.name}: el archivo debe pesar entre 1 byte y 5 MB.`,
      );
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    );
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp =
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (
      !(png && file.type === "image/png") &&
      !(jpeg && file.type === "image/jpeg") &&
      !(webp && file.type === "image/webp")
    )
      throw new Error(
        `${file.name}: selecciona un archivo PNG, JPEG o WebP válido.`,
      );
  }
  return files;
}
