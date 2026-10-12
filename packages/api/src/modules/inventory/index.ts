import path from "node:path";
import { Module, Modules, ModulesSdkUtils, toMikroOrmEntities } from "@medusajs/framework/utils";
import * as models from "./models/native-models";
import InventoryModuleService from "./service";

// Reuse the native schema and migration history; this extension adds no tables.
const nativeMigrationsPath = path.join(path.dirname(require.resolve("@medusajs/inventory")), "migrations");
const nativeModels = toMikroOrmEntities(Object.values(models));
const connectionLoader = ModulesSdkUtils.mikroOrmConnectionLoaderFactory({
  moduleName: Modules.INVENTORY,
  moduleModels: nativeModels,
  migrationsPath: nativeMigrationsPath,
});

export default {
  ...Module(Modules.INVENTORY, { service: InventoryModuleService, loaders: [connectionLoader] }),
  // The CLI builds migration scripts separately from the runtime loader.
  runMigrations: ModulesSdkUtils.buildMigrationScript({ moduleName: Modules.INVENTORY, pathToMigrations: nativeMigrationsPath }),
  revertMigration: ModulesSdkUtils.buildRevertMigrationScript({ moduleName: Modules.INVENTORY, pathToMigrations: nativeMigrationsPath }),
  generateMigration: ModulesSdkUtils.buildGenerateMigrationScript({ moduleName: Modules.INVENTORY, models: nativeModels, pathToMigrations: nativeMigrationsPath }),
};
