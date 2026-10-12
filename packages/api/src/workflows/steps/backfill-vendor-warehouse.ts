import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { onboardingService } from "../../lib/vendor-onboarding/access";
import { validateCompleteData, canonicalHash } from "../../lib/vendor-onboarding/validation";
import { requireSellerWarehouse, sellerWarehouseLinks } from "../../lib/vendor-warehouse/access";
import { provisionVendorWarehouse } from "./provision-vendor-warehouse";

export type BackfillWarehouseInput = { seller_id: string; dry_run: boolean };

export const backfillVendorWarehouseStep = createStep("backfill-vendor-warehouse", async (input: BackfillWarehouseInput, { container }) => {
  const { data: sellers } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "seller", fields: ["id"], filters: { id: input.seller_id } }, { cache: { enable: false } });
  const links = await sellerWarehouseLinks(container, input.seller_id);
  const result = (status: string, reason: string | null = null, stockLocationId: string | null = null) => ({ seller_id: input.seller_id, dry_run: input.dry_run, status, reason, stock_location_id: stockLocationId });
  if (sellers.length !== 1) return new StepResponse(result("conflict", "seller_not_found"));
  if (links.length > 1) return new StepResponse(result("conflict", "multiple_warehouses"));
  const service = onboardingService(container);
  const [application] = await service.listVendorApplications({ seller_id: input.seller_id, status: "approved", approval_state: "complete" });
  if (!application?.approval_operation_id) return new StepResponse(result("conflict", "approved_application_required"));
  try { validateCompleteData(application.submitted_data); }
  catch { return new StepResponse(result("conflict", "approved_address_invalid")); }
  const claims = await service.listVendorWarehouses({ seller_id: input.seller_id });
  if (claims[0]?.state === "ready") {
    try { return new StepResponse(result("ready", null, await requireSellerWarehouse(container, input.seller_id))); }
    catch { return new StepResponse(result("conflict", "warehouse_link_conflict")); }
  }
  if (claims[0]?.state === "released") return new StepResponse(result("conflict", "warehouse_claim_released"));
  if (links.length) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const [{ data: locations }, { data: owners }] = await Promise.all([
      query.graph({ entity: "stock_location", fields: ["id", "address.*"], filters: { id: links[0].stock_location_id } }, { cache: { enable: false } }),
      query.graph({ entity: "stock_location_seller", fields: ["seller_id"], filters: { stock_location_id: links[0].stock_location_id } }, { cache: { enable: false } }),
    ]);
    if (locations.length !== 1 || owners.length !== 1 || owners[0].seller_id !== input.seller_id) return new StepResponse(result("conflict", "warehouse_link_conflict"));
    const data = validateCompleteData(application.submitted_data);
    const expected = { ...data.activity.business_address, phone: data.responsible.phone };
    const actual = Object.fromEntries(Object.keys(expected).map(key => [key, locations[0].address?.[key] ?? ""]));
    if (canonicalHash(actual) !== canonicalHash(expected)) return new StepResponse(result("conflict", "warehouse_address_conflict"));
  }
  if (input.dry_run) return new StepResponse(result(links.length ? "would_adopt" : "would_create", null, links[0]?.stock_location_id));
  const id = await provisionVendorWarehouse(container, { seller_id: input.seller_id, application_id: application.id, operation_id: application.approval_operation_id });
  return new StepResponse(result("ready", null, id));
});
