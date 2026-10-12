"use server";

import type { FileDTO } from "@medusajs/types";
import { authorizeVendor, errorMessage } from "../workspace/data";
import { scopedClient } from "../workspace/operations";
import { CATALOG_IMAGE_LIMIT, validateCatalogImages } from "./media-validation";

export async function uploadCatalogImageAction(
  form: FormData,
): Promise<
  { files: FileDTO[]; error?: never } | { error: string; files?: never }
> {
  try {
    const client = scopedClient(await authorizeVendor());
    const files = form.getAll("file");
    if (
      !files.length ||
      !files.every((file): file is File => file instanceof File)
    )
      throw new Error("Selecciona una imagen.");
    await validateCatalogImages(files);
    if (
      files.reduce((total, file) => total + file.size, 0) > CATALOG_IMAGE_LIMIT
    )
      throw new Error("Cada envío admite hasta 5 MB de imágenes.");
    return await client.post<{ files: FileDTO[] }>("/vendor/catalog-images", {
      files: await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          mime_type: file.type,
          content: Buffer.from(await file.arrayBuffer()).toString("base64"),
        })),
      ),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
