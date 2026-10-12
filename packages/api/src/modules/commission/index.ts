import path from "node:path";
import {
  Module,
  ModulesSdkUtils,
  toMikroOrmEntities,
} from "@medusajs/framework/utils";
import { MercurModules } from "@mercurjs/types";
import nativeCommissionModule from "@mercurjs/core/modules/commission";
import { CommissionProviderService } from "@mercurjs/core/modules/commission/services";
import * as models from "./models/native-models";
import CommissionModuleService from "./service";

// The extension preserves Mercur's tables and migrations. A usable positive
// default must be configured explicitly; a zero-rate seed cannot permit a sale.
const nativeMigrationsPath = path.join(
  path.dirname(require.resolve("@mercurjs/core/modules/commission")),
  "migrations",
);
const nativeModels = toMikroOrmEntities(Object.values(models));
const connectionLoader = ModulesSdkUtils.mikroOrmConnectionLoaderFactory({
  moduleName: MercurModules.COMMISSION,
  moduleModels: nativeModels,
  migrationsPath: nativeMigrationsPath,
});
const containerLoader = ModulesSdkUtils.moduleContainerLoaderFactory({
  moduleModels: Object.fromEntries(
    nativeModels.map((model) => [model.name, model]),
  ),
  moduleRepositories: {},
  moduleServices: { CommissionProviderService },
});

export default {
  ...Module(MercurModules.COMMISSION, {
    service: CommissionModuleService,
    loaders: [
      connectionLoader,
      containerLoader,
      ...(nativeCommissionModule.loaders ?? []),
    ],
  }),
  runMigrations: ModulesSdkUtils.buildMigrationScript({
    moduleName: MercurModules.COMMISSION,
    pathToMigrations: nativeMigrationsPath,
  }),
  revertMigration: ModulesSdkUtils.buildRevertMigrationScript({
    moduleName: MercurModules.COMMISSION,
    pathToMigrations: nativeMigrationsPath,
  }),
  generateMigration: ModulesSdkUtils.buildGenerateMigrationScript({
    moduleName: MercurModules.COMMISSION,
    models: nativeModels,
    pathToMigrations: nativeMigrationsPath,
  }),
};
