import { z } from "@medusajs/framework/zod";

export const ConsumeVendorSession = z.object({ code: z.string().regex(/^[a-f0-9]{64}$/) });
export type ConsumeVendorSessionInput = z.infer<typeof ConsumeVendorSession>;
