import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
  MiddlewareRoute,
} from "@medusajs/framework/http";
import { validateAndTransformBody } from "@medusajs/framework/http";
import { MedusaError, PolicyOperation } from "@medusajs/framework/utils";
import type { SellerContext } from "@mercurjs/core/types/seller-context";
import { validateVendorCatalogWorkflow } from "../../../workflows/validate-vendor-catalog";
import "../../../workflows/hooks/vendor-offer-validation";
import { VariantMediaUpdateSchema } from "../../../lib/catalog/variant-media";
import { CreateCompleteVariantSchema } from "../../../lib/catalog/create-complete-variant";

const guard =
  (mode: "create" | "update" | "variant" | "attributes") =>
  async (
    req: MedusaRequest & { seller_context?: SellerContext },
    _res: MedusaResponse,
    next: MedusaNextFunction,
  ) => {
    const sellerId = req.seller_context?.seller_id;
    if (!sellerId)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Seller context is required.",
      );
    await validateVendorCatalogWorkflow(req.scope).run({
      input: {
        seller_id: sellerId,
        mode,
        body: req.body,
        product_id: req.params.id,
        variant_id: req.params.variant_id,
      },
    });
    next();
  };

export const vendorCatalogMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/vendor/products/:id/variant-configurations",
    method: "POST",
    bodyParser: { sizeLimit: "32kb" },
    policies: [{ resource: "product", operation: PolicyOperation.update }],
    middlewares: [validateAndTransformBody(CreateCompleteVariantSchema)],
  },
  {
    matcher: "/vendor/products/:id/variants/:variant_id/media",
    method: "POST",
    bodyParser: { sizeLimit: "32kb" },
    policies: [{ resource: "product", operation: PolicyOperation.update }],
    middlewares: [validateAndTransformBody(VariantMediaUpdateSchema)],
  },
  {
    matcher: "/vendor/products/:id/catalog-options",
    method: "GET",
    middlewares: [],
    policies: [{ resource: "product", operation: PolicyOperation.read }],
  },
  {
    matcher: "/vendor/products",
    method: "POST",
    bodyParser: { sizeLimit: "128kb" },
    middlewares: [guard("create")],
  },
  {
    matcher: "/vendor/products/:id",
    method: "POST",
    bodyParser: { sizeLimit: "256kb" },
    middlewares: [guard("update")],
  },
  {
    matcher: "/vendor/products/:id/variants",
    method: "POST",
    middlewares: [guard("variant")],
  },
  {
    matcher: "/vendor/products/:id/variants/:variant_id",
    method: "POST",
    middlewares: [guard("variant")],
  },
  {
    matcher: "/vendor/products/:id/variants/:variant_id",
    method: "DELETE",
    middlewares: [guard("variant")],
  },
  {
    matcher: "/vendor/products/:id/attributes/batch",
    method: "POST",
    bodyParser: { sizeLimit: "32kb" },
    middlewares: [guard("attributes")],
  },
  {
    matcher: "/vendor/product-categories/:id/products",
    method: "POST",
    middlewares: [
      () => {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Propose category changes through the moderated product endpoint.",
        );
      },
    ],
  },
];
