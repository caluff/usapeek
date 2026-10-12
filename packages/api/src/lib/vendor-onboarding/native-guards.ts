import type { AuthenticatedMedusaRequest, MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http";
import { authenticate } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type SellerModule from "@mercurjs/core/modules/seller";
import { MercurModules, SellerRole } from "@mercurjs/types";
import { requireVendorAccess, requireVendorMembership, onboardingService, enableReadOnlyAccessScope, reuseNativeMembershipRead } from "./access";
import { onboardingHttp } from "./http";
import { OnboardingError } from "./errors";
import { guardSellerWarehouse } from "../vendor-warehouse/native-guards";
import { guardNativeStripeConnect } from "../stripe-connect/native-guards";
import { guardSellerShipping } from "../vendor-shipping/native-guards";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const path = (req: MedusaRequest) => req.originalUrl.split("?")[0].replace(/\/$/, "");

export async function vendorLiveGuard(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const route = path(req);
  if (req.method === "OPTIONS" || (req.method === "GET" && ["/vendor/sellers", "/vendor/stores", "/vendor/feature-flags"].includes(route)) || route === "/vendor/members/invites/accept") return next();
  if (route === "/vendor/sellers" && req.method === "POST") return onboardingHttp(res, async () => { throw new OnboardingError("seller_registration_disabled", 403); });
  return authenticate("member", ["session", "bearer"])(req, res, async (error) => {
    if (error) return next(error);
    return onboardingHttp(res, async () => {
      const authenticated = req as AuthenticatedMedusaRequest;
      if (["GET", "HEAD"].includes(req.method)) enableReadOnlyAccessScope(req.scope);
      const identity = await req.scope.resolve(Modules.AUTH).retrieveAuthIdentity(authenticated.auth_context.auth_identity_id);
      if (identity.app_metadata?.member_id !== authenticated.auth_context.actor_id) throw new OnboardingError("member_identity_conflict");
      const selected = route === "/vendor/sellers/select" ? object(req.body).seller_id : req.get("x-seller-id");
      reuseNativeMembershipRead(req.scope, authenticated.auth_context.actor_id, typeof selected === "string" ? selected : "", req.seller_context?.seller_member);
      const access = route === "/vendor/members/me" && req.method === "GET" ? requireVendorMembership : requireVendorAccess;
      const { seller, membership } = await access(req.scope, authenticated.auth_context.actor_id, typeof selected === "string" ? selected : "");
      authenticated.auth_context.app_metadata = { ...authenticated.auth_context.app_metadata, roles: [membership.role_id || SellerRole.SELLER_ADMINISTRATION] };
      if (object(req.body).external_id !== undefined) throw new OnboardingError("managed_seller_write_forbidden", 403);
      await guardSellerWarehouse(req, seller.id);
      await guardSellerShipping(req, seller.id);
      await guardNativeStripeConnect(req, seller.id);
      await guardInventoryScope(req, seller.id);
      await guardProductVisibility(req, seller.id);
      next();
    });
  });
}

export async function guardProductVisibility(req: MedusaRequest, sellerId: string) {
  const match = path(req).match(/^\/vendor\/(?:products|product-lifecycle)\/([^/]+)(?:\/.*)?$/);
  if (!match || req.method === "OPTIONS") return;
  const productId = decodeURIComponent(match[1]);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const [{ data: products }, { data: actions }, { data: restrictions }] = await Promise.all([
    query.graph({ entity: "product", fields: ["id", "status"], filters: { id: productId } }, { cache: { enable: false } }),
    query.graph({ entity: "product_change_action", fields: ["id"], filters: { product_id: productId, action: "PRODUCT_ADD", product_change: { created_by: sellerId } } }, { cache: { enable: false } }),
    query.graph({ entity: "product_seller", fields: ["seller_id"], filters: { product_id: productId } }, { cache: { enable: false } }),
  ]);
  if (!products[0] || (!actions.length && (products[0].status !== "published" || (restrictions.length && !restrictions.some(row => row.seller_id === sellerId))))) throw new OnboardingError("product_not_found", 404);
}

export async function guardInventoryScope(req: MedusaRequest, sellerId: string) {
  const route = path(req);
  if (!route.startsWith("/vendor/inventory-items") || req.method === "GET") return;
  const parts = route.split("/");
  const itemIds = new Set<string>();
  const locationIds = new Set<string>();
  const levelIds = new Set<string>();
  if (parts[3] && !["location-levels", "batch"].includes(parts[3])) itemIds.add(decodeURIComponent(parts[3]));
  if (parts[4] === "location-levels" && parts[5] && parts[5] !== "batch") locationIds.add(decodeURIComponent(parts[5]));
  const body = object(req.body);
  function collect(value: unknown) {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    const row = object(value);
    if (typeof row.location_id === "string") locationIds.add(row.location_id);
    if (typeof row.inventory_item_id === "string") itemIds.add(row.inventory_item_id);
    if (typeof row.id === "string" && route.includes("location-levels")) levelIds.add(row.id);
    for (const key of ["create", "update", "location_levels"]) if (row[key]) collect(row[key]);
    if (Array.isArray(row.delete)) for (const id of row.delete) if (typeof id === "string") levelIds.add(id);
  }
  collect(body);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  if (levelIds.size) {
    const { data: levels } = await query.graph({ entity: "inventory_level", fields: ["id", "inventory_item_id", "location_id"], filters: { id: [...levelIds] } }, { cache: { enable: false } });
    if (levels.length !== levelIds.size) throw new OnboardingError("inventory_scope_forbidden", 403);
    for (const level of levels) { itemIds.add(level.inventory_item_id); locationIds.add(level.location_id); }
  }
  const [{ data: items }, { data: locations }] = await Promise.all([
    itemIds.size ? query.graph({ entity: "inventory_item_seller", fields: ["inventory_item_id"], filters: { inventory_item_id: [...itemIds], seller_id: sellerId } }, { cache: { enable: false } }) : Promise.resolve({ data: [] }),
    locationIds.size ? query.graph({ entity: "stock_location_seller", fields: ["stock_location_id"], filters: { stock_location_id: [...locationIds], seller_id: sellerId } }, { cache: { enable: false } }) : Promise.resolve({ data: [] }),
  ]);
  if (items.length !== itemIds.size || locations.length !== locationIds.size) throw new OnboardingError("inventory_scope_forbidden", 403);
}

export async function managedSellerGuard(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  if (["GET", "OPTIONS"].includes(req.method)) return next();
  return onboardingHttp(res, async () => {
    const body = object(req.body);
    if (typeof body.external_id === "string" && body.external_id.startsWith("vendor-application:")) throw new OnboardingError("managed_seller_write_forbidden", 403);
    const match = path(req).match(/^\/admin\/sellers\/([^/]+)(.*)$/);
    if (!match) return next();
    const native = req.scope.resolve<InstanceType<typeof SellerModule.service>>(MercurModules.SELLER);
    const seller = (await native.listSellers({ id: decodeURIComponent(match[1]) }))[0];
    const applications = seller ? await onboardingService(req.scope).listVendorApplications({ seller_id: seller.id }) : [];
    if (!seller || (!seller.external_id?.startsWith("vendor-application:") && !applications.length)) return next();
    const id = applications[0]?.id || seller.external_id!.slice("vendor-application:".length);
    const application = applications[0] || (await onboardingService(req.scope).listVendorApplications({ id }))[0];
    if (!application || application.status !== "approved" || application.approval_state !== "complete") throw new OnboardingError("managed_seller_write_forbidden", 403);
    if (!match[2] && (req.method === "DELETE" || ["status", "approved_at", "rejected_at", "external_id", "member_id", "auth_identity_id"].some(key => key in body))) throw new OnboardingError("managed_seller_write_forbidden", 403);
    if (match[2] === "/approve") throw new OnboardingError("managed_seller_write_forbidden", 403);
    next();
  });
}
