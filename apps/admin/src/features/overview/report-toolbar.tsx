"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  OVERVIEW_REPORT_PERIODS,
  overviewReportHref,
  type OverviewReportFilters,
} from "./report-filters";

export function OverviewReportToolbar({
  period,
}: {
  period: OverviewReportFilters["period"];
}) {
  const id = useId();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function update(filters: Pick<OverviewReportFilters, "period">) {
    startTransition(() =>
      router.push(overviewReportHref(filters), { scroll: false }),
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3" aria-busy={isPending}>
      <div className="w-44">
        <label htmlFor={`${id}-period`} className="sr-only">
          Período
        </label>
        <NativeSelect
          id={`${id}-period`}
          value={period}
          disabled={isPending}
          className="h-8 py-1"
          onChange={(event) => {
            const selected = OVERVIEW_REPORT_PERIODS.find(
              (option) => option.value === event.target.value,
            );
            if (selected) update({ period: selected.value });
          }}
        >
          {OVERVIEW_REPORT_PERIODS.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
