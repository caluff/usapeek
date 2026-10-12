import type { Context } from "@medusajs/framework/types";
import {
  EmitEvents,
  InjectManager,
  MathBN,
  MedusaContext,
  MedusaError,
} from "@medusajs/framework/utils";
import nativeCommissionModule from "@mercurjs/core/modules/commission";
import type {
  CommissionCalculationContext,
  CommissionLineDTO,
  CreateCommissionLineDTO,
} from "@mercurjs/types";
import {
  assertCommissionRatePolicy,
  roundCommissionAmounts,
} from "../../lib/order-finance/commission-policy";
import type { ResolvedCommissionLine } from "../../lib/order-finance/commission-policy";
import { financeAmount } from "../../lib/order-finance/policy";

export const NativeCommissionService = nativeCommissionModule.service;
type NativeService = InstanceType<typeof NativeCommissionService>;
type NativeRate = Awaited<ReturnType<NativeService["retrieveCommissionRate"]>>;
type UpdateInput = Parameters<NativeService["updateCommissionRates"]>[0];
type UpdateEntry = Extract<UpdateInput, unknown[]>[number];
type RateData = Exclude<UpdateEntry, { selector: unknown }>;

function anchor(
  line: Pick<CreateCommissionLineDTO, "item_id" | "shipping_method_id">,
): string {
  if (Boolean(line.item_id) === Boolean(line.shipping_method_id)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A commission line must have exactly one anchor.",
    );
  }
  return line.item_id
    ? `item:${line.item_id}`
    : `shipping:${line.shipping_method_id}`;
}

function anchorFilters(context: CommissionCalculationContext) {
  const filters: ({ item_id: string[] } | { shipping_method_id: string[] })[] =
    [];
  if (context.items?.length)
    filters.push({ item_id: context.items.map((item) => item.id) });
  if (context.shipping_methods?.length)
    filters.push({
      shipping_method_id: context.shipping_methods.map((method) => method.id),
    });
  return filters;
}

function uniqueLines<
  T extends Pick<CreateCommissionLineDTO, "item_id" | "shipping_method_id">,
>(lines: T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const line of lines) {
    const key = anchor(line);
    if (result.has(key)) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "Duplicate commission anchors require reconciliation.",
      );
    }
    result.set(key, line);
  }
  return result;
}

export default class CommissionModuleService extends NativeCommissionService {
  override async createCommissionRates(
    data: unknown,
    sharedContext: Context = {},
  ) {
    const entries: unknown[] = Array.isArray(data) ? data : [data];
    entries.forEach(assertCommissionRatePolicy);
    return super.createCommissionRates(data, sharedContext);
  }

  override updateCommissionRates: NativeService["updateCommissionRates"] =
    this.updateRates.bind(this);

