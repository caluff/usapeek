import type { AuthContext } from "@medusajs/framework/http";
import type { OrderPreviewDTO } from "@medusajs/framework/types";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { authorizeOrderTrackingClaim, prepareOrderTrackingClaim, readOrderTrackingTransferToken, resolveOrderTrackingClaimLock, type AuthorizedOrderTrackingClaim, type PreparedOrderTrackingClaim } from "../../lib/order-tracking/claim";

export const prepareOrderTrackingClaimStep = createStep("prepare-order-tracking-claim", async (input: { token: string; auth_context: AuthContext }) => {
  return new StepResponse(prepareOrderTrackingClaim(input.token, input.auth_context));
});

export const resolveOrderTrackingClaimLockStep = createStep("resolve-order-tracking-claim-lock", async (input: PreparedOrderTrackingClaim, { container }) => {
  // Generate the owner once in a persisted step output. A transform may be
  // resolved concurrently by multiple references and must remain pure.
  return new StepResponse(await resolveOrderTrackingClaimLock(container, input));
});

export const authorizeOrderTrackingClaimStep = createStep("authorize-order-tracking-claim", async (input: PreparedOrderTrackingClaim, { container }) => {
  return new StepResponse(await authorizeOrderTrackingClaim(container, input));
});

export const readOrderTrackingTransferTokenStep = createStep("read-order-tracking-transfer-token", async (input: { claim: AuthorizedOrderTrackingClaim; requested: OrderPreviewDTO }, { container }) => {
  return new StepResponse(await readOrderTrackingTransferToken(container, input.claim));
});
