import type { ConfigModule } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { getGoogleAuthConfiguration } from "../../lib/google-auth-configuration";
import type { GoogleOneTapTransactionInput } from "../../lib/google-one-tap/contracts";
import { createGoogleOneTapTransaction, invalidGoogleOneTap } from "../../lib/google-one-tap/transaction";

export const createGoogleOneTapTransactionStep = createStep("create-google-one-tap-transaction", async (_: GoogleOneTapTransactionInput, { container }) => {
  const google = getGoogleAuthConfiguration();
  const { projectConfig: { http } } = container.resolve<ConfigModule>(ContainerRegistrationKeys.CONFIG_MODULE);
  if (!google || typeof http.jwtSecret !== "string") throw invalidGoogleOneTap();
  return new StepResponse(createGoogleOneTapTransaction(google.clientId, http.jwtSecret));
});
