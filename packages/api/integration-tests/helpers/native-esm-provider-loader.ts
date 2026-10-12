import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { SourceTextModule, SyntheticModule } from "node:vm";
import type { ConfigModule } from "@medusajs/framework/config";
import type { ModuleProviderExports } from "@medusajs/framework/types";
import * as medusaUtils from "@medusajs/framework/utils";
import * as mercurTypes from "@mercurjs/types";
import type { IPayoutProvider } from "@mercurjs/types";

const PROVIDER = "@mercurjs/payout-stripe-connect";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Jest cannot require this ESM provider through Medusa's dynamicImport.
 * Evaluate the installed provider unchanged, linking only its real dependencies.
 * Call after the suite's string-path/credential guards in beforeServerStart,
 * which the native integration runner invokes before migration bootstrap.
 */
export async function useNativeEsmPayoutProvider(
  configuration: Pick<ConfigModule, "modules">,
) {
  if (
    process.env.NODE_ENV !== "test" ||
    typeof SourceTextModule !== "function"
  ) {
    throw new Error(
      "The ESM provider adapter requires a Jest VM-module test process.",
    );
  }
  const candidates = Object.values(configuration.modules ?? {}).flatMap(
    (entry) => {
      if (
        !record(entry) ||
        !record(entry.options) ||
        !Array.isArray(entry.options.providers)
      )
        return [];
      return entry.options.providers.filter(
        (provider): provider is Record<string, unknown> =>
          record(provider) && provider.resolve === PROVIDER,
      );
    },
  );
  if (candidates.length !== 1) {
    throw new Error(
      "The test must configure exactly one native Stripe Connect provider.",
    );
  }
  const providerPath = require.resolve(PROVIDER);
  // Use the provider's own SDK version, matching Node's production resolution.
  const nativeStripe: unknown = createRequire(providerPath)("stripe");
  const module = new SourceTextModule(readFileSync(providerPath, "utf8"), {
    identifier: providerPath,
  });
  await module.link(async (specifier) => {
    const exports: Record<string, unknown> =
      specifier === "@medusajs/framework/utils"
        ? medusaUtils
        : specifier === "@mercurjs/types"
          ? mercurTypes
          : specifier === "stripe"
            ? { default: nativeStripe }
            : (() => {
                throw new Error(
                  `Unexpected native ESM provider dependency: ${specifier}`,
                );
              })();
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports))
        this.setExport(name, value);
    });
  });
  await module.evaluate();
  const definition = (module.namespace as { default?: unknown }).default;
  if (
    !record(definition) ||
    !Array.isArray(definition.services) ||
    definition.services.length !== 1 ||
    typeof definition.services[0] !== "function" ||
    definition.services[0].identifier !== "stripe-connect"
  ) {
    throw new Error(
      "The installed provider no longer has its expected native module contract.",
    );
  }
  // ModuleProvider.resolve officially supports ModuleProviderExports. Native
  // Medusa/Mercur loaders still validate, register and instantiate the service.
  candidates[0].resolve = definition;
  return definition as ModuleProviderExports<IPayoutProvider>;
}
