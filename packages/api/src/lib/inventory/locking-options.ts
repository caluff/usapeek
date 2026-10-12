import type { Context, DAL } from "@medusajs/framework/types";
import { FlushMode, LockMode } from "@medusajs/framework/mikro-orm/core";

export function inventoryLockOptions(options: DAL.FindOptions, context: Context = {}) {
  if (!context.transactionManager) return options;
  return {
    ...options,
    options: {
      ...options.options,
      // Native writers read before updating. Lock and refresh at that first read,
      // including when the transaction already has this entity in its identity map.
      lockMode: LockMode.PESSIMISTIC_WRITE,
      refresh: true,
      // Flush pending changes before refresh when a native caller reuses its transaction.
      flushMode: FlushMode.AUTO,
      orderBy: { id: "ASC" as const },
    },
  };
}
