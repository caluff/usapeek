import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { readCatalogOptions } from "../../../../../lib/catalog/product-options";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  res.json(await readCatalogOptions(req.scope, req.params.id));
}
