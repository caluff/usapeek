import { parsePhoneNumber } from "react-phone-number-input/input";

export function formatPhoneNumber(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;

  const phone = parsePhoneNumber(raw, { defaultCountry: "US", extract: false });
  if (!phone?.isPossible()) return raw;

  return phone.countryCallingCode === "1"
    ? `+1 ${phone.formatNational()}`
    : phone.formatInternational();
}
