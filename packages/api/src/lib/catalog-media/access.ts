import type { IAuthModuleService, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { SellerRole } from "@mercurjs/types";
import { requireVendorAccess } from "../vendor-onboarding/access";
import type CatalogMediaService from "../../modules/catalog-media/service";
import { CATALOG_MEDIA_MODULE } from "../../modules/catalog-media";
import { MAX_CATALOG_IMAGES } from "./validation";

export const catalogMediaService = (container: MedusaContainer) => container.resolve<CatalogMediaService>(CATALOG_MEDIA_MODULE);
const forbidden = (): never => { throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Catalog image access is not permitted."); };
export type CatalogUploadActor = { seller_id: string; member_id: string; auth_identity_id: string };

export async function requireCatalogUploadAccess(container: MedusaContainer, actor: CatalogUploadActor) {
  const identity = await container.resolve<IAuthModuleService>(Modules.AUTH).retrieveAuthIdentity(actor.auth_identity_id);
  if (identity.app_metadata?.member_id !== actor.member_id) forbidden();
  const { membership } = await requireVendorAccess(container, actor.member_id, actor.seller_id);
  const policies = await container.resolve(Modules.RBAC).listPoliciesForRole(membership.role_id || SellerRole.SELLER_ADMINISTRATION);
  if (!policies.some(policy => ["file", "*"].includes(policy.resource) && ["create", "*"].includes(policy.operation))) forbidden();
}

const imageSchema = z.strictObject({ id: z.string().min(1).optional(), url: z.string().min(1).max(2048) });
const thumbnailSchema = z.string().min(1).max(2048).nullable().optional();
const bodySchema = z.object({ product_id: z.string().min(1).optional(), variant_context: z.boolean().optional(), variant_id: z.string().min(1).optional(), variants: z.array(z.object({ id: z.string().min(1).optional(), thumbnail: thumbnailSchema })).max(100).optional(), images: z.array(imageSchema).max(100).optional(), thumbnail: thumbnailSchema });

// product_id must come from the route/workflow context, never an unchecked client field.
export async function assertSellerCatalogImages(container: MedusaContainer, sellerId: string, body: unknown): Promise<void> {
  const input = bodySchema.parse(body);
  if (input.images === undefined && input.thumbnail === undefined && !input.variants?.some(variant => variant.thumbnail !== undefined)) return;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  let currentImages: { id: string; url: string; hasVariants?: boolean }[] = [];
  let currentThumbnail: string | null = null;
  let currentVariants: { id: string; thumbnail: string | null }[] = [];
  if (input.product_id) {
    const [{ data: products }, { data: proposals }, { data: restrictions }, { data: gallery }] = await Promise.all([
      query.graph({ entity: "product", fields: ["id", "status", "images.id", "images.url", "images.variants.id", "thumbnail", "variants.id", "variants.thumbnail"], filters: { id: input.product_id } }, { cache: { enable: false } }),
      query.graph({ entity: "product_change_action", fields: ["id"], filters: { product_id: input.product_id, action: "PRODUCT_ADD", product_change: { created_by: sellerId } } }, { cache: { enable: false } }),
      query.graph({ entity: "product_seller", fields: ["seller_id"], filters: { product_id: input.product_id } }, { cache: { enable: false } }),
      query.graph({ entity: "product_image", fields: ["id", "url", "variants.id"], filters: { product_id: input.product_id } }, { cache: { enable: false } }),
    ]);
    const product = products[0];
    if (!product || (!proposals.length && (product.status !== "published" || (restrictions.length && !restrictions.some(row => row.seller_id === sellerId))))) forbidden();
    currentImages = gallery.map(image => ({ id: image.id, url: image.url, hasVariants: Boolean(image.variants?.length) }));
    currentThumbnail = product.thumbnail ?? null;
    currentVariants = (product.variants ?? []).flatMap(variant => variant ? [{ id: variant.id, thumbnail: variant.thumbnail ?? null }] : []);
    if (input.variant_context) {
      const variant = currentVariants.find(variant => variant.id === input.variant_id);
      if (input.variant_id && !variant) forbidden();
      currentThumbnail = variant?.thumbnail ?? null;
    }
  }
  const currentUrls = new Set(currentImages.map(image => image.url));
  if (currentThumbnail) currentUrls.add(currentThumbnail);
  const nextUrls = input.images?.map(image => image.url);
  if (input.product_id && !input.variant_context && nextUrls?.length === 0)
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "El producto necesita al menos una imagen.");
  if (nextUrls && new Set(nextUrls).size !== nextUrls.length) forbidden();
  // Existing shared galleries may predate this upload limit; allow preservation/removal.
  const generalUrls = nextUrls?.filter(url => !currentImages.some(image => image.url === url && image.hasVariants));
  if (generalUrls && generalUrls.length > MAX_CATALOG_IMAGES && generalUrls.some(url => !currentImages.some(image => image.url === url))) forbidden();
  for (const image of input.images ?? []) {
    if (image.id && !currentImages.some(current => current.id === image.id && current.url === image.url)) forbidden();
  }
  const needsOwnership = new Set<string>();
  for (const url of nextUrls ?? []) if (!currentUrls.has(url)) needsOwnership.add(url);
  if (nextUrls) for (const image of currentImages) if (!nextUrls.includes(image.url)) needsOwnership.add(image.url);
  if (input.thumbnail !== undefined && input.thumbnail !== currentThumbnail) {
    if (currentThumbnail) needsOwnership.add(currentThumbnail);
    if (input.thumbnail && !currentUrls.has(input.thumbnail)) needsOwnership.add(input.thumbnail);
  }
  for (const variant of input.variants ?? []) {
    if (variant.thumbnail === undefined) continue;
    const previous = currentVariants.find(current => current.id === variant.id);
    if (variant.id && !previous) forbidden();
    if (variant.thumbnail === previous?.thumbnail) continue;
    if (previous?.thumbnail) needsOwnership.add(previous.thumbnail);
    if (variant.thumbnail) needsOwnership.add(variant.thumbnail);
  }
  if (!needsOwnership.size) return;
  const owned = await catalogMediaService(container).listCatalogImages({ seller_id: sellerId, url: [...needsOwnership] });
  const ownedUrls = new Set(owned.map(image => image.url));
  if ([...needsOwnership].some(url => !ownedUrls.has(url))) forbidden();
}
