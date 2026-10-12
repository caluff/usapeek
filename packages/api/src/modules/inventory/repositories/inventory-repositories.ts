import type { Context, DAL } from "@medusajs/framework/types";
import { mikroOrmBaseRepositoryFactory } from "@medusajs/framework/utils";
import { InventoryLevelRepository as NativeInventoryLevelRepository } from "@medusajs/inventory/dist/repositories";
import { ReservationItem } from "@medusajs/inventory/dist/models";
import { inventoryLockOptions } from "../../../lib/inventory/locking-options";

export { MikroOrmBaseRepository as BaseRepository } from "@medusajs/framework/utils";

export class InventoryLevelRepository extends NativeInventoryLevelRepository {
  override find(options: DAL.FindOptions = { where: {} }, context: Context = {}) {
    return super.find(inventoryLockOptions(options, context), context);
  }
}

export class ReservationItemRepository extends mikroOrmBaseRepositoryFactory(ReservationItem) {
  override find(options: DAL.FindOptions = { where: {} }, context: Context = {}) {
    return super.find(inventoryLockOptions(options, context), context);
  }
}
