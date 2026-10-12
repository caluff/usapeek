import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";

export const commissionFinancialInputSchema = z
  .object({
    type: z.enum(["percentage", "fixed"]).optional(),
    value: z.number().finite().positive().optional(),
    values: z
      .array(
        z.object({
          currency_code: z.string().min(1),
          amount: z.number().finite().positive(),
        }),
      )
      .optional(),
  })
  .passthrough()
  .superRefine((rate, context) => {
    if (
      rate.type === "percentage" &&
      rate.value !== undefined &&
      rate.value > 100
    ) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "El porcentaje debe ser mayor que cero y no superar 100.",
      });
    }
  });

export function validateCommissionFinancialInput(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  const parsed = commissionFinancialInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(
      new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "La regla de comisión debe contener importes positivos y porcentajes de hasta 100.",
      ),
    );
  }
  // The native validator retains the complete contract; the module validates the
  // merged stored rule too, including updates that omit type/value/currency.
  next();
}

export const commissionFinanceMiddlewares: MiddlewareRoute[] = [
  {
    matcher: /^\/admin\/commission-rates(?:\/[^/]+)?\/?$/,
    method: "POST",
    middlewares: [validateCommissionFinancialInput],
  },
];
