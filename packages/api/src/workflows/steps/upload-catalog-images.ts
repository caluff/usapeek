import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { FileDTO } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { catalogMediaService, requireCatalogUploadAccess, type CatalogUploadActor } from "../../lib/catalog-media/access";
import { prepareCatalogImages, type CatalogImageUpload } from "../../lib/catalog-media/validation";

export type UploadCatalogImagesInput = CatalogUploadActor & { body: CatalogImageUpload };

export const prepareCatalogImagesStep = createStep("prepare-catalog-images", async (input: UploadCatalogImagesInput, { container }) => {
  await requireCatalogUploadAccess(container, input);
  if (!await catalogMediaService(container).isStorageConfigured()) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Catalog image storage is not configured.");
  return new StepResponse({ files: prepareCatalogImages(input.body), seller_id: input.seller_id, member_id: input.member_id, auth_identity_id: input.auth_identity_id });
});

export const recordCatalogImagesStep = createStep("record-catalog-images", async (input: CatalogUploadActor & { files: FileDTO[] }, { container }) => {
  // Recheck live access before ownership is published if permissions changed during upload.
  await requireCatalogUploadAccess(container, input);
  const service = catalogMediaService(container);
  const records = input.files.map(file => ({ file_id: file.id, url: file.url, seller_id: input.seller_id, member_id: input.member_id }));
  try { await service.createCatalogImages(records); }
  catch (error) {
    // The ownership transaction may have committed even if its response was lost.
    const recovered = await service.listCatalogImages({ file_id: input.files.map(file => file.id), seller_id: input.seller_id });
    if (records.some(record => !recovered.some(row => row.file_id === record.file_id && row.url === record.url && row.member_id === record.member_id))) throw error;
  }
  return new StepResponse(input.files);
});
