import { z } from "@medusajs/framework/zod";
import {
  StoreCreateCustomer,
  StoreCreateCustomerAddress,
  StoreUpdateCustomer,
  StoreUpdateCustomerAddress,
} from "@medusajs/medusa/api/store/customers/validators";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { FAVORITE_METADATA_KEY } from "../../../lib/customer-favorites";

const US_STATE_CODES = [
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "dc", "fl", "ga",
  "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md", "ma",
  "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny",
  "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx",
  "ut", "vt", "va", "wa", "wv", "wi", "wy",
] as const;

const usPhone = z.string().trim().transform((value, context) => {
  const phone = parsePhoneNumberFromString(value, { extract: false });

  // Other countries also use +1; the calling code alone is insufficient.
  if (
    !value.startsWith("+1") ||
    phone?.country !== "US" ||
    !phone.isValid() ||
    phone.ext
  ) {
    context.addIssue({
      code: "custom",
      message: "Enter a valid United States phone number with country code +1.",
    });
    return z.NEVER;
  }

  return phone.number;
});

const optionalProfilePhone = z.union([usPhone, z.literal("")]).nullish();
const customerMetadata = z.record(z.string(), z.unknown()).superRefine((metadata, context) => {
  if (Object.prototype.hasOwnProperty.call(metadata, FAVORITE_METADATA_KEY)) {
    context.addIssue({
      code: "custom",
      path: [FAVORITE_METADATA_KEY],
      message: "Favorite products cannot be changed with account information.",
    });
  }
});
const addressFields = {
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  address_1: z.string().trim().min(1),
  city: z.string().trim().min(1),
  country_code: z.string().trim().toLowerCase().pipe(z.literal("us")),
  province: z.string().trim().toLowerCase().pipe(z.enum(US_STATE_CODES)),
  postal_code: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/),
  phone: usPhone,
};

export const StoreCreateUsCustomer = StoreCreateCustomer.extend({
  phone: optionalProfilePhone,
  metadata: customerMetadata.nullish(),
});

export const StoreUpdateUsCustomer = StoreUpdateCustomer.extend({
  phone: optionalProfilePhone,
  // Replacing all metadata with null would also erase the protected favorites.
  metadata: customerMetadata.optional(),
});

export const StoreCreateUsCustomerAddress = StoreCreateCustomerAddress.extend(
  addressFields,
);

export const StoreUpdateUsCustomerAddress = StoreUpdateCustomerAddress.extend(
  z.object(addressFields).partial().shape,
);

export type StoreCreateUsCustomer = z.infer<typeof StoreCreateUsCustomer>;
export type StoreUpdateUsCustomer = z.infer<typeof StoreUpdateUsCustomer>;
export type StoreCreateUsCustomerAddress = z.infer<
  typeof StoreCreateUsCustomerAddress
>;
export type StoreUpdateUsCustomerAddress = z.infer<
  typeof StoreUpdateUsCustomerAddress
>;
