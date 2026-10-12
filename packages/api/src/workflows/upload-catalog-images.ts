import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { uploadFilesWorkflow } from "@medusajs/core-flows";
import { prepareCatalogImagesStep, recordCatalogImagesStep, type UploadCatalogImagesInput } from "./steps/upload-catalog-images";

export const uploadCatalogImagesWorkflow = createWorkflow("upload-catalog-images", function (input: UploadCatalogImagesInput) {
  const prepared = prepareCatalogImagesStep(input);
  const files = uploadFilesWorkflow.runAsStep({ input: { files: prepared.files } });
  const owned = recordCatalogImagesStep({ seller_id: prepared.seller_id, member_id: prepared.member_id, auth_identity_id: prepared.auth_identity_id, files });
  return new WorkflowResponse(owned);
});
