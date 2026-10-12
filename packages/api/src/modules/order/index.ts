import path from "node:path";
import {
  Module,
  Modules,
  ModulesSdkUtils,
  toMikroOrmEntities,
} from "@medusajs/framework/utils";
import nativeOrderModule, { discoveryPath } from "@medusajs/medusa/order";
import * as models from "./models/native-models";
import * as repositories from "./repositories/order-repositories";
import { OrderService } from "./services/native-services";
import OrderModuleService from "./service";

const nativeMigrationsPath = path.join(
  path.dirname(discoveryPath),
  "migrations",
);
const nativeModels = toMikroOrmEntities(Object.values(models));
const connectionLoader = ModulesSdkUtils.mikroOrmConnectionLoaderFactory({
  moduleName: Modules.ORDER,
  moduleModels: nativeModels,
  migrationsPath: nativeMigrationsPath,
});
// Register native resources explicitly: discovery can silently replace a
// repository with a generic one when an import fails in another runtime.
const containerLoader = ModulesSdkUtils.moduleContainerLoaderFactory({
  moduleModels: Object.fromEntries(
    nativeModels.map((model) => [model.name, model]),
  ),
  moduleRepositories: repositories,
  moduleServices: { OrderService },
});

export default {
  ...Module(Modules.ORDER, {
    service: OrderModuleService,
    loaders: [
      connectionLoader,
      ...(nativeOrderModule.loaders ?? []),
      containerLoader,
    ],
  }),
  runMigrations: ModulesSdkUtils.buildMigrationScript({
    moduleName: Modules.ORDER,
    pathToMigrations: nativeMigrationsPath,
  }),
  revertMigration: ModulesSdkUtils.buildRevertMigrationScript({
    moduleName: Modules.ORDER,
    pathToMigrations: nativeMigrationsPath,
  }),
  generateMigration: ModulesSdkUtils.buildGenerateMigrationScript({
    moduleName: Modules.ORDER,
    models: nativeModels,
    pathToMigrations: nativeMigrationsPath,
  }),
};
