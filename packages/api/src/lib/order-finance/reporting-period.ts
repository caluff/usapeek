import {
  FINANCE_REPORTING_PERIODS,
  type FinanceReportingPeriod,
} from "./contracts";
import { MedusaError } from "@medusajs/framework/utils";

export const FINANCE_REPORTING_TIME_ZONE = "America/Montevideo";

export type FinanceReportingWindow = {
  period: FinanceReportingPeriod;
  time_zone: string;
  start_at: string;
  end_at: string;
  cutoff_at: string;
  generated_at: string;
};

type CalendarDate = { year: number; month: number; day: number };

function dateKey(date: CalendarDate): string {
  return [date.year, date.month, date.day]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

function calendarDateAt(instant: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = new Map(parts.map(({ type, value }) => [type, value]));
  const year = Number(values.get("year"));
  const month = Number(values.get("month"));
  const day = Number(values.get("day"));
  if (![year, month, day].every(Number.isInteger)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Could not determine the reporting calendar date.");
  }
  return { year, month, day };
}

function shiftCalendarDate(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function startOfCalendarDate(date: CalendarDate, timeZone: string): Date {
  const target = dateKey(date);
  const utcMidnight = Date.UTC(date.year, date.month - 1, date.day);
  let lower = utcMidnight - 36 * 60 * 60 * 1000;
  let upper = utcMidnight + 36 * 60 * 60 * 1000;

  // Find the first instant whose local date is the target date. This also
  // handles zones where a clock change makes local midnight nonexistent.
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (dateKey(calendarDateAt(new Date(middle), timeZone)) < target) {
      lower = middle;
    } else {
      upper = middle;
    }
  }

  const start = new Date(upper);
  if (dateKey(calendarDateAt(start, timeZone)) !== target) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Calendar date ${target} does not exist in ${timeZone}.`);
  }
  return start;
}

export function resolveFinanceReportingWindow(
  period: FinanceReportingPeriod,
  generatedAt: Date = new Date(),
  timeZone = FINANCE_REPORTING_TIME_ZONE,
): FinanceReportingWindow {
  if (!FINANCE_REPORTING_PERIODS.includes(period)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Unsupported finance reporting period.");
  }
  if (!Number.isFinite(generatedAt.getTime())) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "A valid reporting generation instant is required.");
  }

  const currentDate = calendarDateAt(generatedAt, timeZone);
  const startDate =
    period === "current_month"
      ? { ...currentDate, day: 1 }
      : period === "last_7_days"
        ? shiftCalendarDate(currentDate, -6)
        : period === "last_30_days"
          ? shiftCalendarDate(currentDate, -29)
          : currentDate;
  const startAt = startOfCalendarDate(startDate, timeZone).toISOString();
  const instant = generatedAt.toISOString();

  return {
    period,
    time_zone: timeZone,
    start_at: startAt,
    end_at: instant,
    cutoff_at: instant,
    generated_at: instant,
  };
}
