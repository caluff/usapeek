import { createRequire } from "node:module";
import { MikroOrmBaseRepository } from "@medusajs/framework/utils";
import { discoveryPath } from "@medusajs/medusa/order";

// These native repositories are not re-exported by the public Medusa entry.
// Resolve them once from its published discovery path during module loading.
// In particular, OrderRepository must retain its current-version filtering.
const requireNativeOrder = createRequire(discoveryPath);
type RepositoryConstructor = new (...args: unknown[]) => object;
const nativeRepositories = requireNativeOrder("./repositories") as Record<
  "OrderRepository" | "OrderClaimRepository" | "ReturnRepository",
  RepositoryConstructor
>;
const nativeExchange = requireNativeOrder("./repositories/exchange") as {
  OrderExchangeRepository: RepositoryConstructor;
};

export const BaseRepository = MikroOrmBaseRepository;
export const { OrderRepository, OrderClaimRepository, ReturnRepository } =
  nativeRepositories;
export const { OrderExchangeRepository } = nativeExchange;
