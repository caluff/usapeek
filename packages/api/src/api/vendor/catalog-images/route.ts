import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { FileDTO } from "@medusajs/framework/types";
import type { CatalogImageUpload } from "../../../lib/catalog-media/validation";
import { uploadCatalogImagesWorkflow } from "../../../workflows/upload-catalog-images";

export async function POST(req: AuthenticatedMedusaRequest<CatalogImageUpload>, res: MedusaResponse<{ files: FileDTO[] }>) {
  const { result: files } = await uploadCatalogImagesWorkflow(req.scope).run({ input: {
    seller_id: req.get("x-seller-id") || "", member_id: req.auth_context.actor_id,
    auth_identity_id: req.auth_context.auth_identity_id, body: req.validatedBody,
  } });
  res.status(201).json({ files });
}
