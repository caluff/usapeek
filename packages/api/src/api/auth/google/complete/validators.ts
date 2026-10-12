import { z } from "@medusajs/framework/zod";

export const CompleteGoogleAuth = z.object({
  actor_type: z.enum(["customer", "user", "member"]),
  existing_token: z.string().min(1).max(16_384).optional(),
});
export type CompleteGoogleAuthInput = z.infer<typeof CompleteGoogleAuth>;