  private async updateRates(
    data: RateData,
    sharedContext?: Context,
  ): Promise<NativeRate>;
  private async updateRates(
    data: UpdateInput,
    sharedContext?: Context,
  ): Promise<NativeRate[]>;
  @InjectManager()
  @EmitEvents()
  private async updateRates(
    data: RateData | UpdateInput,
    @MedusaContext() sharedContext: Context = {},
  ): Promise<NativeRate | NativeRate[]> {
    return this.withTransaction(
      sharedContext,
      "serializable",
      async (context) => {
        const entries = Array.isArray(data) ? data : [data];
        const updatedIds = new Set<string>();
        for (const entry of entries) {
          const selector =
            "selector" in entry ? entry.selector : { id: entry.id };
          if (!("selector" in entry) && !entry.id) {
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              "A commission rate update requires an id.",
            );
          }
          const updates = "selector" in entry ? entry.data : entry;
          if (Array.isArray(updates)) {
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              "A selector update requires one unambiguous rate update.",
            );
          }
          const rates = await this.listCommissionRates(
            selector,
            { relations: ["values", "rules"] },
            context,
          );
          if (!("selector" in entry) && !rates.length) {
            throw new MedusaError(
              MedusaError.Types.NOT_FOUND,
              "The commission rate was not found.",
            );
          }
          for (const rate of rates) {
            if (updatedIds.has(rate.id)) {
              throw new MedusaError(
                MedusaError.Types.INVALID_DATA,
                "A commission rate cannot be updated more than once in the same batch.",
              );
            }
            updatedIds.add(rate.id);
            assertCommissionRatePolicy({ ...rate, ...updates });
          }
        }
        return Array.isArray(data) || "selector" in data
          ? super.updateCommissionRates(data as UpdateInput, context)
          : super.updateCommissionRates(data, context);
      },
    );
  }

  async calculateOriginalLines(
    context: CommissionCalculationContext,
    sharedContext: Context = {},
  ): Promise<ResolvedCommissionLine[]> {
    return this.withTransaction(
      sharedContext,
      "repeatable read",
      async (transactionContext) => {
        const lines = await super.getCommissionLines(
          context,
          transactionContext,
        );
        const byAnchor = uniqueLines(lines);
        if (lines.some((line) => !line.commission_rate_id || line.provider_id !== "system"))
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "An original financial sale requires a verifiable system commission rule.",
          );
        for (const item of context.items ?? []) {
          if (!byAnchor.has(`item:${item.id}`)) {
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              "Every sale item requires an applicable positive commission rule.",
            );
          }
        }
        const rates = await this.listCommissionRates(
          { id: [...new Set(lines.flatMap((line) => line.commission_rate_id ? [line.commission_rate_id] : []))] },
          { relations: ["rules", "values"] },
          transactionContext,
        );
        const rateById = new Map(rates.map((rate) => [rate.id, rate]));
        const resolved = lines.map((line) => {
          const rate = line.commission_rate_id ? rateById.get(line.commission_rate_id) : undefined;
          if (!rate)
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              "The resolved commission rule is unavailable.",
            );
          assertCommissionRatePolicy(rate);
          const source = line.item_id
            ? context.items?.find((item) => item.id === line.item_id)
            : context.shipping_methods?.find(
                (method) => method.id === line.shipping_method_id,
              );
          if (!source)
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              "The commission line has no sale component.",
            );
          const base = rate.include_tax
            ? MathBN.add(source.subtotal, source.tax_total ?? 0)
            : MathBN.convert(source.subtotal);
          if (!base.isFinite() || base.isNegative())
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              "The commission base must be finite and non-negative.",
            );
          if (
            rate.type === "fixed" &&
            !rate.values?.some(
              (value) => value.currency_code === context.currency_code,
            ) &&
            rate.currency_code !== context.currency_code
          ) {
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              "The fixed commission has no amount for the sale currency.",
            );
          }
          const raw =
            rate.type === "percentage"
              ? MathBN.div(MathBN.mult(base, line.rate), 100)
              : MathBN.convert(line.rate);
          if (!raw.isFinite() || raw.isNegative()) {
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              "The commission amount must be finite and non-negative.",
            );
          }
          return {
            line,
            base: base.toNumber(),
            type: rate.type,
            include_tax: rate.include_tax,
            include_shipping: rate.include_shipping,
            rules: (rate.rules ?? []).map((rule) => ({
              reference: rule.reference,
              reference_id: rule.reference_id,
            })),
            unrounded_amount: raw.toString(),
          };
        });
        const amounts = roundCommissionAmounts(
          resolved.map((value) => ({
            anchor: anchor(value.line),
            amount: value.unrounded_amount,
          })),
        );
        return resolved.map((value, index) => ({
          ...value,
          line: { ...value.line, amount: amounts[index] },
        }));
      },
    );
  }

  override async getCommissionLines(
    context: CommissionCalculationContext,
    sharedContext: Context = {},
  ): Promise<CreateCommissionLineDTO[]> {
    const filters = anchorFilters(context);
    if (!filters.length) return [];
    const existing = await this.listCommissionLines(
      { $or: filters },
      {},
      sharedContext,
    );
    if (!existing.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Commission refresh cannot reconstruct a sale without original commission lines.",
      );
    }
    const byAnchor = uniqueLines(existing);
    if (
      (context.items ?? []).some((item) => !byAnchor.has(`item:${item.id}`))
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "An existing sale's commission composition cannot be changed.",
      );
    }
    return existing.map((line) => {
      if (!line.commission_rate_id) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Historical commission lines without an original rule require reconciliation.",
        );
      }
      return {
        item_id: line.item_id,
        shipping_method_id: line.shipping_method_id,
        commission_rate_id: line.commission_rate_id,
        code: line.code,
        rate: line.rate,
        amount: line.amount,
        description: line.description,
        provider_id: line.provider_id ?? "system",
        data: line.data,
      };
    });
  }

  @InjectManager()
  @EmitEvents()
  override async upsertCommissionLines(
    lines: CreateCommissionLineDTO[],
    @MedusaContext() sharedContext: Context = {},
  ): Promise<CommissionLineDTO[]> {
    uniqueLines(lines);
    for (const line of lines) {
      const amount = MathBN.convert(line.amount);
      if (
        !amount.isFinite() ||
        amount.isNegative() ||
        !MathBN.eq(amount, amount.decimalPlaces(2, 4)) ||
        !Number.isFinite(line.rate) ||
        line.rate <= 0
      ) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Persisted commission lines must have positive rates and exact non-negative currency amounts.",
        );
      }
      financeAmount(line.amount);
    }
    if (!lines.length) return [];
    return this.withTransaction(
      sharedContext,
      "serializable",
      async (context) => {
        const filters = anchorFilters({
          currency_code: "usd",
          items: lines.flatMap((line) =>
            line.item_id ? [{ id: line.item_id, subtotal: 0 }] : [],
          ),
          shipping_methods: lines.flatMap((line) =>
            line.shipping_method_id
              ? [{ id: line.shipping_method_id, subtotal: 0 }]
              : [],
          ),
        });
        const existing = await this.listCommissionLines(
          { $or: filters },
          {},
          context,
        );
        const byAnchor = uniqueLines<CommissionLineDTO>(existing);
        const missing = lines.filter((line) => !byAnchor.has(anchor(line)));
        if (missing.length) {
          const created = await this.commissionLineService_.create(
            missing,
            context,
          );
          const serialized =
            await this.baseRepository_.serialize<CommissionLineDTO[]>(created);
          for (const line of serialized) byAnchor.set(anchor(line), line);
        }
        return lines.map((line) => byAnchor.get(anchor(line))!);
      },
    );
  }

  private async withTransaction<T>(
    context: Context,
    isolationLevel: "repeatable read" | "serializable",
    operation: (context: Context) => Promise<T>,
  ): Promise<T> {
    if (context.transactionManager) {
      if (
        context.isolationLevel !== "serializable" &&
        context.isolationLevel !== isolationLevel
      ) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Commission operations require an explicit consistent transaction isolation level.",
        );
      }
      return operation(context);
    }
    return this.baseRepository_.transaction(
      async (transactionManager) =>
        operation({ ...context, transactionManager, isolationLevel }),
      { isolationLevel },
    );
  }
}
