import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import {
  createRegionsWorkflow,
  updateRegionsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/core-flows";

const STRIPE_PROVIDER_ID = "pp_stripe_stripe";

export default async function configureStorefrontRegion({ container, args }: ExecArgs) {
  const [mode = "dry-run"] = args;
  if (args.length > 1 || !["dry-run", "apply"].includes(mode)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_ARGUMENT,
      "Usage: medusa exec ./src/scripts/configure-storefront-region.ts [dry-run|apply]",
    );
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const [regionResult, storeResult, providerResult] = await Promise.all([
    query.graph({
      entity: "region",
      fields: ["id", "name", "currency_code", "countries.iso_2", "payment_providers.id"],
    }, { cache: { enable: false } }),
    query.graph({
      entity: "store",
      fields: ["id", "supported_currencies.currency_code", "supported_currencies.is_default"],
    }, { cache: { enable: false } }),
    query.graph({
      entity: "payment_provider",
      fields: ["id", "is_enabled"],
      filters: { id: STRIPE_PROVIDER_ID },
    }, { cache: { enable: false } }),
  ]);

  const usRegions = regionResult.data.filter((region) =>
    region.countries?.some((country) => country?.iso_2 === "us"),
  );
  if (usRegions.length > 1 || usRegions.some((region) => region.currency_code !== "usd")) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The existing United States region configuration conflicts with USD checkout. No changes were made.",
    );
  }
  if (storeResult.data.length !== 1) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Exactly one existing store is required. No changes were made.",
    );
  }

  const store = storeResult.data[0];
  const existingRegion = usRegions[0];
  const stripeEnabled = providerResult.data.some((provider) => provider.is_enabled);
  const existingProviderIds = existingRegion?.payment_providers?.flatMap((provider) =>
    provider?.id ? [provider.id] : [],
  ) ?? [];
  const attachStripe = stripeEnabled && !existingProviderIds.includes(STRIPE_PROVIDER_ID);
  const currencies = store.supported_currencies?.flatMap((currency) =>
    currency ? [{ currency_code: currency.currency_code, is_default: currency.is_default }] : [],
  ) ?? [];
  const addUsd = !currencies.some((currency) => currency.currency_code === "usd");

  logger.info(JSON.stringify({
    mode,
    region_id: existingRegion?.id ?? null,
    create_usd_region: !existingRegion,
    add_usd_to_store: addUsd,
    stripe_provider_enabled: stripeEnabled,
    attach_stripe: attachStripe,
  }));
  if (mode === "dry-run") return;

  if (addUsd) {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
          supported_currencies: [
            ...currencies,
            { currency_code: "usd", is_default: !currencies.some((currency) => currency.is_default) },
          ],
        },
      },
    });
  }

  let regionId = existingRegion?.id;
  if (!existingRegion) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [{
          name: "United States",
          currency_code: "usd",
          countries: ["us"],
          payment_providers: stripeEnabled ? [STRIPE_PROVIDER_ID] : [],
        }],
      },
    });
    regionId = result[0].id;
  } else if (attachStripe) {
    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: existingRegion.id },
        update: { payment_providers: [...existingProviderIds, STRIPE_PROVIDER_ID] },
      },
    });
  }

  logger.info(JSON.stringify({ region_id: regionId, currency_code: "usd", country_code: "us" }));
  if (!stripeEnabled) {
    logger.warn("Stripe is not registered and enabled. Configure its environment and rerun this script to enable checkout for the region.");
  }
}
