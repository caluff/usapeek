import type { uploadCatalogImageAction } from "./upload-action";
import { CATALOG_IMAGE_COUNT, CATALOG_IMAGE_LIMIT } from "./media-validation";

export type CatalogAttachment = {
  id: string;
  url: string;
  name: string;
  file?: File;
};

/** Persist successful uploads immediately, allowing retries without uploading them again. */
export async function prepareCatalogImages(
  attachments: CatalogAttachment[],
  upload: typeof uploadCatalogImageAction,
  onUploaded: (attachment: CatalogAttachment) => void,
  maxImages = CATALOG_IMAGE_COUNT,
): Promise<{ url: string }[]> {
  const pending = attachments.filter(
    (attachment): attachment is CatalogAttachment & { file: File } =>
      !!attachment.file,
  );
  if (
    attachments.length > maxImages ||
    pending.some(({ file }) => !file.size || file.size > CATALOG_IMAGE_LIMIT)
  )
    throw new Error(
      `Selecciona hasta ${maxImages} imágenes de 5 MB como máximo.`,
    );
  if (!pending.length) return attachments.map(({ url }) => ({ url }));
  const savedUrls = new Map<string, string>();
  for (let index = 0; index < pending.length;) {
    const batch: typeof pending = [];
    let bytes = 0;
    while (
      index < pending.length &&
      bytes + pending[index].file.size <= CATALOG_IMAGE_LIMIT
    ) {
      const attachment = pending[index++];
      batch.push(attachment);
      bytes += attachment.file.size;
    }
    const form = new FormData();
    for (const attachment of batch) form.append("file", attachment.file);
    const result = await upload(form);
    if (!result.files) throw new Error(result.error);
    if (
      result.files.length !== batch.length ||
      result.files.some((file) => !file.url)
    )
      throw new Error("El servicio no devolvió la imagen guardada.");
    batch.forEach((attachment, fileIndex) => {
      const saved = {
        id: attachment.id,
        name: attachment.name,
        url: result.files[fileIndex].url,
      };
      savedUrls.set(saved.id, saved.url);
      onUploaded(saved);
    });
  }
  return attachments.map(({ id, url }) => ({ url: savedUrls.get(id) ?? url }));
}
