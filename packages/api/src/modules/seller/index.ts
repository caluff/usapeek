import path from "node:path";
import {
  Module,
  ModulesSdkUtils,
  toMikroOrmEntities,
} from "@medusajs/framework/utils";
import nativeSellerModule from "@mercurjs/core/modules/seller";
import { MercurModules } from "@mercurjs/types";
import * as models from "./models/native-models";
import { OrderGroupRepository } from "./repositories/order-group-repository";
import SellerModuleService from "./service";

const nativeMigrationsPath = path.join(
  path.dirname(require.resolve("@mercurjs/core/modules/seller")),
  "migrations",
);
const nativeModels = toMikroOrmEntities(Object.values(models));
const connectionLoader = ModulesSdkUtils.mikroOrmConnectionLoaderFactory({
  moduleName: MercurModules.SELLER,
  moduleModels: nativeModels,
  migrationsPath: nativeMigrationsPath,
});
const containerLoader = ModulesSdkUtils.moduleContainerLoaderFactory({
  moduleModels: Object.fromEntries(
    nativeModels.map((model) => [model.name, model]),
  ),
  moduleRepositories: { OrderGroupRepository },
  moduleServices: {},
});

export default {
  ...Module(MercurModules.SELLER, {
    service: SellerModuleService,
    loaders: [
      connectionLoader,
      ...(nativeSellerModule.loaders ?? []),
      containerLoader,
    ],
  }),
  runMigrations: ModulesSdkUtils.buildMigrationScript({
    moduleName: MercurModules.SELLER,
    pathToMigrations: nativeMigrationsPath,
  }),
  revertMigration: ModulesSdkUtils.buildRevertMigrationScript({
    moduleName: MercurModules.SELLER,
    pathToMigrations: nativeMigrationsPath,
  }),
  generateMigration: ModulesSdkUtils.buildGenerateMigrationScript({
    moduleName: MercurModules.SELLER,
    models: nativeModels,
    pathToMigrations: nativeMigrationsPath,
  }),
};
