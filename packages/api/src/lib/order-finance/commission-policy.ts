import type { BigNumberInput } from "@medusajs/framework/types";
import { BigNumber, MathBN, MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import type { CreateCommissionLineDTO } from "@mercurjs/types";
import { financeAmount } from "./policy";

export type ResolvedCommissionLine = {
  line: CreateCommissionLineDTO;
  base: number;
  type: "percentage" | "fixed";
  include_tax: boolean;
  include_shipping: boolean;
  rules: { reference: string; reference_id: string }[];
  unrounded_amount: string;
};

const amount = z
  .union([
    z.number().finite(),
    z.string().regex(/^-?\d+(?:\.\d+)?$/),
    z.instanceof(BigNumber),
    z.object({ value: z.string(), precision: z.number() }),
  ])
  .refine((value) => {
    try {
      return MathBN.convert(value).isFinite();
    } catch {
      return false;
    }
  }, "The amount must be finite.");

export const commissionRatePolicySchema = z
  .object({
    type: z.enum(["percentage", "fixed"]),
    value: amount,
    currency_code: z.string().trim().min(1).nullish(),
    values: z
      .array(
        z.object({
          currency_code: z.string().trim().min(1),
          amount,
        }),
      )
      .optional(),
  })
  .superRefine((rate, ctx) => {
    if (!MathBN.gt(rate.value, 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Commission rates must be greater than zero.",
      });
    }
    if (rate.type === "percentage" && MathBN.gt(rate.value, 100)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Percentage commissions cannot exceed 100%.",
      });
    }
    if (rate.type === "fixed") {
      if (!rate.currency_code && !rate.values?.length) {
        ctx.addIssue({
          code: "custom",
          path: ["currency_code"],
          message: "Fixed commissions require an explicit currency amount.",
        });
      }
      if (
        !MathBN.eq(rate.value, MathBN.convert(rate.value).decimalPlaces(2, 4))
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "Fixed commissions must use currency precision.",
        });
      }
    }
    const currencies = new Set<string>();
    for (const [index, entry] of (rate.values ?? []).entries()) {
      if (currencies.has(entry.currency_code)) {
        ctx.addIssue({
          code: "custom",
          path: ["values", index, "currency_code"],
          message: "Currency amounts must be unique.",
        });
      }
      currencies.add(entry.currency_code);
      if (
        !MathBN.gt(entry.amount, 0) ||
        !MathBN.eq(
          entry.amount,
          MathBN.convert(entry.amount).decimalPlaces(2, 4),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["values", index, "amount"],
          message:
            "Fixed currency amounts must be positive and use currency precision.",
        });
      }
    }
  });

export function assertCommissionRatePolicy(input: unknown): void {
  const result = commissionRatePolicySchema.safeParse(input);
  if (!result.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      result.error.issues.map((issue) => issue.message).join(" "),
    );
  }
}

// Medusa stores display units. Quantize their sum once, then assign remaining
// cents by largest remainder so line-level rounding cannot create/destroy money.
export function roundCommissionAmounts(
  lines: { anchor: string; amount: BigNumberInput }[],
): number[] {
  if (!lines.length) return [];
  const anchors = new Set<string>();
  const values = lines.map((line) => {
    const value = MathBN.convert(line.amount);
    if (!value.isFinite() || value.isNegative() || anchors.has(line.anchor)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Commission amounts must be finite, non-negative, and have unique anchors.",
      );
    }
    anchors.add(line.anchor);
    return value;
  });
  const target = MathBN.sum(...values).decimalPlaces(2, 4);
  const rounded = values.map((value) => value.decimalPlaces(2, 1));
  const remaining = MathBN.div(
    MathBN.sub(target, MathBN.sum(...rounded)),
    "0.01",
  ).toNumber();
  if (
    !Number.isSafeInteger(remaining) ||
    remaining < 0 ||
    remaining > lines.length
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The commission rounding allocation is invalid.",
    );
  }
  const ranked = values
    .map((value, index) => ({
      index,
      anchor: lines[index].anchor,
      remainder: MathBN.sub(value, rounded[index]),
    }))
    .sort(
      (left, right) =>
        right.remainder.comparedTo(left.remainder) ||
        (left.anchor < right.anchor ? -1 : left.anchor > right.anchor ? 1 : 0),
    );
  for (const { index } of ranked.slice(0, remaining)) {
    rounded[index] = MathBN.add(rounded[index], "0.01");
  }
  return rounded.map((value) => financeAmount(value.toNumber()));
}
