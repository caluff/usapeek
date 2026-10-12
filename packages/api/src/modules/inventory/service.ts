import type { Context, InventoryLevelDTO } from "@medusajs/framework/types";
import { EmitEvents, InjectManager, InjectTransactionManager, MathBN, MedusaContext, MedusaError } from "@medusajs/framework/utils";
import nativeInventoryModule from "@medusajs/medusa/inventory";
import type { VendorInventoryAdjustment } from "../../lib/inventory/validation";

export default class InventoryModuleService extends nativeInventoryModule.service {
  @InjectManager()
  @EmitEvents()
  async compareAndSetInventory(input: VendorInventoryAdjustment, @MedusaContext() context: Context = {}): Promise<InventoryLevelDTO> {
    const level = await this.compareAndSetInventory_(input, context);
    return this.baseRepository_.serialize(level);
  }

  @InjectTransactionManager()
  protected async compareAndSetInventory_(input: VendorInventoryAdjustment, @MedusaContext() context: Context = {}) {
    const [level] = await this.inventoryLevelService_.list({
      inventory_item_id: input.inventory_item_id,
      location_id: input.location_id,
    }, {}, context);
    if (!level) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Inventory level not found.");
    if (!MathBN.eq(level.stocked_quantity, input.expected_quantity)) {
      throw new MedusaError(MedusaError.Types.CONFLICT, "Las existencias cambiaron. Actualiza la página antes de volver a guardar.");
    }
    if (MathBN.lt(input.stocked_quantity, level.reserved_quantity)) {
      throw new MedusaError(MedusaError.Types.CONFLICT, "Las existencias no pueden ser menores que la cantidad reservada.");
    }
    // Keep native mutation hooks and event aggregation inside the same transaction.
    await this.updateInventoryLevels_([{
      inventory_item_id: input.inventory_item_id,
      location_id: input.location_id,
      stocked_quantity: input.stocked_quantity,
    }], context);
    // Refresh the native computed available quantity after flushing the update.
    const [updated] = await this.inventoryLevelService_.list({ id: level.id }, {}, context);
    return updated;
  }
}
