import { z } from "@medusajs/framework/zod";

export const US_STATE_CODES = [
  "al",
  "ak",
  "az",
  "ar",
  "ca",
  "co",
  "ct",
  "de",
  "dc",
  "fl",
  "ga",
  "hi",
  "id",
  "il",
  "in",
  "ia",
  "ks",
  "ky",
  "la",
  "me",
  "md",
  "ma",
  "mi",
  "mn",
  "ms",
  "mo",
  "mt",
  "ne",
  "nv",
  "nh",
  "nj",
  "nm",
  "ny",
  "nc",
  "nd",
  "oh",
  "ok",
  "or",
  "pa",
  "ri",
  "sc",
  "sd",
  "tn",
  "tx",
  "ut",
  "vt",
  "va",
  "wa",
  "wv",
  "wi",
  "wy",
] as const;

export const ShippingCoverage = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("all") }),
  z.strictObject({
    mode: z.literal("states"),
    states: z
      .array(z.enum(US_STATE_CODES))
      .min(1)
      .max(51)
      .transform((states) => [...new Set(states)].sort()),
  }),
]);
export type ShippingCoverage = z.infer<typeof ShippingCoverage>;

export function normalizeState(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/^us-/, "") ?? "";
}

export function coverageGeoZones(coverage: ShippingCoverage) {
  if (coverage.mode === "all")
    return [{ type: "country" as const, country_code: "us" }];
  // Medusa matches province codes literally. Support existing saved USPS and
  // ISO addresses without rewriting customer addresses during checkout reads.
  return coverage.states.flatMap((state) =>
    [
      state,
      state.toUpperCase(),
      `us-${state}`,
      `US-${state.toUpperCase()}`,
    ].map((province_code) => ({
      type: "province" as const,
      country_code: "us",
      province_code,
    })),
  );
}

export function zoneCoverage(
  zones: {
    type: string;
    country_code: string;
    province_code?: string | null;
  }[],
): ShippingCoverage | null {
  if (
    zones.length === 1 &&
    zones[0].type === "country" &&
    zones[0].country_code.toLowerCase() === "us"
  )
    return { mode: "all" };
  if (
    !zones.length ||
    zones.some(
      (zone) =>
        zone.type !== "province" || zone.country_code.toLowerCase() !== "us",
    )
  )
    return null;
  const parsed = ShippingCoverage.safeParse({
    mode: "states",
    states: [
      ...new Set(zones.map((zone) => normalizeState(zone.province_code))),
    ],
  });
  return parsed.success ? parsed.data : null;
}

export type VendorShippingConfigurationResponse = { pickup_enabled: boolean };
