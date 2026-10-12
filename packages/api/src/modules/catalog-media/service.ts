import { MedusaService } from "@medusajs/framework/utils";
import { CatalogImage } from "./models/catalog-image";

export default class CatalogMediaService extends MedusaService({ CatalogImage }) {
  private readonly storageEnabled: boolean;
  constructor(container: Record<string, unknown>, options?: { storage_enabled?: boolean }) {
    super(container);
    this.storageEnabled = options?.storage_enabled === true;
  }
  async isStorageConfigured() { return this.storageEnabled; }
}
