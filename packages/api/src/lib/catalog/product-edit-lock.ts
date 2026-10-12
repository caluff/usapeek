import { randomUUID } from "node:crypto";

export function catalogProductEditLock(productId: string) {
  return {
    key: `catalog-product-edit:${productId}`,
    ownerId: randomUUID(),
    timeout: 30,
    ttl: 120,
    executeOnSubWorkflow: true,
  };
}
