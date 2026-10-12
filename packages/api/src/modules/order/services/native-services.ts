import { createRequire } from "node:module";
import { discoveryPath } from "@medusajs/medusa/order";

// Preserve the native internal service, including retrieveOrderVersion used by
// editing, returns and claims. Load once during module resource discovery.
const requireNativeOrder = createRequire(discoveryPath);
export const { OrderService } = requireNativeOrder("./services") as {
  OrderService: new (...args: unknown[]) => object;
};
