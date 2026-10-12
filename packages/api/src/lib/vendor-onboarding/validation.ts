import type SellerModule from "@mercurjs/core/modules/seller";
import { createHash } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { MercurModules } from "@mercurjs/types";
import { DraftDataSchema, type DraftData } from "./schemas";
import { OnboardingError } from "./errors";

export const TERMS_VERSION = "vendor-application-2026-09-04";
export const ELIGIBLE_COUNTRIES = ["us"];
export function applicationStoreHandle(customerId: string, persistedHandle?: string): string {
  if (persistedHandle && persistedHandle.length >= 3 && persistedHandle.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(persistedHandle)) return persistedHandle;
  return `store-${canonicalHash(customerId)}`;
}
export function canonicalHash(input: unknown): string {
  function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
    return JSON.stringify(value);
  }
  return createHash("sha256").update(canonical(input)).digest("hex");
}
export async function applicationOptions(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: stores } = await query.graph({ entity: "store", fields: ["id", "supported_currencies.currency_code"] }, { cache: { enable: false } });
  return { country_codes: ELIGIBLE_COUNTRIES, currency_codes: [...new Set(stores.flatMap(store => store.supported_currencies?.flatMap(currency => currency ? [currency.currency_code] : []) || []))], terms_version: TERMS_VERSION };
}
export function validateCompleteData(value: unknown): DraftData {
  const data = DraftDataSchema.parse(value);
  const { responsible, store, activity } = data;
  const address = activity.business_address;
  // Customer addresses use lowercase state codes; accept existing drafts as well.
  address.province = address.province.toUpperCase();
  const states = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
  const phone = parsePhoneNumberFromString(responsible.phone);
  if (!responsible.first_name || !responsible.last_name || !store.name || store.description.length < 20 || !activity.description || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(store.handle) || store.handle.length < 3 || !phone?.isValid() || phone.country !== "US" || phone.number !== responsible.phone || (!activity.category_ids.length && !activity.category_suggestion) || !activity.currency_code || !address.address_1 || !address.city || !states.includes(address.province) || !/^\d{5}(?:-\d{4})?$/.test(address.postal_code) || (activity.business_type === "company" ? !activity.company_name : !!activity.company_name)) throw new OnboardingError("invalid_application", 400);
  if (!ELIGIBLE_COUNTRIES.includes(address.country_code)) throw new OnboardingError("not_eligible", 403);
  return data;
}
export async function validateSubmission(container: MedusaContainer, value: unknown, email: string, customerId?: string) {
  const data = validateCompleteData(value);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [options, categories] = await Promise.all([
    applicationOptions(container),
    data.activity.category_ids.length
      ? query.graph({ entity: "product_category", fields: ["id"], filters: { id: data.activity.category_ids, is_active: true, is_internal: false } }, { cache: { enable: false } })
      : Promise.resolve({ data: [] }),
  ]);
  if (!options.currency_codes.length) throw new OnboardingError("catalog_unconfigured", 503);
  if (!options.currency_codes.includes(data.activity.currency_code)) throw new OnboardingError("invalid_currency", 400);
  if (categories.data.length !== data.activity.category_ids.length) throw new OnboardingError("invalid_categories", 400);
  const service = container.resolve<NativeSellerService>(MercurModules.SELLER);
  const uniqueFields = [["name", data.store.name, "store_name_taken"], ["handle", data.store.handle, "store_handle_taken"], ["email", email, "store_email_taken"]] as const;
  const matches = await Promise.all(uniqueFields.map(([key, value]) => service.listSellers({ [key]: value }, { take: 1 })));
  // Old drafts may contain a user-selected handle that became unavailable.
  if (matches[1].length && customerId) {
    const generatedHandle = applicationStoreHandle(customerId);
    if (generatedHandle !== data.store.handle) {
      data.store.handle = generatedHandle;
      matches[1] = await service.listSellers({ handle: generatedHandle }, { take: 1 });
    }
  }
  for (const [index, sellers] of matches.entries()) {
    if (sellers.length) throw new OnboardingError(uniqueFields[index][2]);
  }
  return data;
}

type NativeSellerService = InstanceType<typeof SellerModule.service>;
