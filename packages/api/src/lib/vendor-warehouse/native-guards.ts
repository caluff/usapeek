import type { MedusaRequest } from "@medusajs/framework/http";
import { OnboardingError } from "../vendor-onboarding/errors";
import { assertSellerWarehouseLocations } from "./access";

// Invoke after the existing live membership gate has resolved the seller.
export async function guardSellerWarehouse(req: MedusaRequest, sellerId: string) {
  const route = req.originalUrl.split("?")[0].replace(/\/$/, "");
  if (req.method === "OPTIONS") return;
  if (route === "/vendor/stock-locations" && req.method === "POST") throw new OnboardingError("warehouse_managed_by_application", 403);
  const match = route.match(/^\/vendor\/stock-locations\/([^/]+)(.*)$/);
  const ids: string[] = [];
  const inventoryMutation = !["GET", "HEAD"].includes(req.method) && /^\/vendor\/(?:inventory-items|inventory-adjustments|offers)(?:\/|$)/.test(route);
  const fulfillmentMutation = req.method === "POST" && /^\/vendor\/orders\/[^/]+\/fulfillments$/.test(route);
  if (match) {
    ids.push(decodeURIComponent(match[1]));
    if (!match[2] && req.method === "DELETE") throw new OnboardingError("warehouse_managed_by_application", 403);
    if (!match[2] && req.method === "POST") {
      const body = req.body as Record<string, unknown> | undefined;
      if (body && ["address", "address_id", "metadata"].some(key => key in body)) throw new OnboardingError("warehouse_address_immutable", 403);
    }
  }
  if (inventoryMutation || fulfillmentMutation) {
    const levelPath = route.match(/^\/vendor\/inventory-items\/[^/]+\/location-levels\/([^/]+)$/);
    if (levelPath && levelPath[1] !== "batch") ids.push(decodeURIComponent(levelPath[1]));
    function collect(value: unknown) {
      if (Array.isArray(value)) { value.forEach(collect); return; }
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (["location_id", "stock_location_id"].includes(key) && typeof child === "string") ids.push(child);
        else if (key !== "metadata") collect(child);
      }
    }
    collect(req.body);
  }
  if (ids.length || inventoryMutation || fulfillmentMutation) await assertSellerWarehouseLocations(req.scope, sellerId, ids);
}
