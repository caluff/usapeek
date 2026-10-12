import { z } from "@medusajs/framework/zod";

export const RequestAccountEmailVerification = z.strictObject({});
export const ConfirmAccountEmailVerification = z.strictObject({ code: z.string().trim().min(1).max(512) });
export type RequestAccountEmailVerificationInput = z.infer<typeof RequestAccountEmailVerification>;
export type ConfirmAccountEmailVerificationInput = z.infer<typeof ConfirmAccountEmailVerification>;
