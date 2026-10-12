import { z } from "@medusajs/framework/zod";

const opaqueToken = z.string().min(1).max(1024).regex(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

export const GoogleOneTapTransactionInputSchema = z.strictObject({});
export const GoogleOneTapTransactionResponseSchema = z.strictObject({
  client_id: z.string().min(1),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  transaction_token: opaqueToken,
  expires_at: z.iso.datetime({ offset: true }),
});
export const GoogleOneTapLoginInputSchema = z.strictObject({
  id_token: z.string().min(1).max(8192).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
  transaction_token: opaqueToken,
});

export type GoogleOneTapTransactionInput = z.infer<typeof GoogleOneTapTransactionInputSchema>;
export type GoogleOneTapTransactionResponse = z.infer<typeof GoogleOneTapTransactionResponseSchema>;
export type GoogleOneTapLoginInput = z.infer<typeof GoogleOneTapLoginInputSchema>;
