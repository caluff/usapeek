import { MedusaError } from "@medusajs/framework/utils";

export type AlgoliaOptions = {
  appId: string;
  apiKey: string;
  productIndex: string;
};

export function getAlgoliaConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): AlgoliaOptions | null {
  const appId = env.ALGOLIA_APP_ID?.trim();
  const apiKey = env.ALGOLIA_API_KEY?.trim();
  const productIndex = env.ALGOLIA_PRODUCT_INDEX?.trim();
  // The rest of the store remains available while the private key is being provisioned.
  if (!apiKey) return null;
  if (!appId || !productIndex || !/^[a-zA-Z0-9_-]+$/.test(productIndex)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Algolia requires ALGOLIA_APP_ID and an alphanumeric ALGOLIA_PRODUCT_INDEX (hyphens/underscores allowed).",
    );
  }
  return { appId, apiKey, productIndex };
}
