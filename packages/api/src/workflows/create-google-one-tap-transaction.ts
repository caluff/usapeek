import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import type { GoogleOneTapTransactionInput } from "../lib/google-one-tap/contracts";
import { createGoogleOneTapTransactionStep } from "./steps/create-google-one-tap-transaction";

export const createGoogleOneTapTransactionWorkflow = createWorkflow("create-google-one-tap-transaction", function (input: GoogleOneTapTransactionInput) {
  return new WorkflowResponse(createGoogleOneTapTransactionStep(input));
});
