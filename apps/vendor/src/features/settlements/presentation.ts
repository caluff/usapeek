import { intlFormat } from "date-fns/intlFormat";
import { isValid } from "date-fns/isValid";
import { parseISO } from "date-fns/parseISO";

export function formatSettlementDate(value: string | null, timeZone: string) {
  if (!value) return "No disponible";
  const date = parseISO(value);
  if (!isValid(date)) return "No disponible";
  try {
    return intlFormat(
      date,
      { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone },
      { locale: "es-UY" },
    );
  } catch {
    return "No disponible";
  }
}
