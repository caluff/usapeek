"use client";

import type { FinanceReportingPeriod } from "@usapeek/api/finance-contracts";
import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { FINANCE_PERIODS, financePeriodHref } from "./periods";

export function FinanceReportToolbar({
  period,
  basePath = "/seller",
  hideLabel = false,
}: {
  period: FinanceReportingPeriod;
  basePath?: "/seller" | "/seller/settlements/paid";
  hideLabel?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <label
          htmlFor={id}
          className={
            hideLabel
              ? "sr-only"
              : "sr-only text-sm text-muted-foreground sm:not-sr-only"
          }
        >
          Período
        </label>
        <div className="w-44 min-w-0">
          <NativeSelect
            id={id}
            value={period}
            disabled={isPending}
            aria-busy={isPending}
            className="h-8 py-1"
            onChange={(event) => {
              const selected = FINANCE_PERIODS.find(
                (option) => option.value === event.target.value,
              );
              if (selected)
                startTransition(() =>
                  router.push(financePeriodHref(selected.value, 1, basePath), {
                    scroll: false,
                  }),
                );
            }}
          >
            {FINANCE_PERIODS.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
    </div>
  );
}
