import { createHash } from "node:crypto";
import type { MedusaContainer, IStockLocationService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { MercurModules } from "@mercurjs/types";
import { onboardingService } from "../../lib/vendor-onboarding/access";
import { OnboardingError } from "../../lib/vendor-onboarding/errors";
import { validateCompleteData, canonicalHash } from "../../lib/vendor-onboarding/validation";
import { requireSellerWarehouse, sellerWarehouseLinks } from "../../lib/vendor-warehouse/access";
import type { WarehouseRecord } from "../../modules/vendor-onboarding/service";

const locationLink = (claim: WarehouseRecord) => ({ [Modules.STOCK_LOCATION]: { stock_location_id: claim.stock_location_id }, [MercurModules.SELLER]: { seller_id: claim.seller_id } });

// Called only inside workflow steps. The claim commits BEFORE any native write.
export async function provisionVendorWarehouse(container: MedusaContainer, input: { application_id: string; operation_id: string; seller_id: string }) {
  const service = onboardingService(container);
  const application = await service.retrieveVendorApplication(input.application_id);
  const data = validateCompleteData(application.submitted_data);
  const address = { ...data.activity.business_address, phone: data.responsible.phone };
  const links = await sellerWarehouseLinks(container, input.seller_id);
  if (links.length > 1) throw new OnboardingError("warehouse_conflict");
  const suffix = createHash("sha256").update(input.seller_id).digest("hex").slice(0, 32);
  const claim = await service.claimWarehouse({ ...input, id: `vwh_${suffix}`, stock_location_id: links[0]?.stock_location_id || `sloc_vwh_${suffix}`, submission_revision: application.submission_revision, address, name: data.store.name, created_location: links.length === 0 });
  if (claim.state === "ready") return requireSellerWarehouse(container, input.seller_id);
  const stock = container.resolve<IStockLocationService>(Modules.STOCK_LOCATION);
  let location = (await stock.listStockLocations({ id: claim.stock_location_id }, { relations: ["address"] }))[0];
  if (!location && !claim.created_location) throw new OnboardingError("warehouse_conflict");
  if (!location) {
    // Medusa accepts caller IDs; its primary key is the second fence if workers overlap.
    const locationInput = { id: claim.stock_location_id, name: claim.name, address, metadata: { vendor_warehouse_claim: claim.id } };
    try { location = await stock.createStockLocations(locationInput); }
    catch (error) {
      location = (await stock.listStockLocations({ id: claim.stock_location_id }, { relations: ["address"] }))[0];
      if (!location) throw error;
    }
  }
  if (claim.created_location && location.metadata?.vendor_warehouse_claim !== claim.id) throw new OnboardingError("warehouse_conflict");
  // Adopt only an exact approved-address match; never rewrite an operating warehouse.
  const actualAddress = Object.fromEntries(Object.keys(address).map(key => [key, location.address?.[key] ?? ""]));
  if (canonicalHash(actualAddress) !== canonicalHash(claim.address)) throw new OnboardingError("warehouse_address_conflict");
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const readOwners = async () => (await query.graph({ entity: "stock_location_seller", fields: ["seller_id"], filters: { stock_location_id: claim.stock_location_id } }, { cache: { enable: false } })).data;
  let owners = await readOwners();
  if (owners.some(owner => owner.seller_id !== input.seller_id)) throw new OnboardingError("warehouse_conflict");
  if (!owners.length) {
    try { await container.resolve(ContainerRegistrationKeys.LINK).create(locationLink(claim)); }
    catch (error) {
      owners = await readOwners();
      if (owners.length !== 1 || owners[0].seller_id !== input.seller_id) throw error;
    }
  }
  const finalLinks = await sellerWarehouseLinks(container, input.seller_id);
  if (finalLinks.length !== 1 || finalLinks[0].stock_location_id !== claim.stock_location_id) throw new OnboardingError("warehouse_conflict");
  await service.updateVendorWarehouses({ id: claim.id, state: "ready" });
  return requireSellerWarehouse(container, input.seller_id);
}

export async function reconcileVendorWarehouse(container: MedusaContainer, operationId: string) {
  const service = onboardingService(container);
  const claims = await service.listVendorWarehouses({ operation_id: operationId });
  for (const claim of claims) {
    if (claim.state === "released") continue;
    // Adoption never transfers ownership of inventory or permits its compensation.
    if (!claim.created_location) throw new OnboardingError("approval_recovery_required");
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const [{ data: levels }, { data: owners }] = await Promise.all([
      query.graph({ entity: "inventory_level", fields: ["id"], filters: { location_id: claim.stock_location_id }, pagination: { take: 1 } }, { cache: { enable: false } }),
      query.graph({ entity: "stock_location_seller", fields: ["seller_id"], filters: { stock_location_id: claim.stock_location_id } }, { cache: { enable: false } }),
    ]);
    if (levels.length || owners.some(owner => owner.seller_id !== claim.seller_id)) throw new OnboardingError("approval_recovery_required");
    const stock = container.resolve<IStockLocationService>(Modules.STOCK_LOCATION);
    const location = (await stock.listStockLocations({ id: claim.stock_location_id }))[0];
    if (location && location.metadata?.vendor_warehouse_claim !== claim.id) throw new OnboardingError("approval_recovery_required");
    if (owners.length) await container.resolve(ContainerRegistrationKeys.LINK).dismiss(locationLink(claim));
    if (location) await stock.deleteStockLocations(claim.stock_location_id);
    await service.updateVendorWarehouses({ id: claim.id, state: "released" });
  }
}
