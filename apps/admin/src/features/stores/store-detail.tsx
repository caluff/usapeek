import { Suspense, type ReactNode } from "react";
import type { SellerDTO } from "@mercurjs/types";
import { formatPhoneNumber } from "@usapeek/ui/format-phone-number";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsOption } from "@/components/ui/settings-option";
import {
  CatalogPermissionRegion,
  CatalogPermissionSkeleton,
  type CatalogPermissionRead,
} from "./catalog-permission-region";
import { StoreStatusBadge } from "./status-badge";

const SECTION_TITLE =
  "text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]";

function StoreField({ label, value }: { label: string; value?: ReactNode }) {
  if (value == null || (typeof value === "string" && !value.trim()))
    return null;
  return (
    <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 text-sm">
      <dt className="font-medium">{label}</dt>
      <dd className="min-w-0 max-w-[75%] text-right text-muted-foreground [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}

function websiteHref(value: string | null | undefined) {
  try {
    const url = new URL(value ?? "");
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function StoreDetailSkeleton() {
  return (
    <div aria-label="Cargando tienda" className="max-w-4xl space-y-10">
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="space-y-5">
        <Skeleton className="h-7 w-48" />
        <CatalogPermissionSkeleton settings />
      </div>
      <div className="space-y-5">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

export function StoreDetails({
  seller,
  permissions,
}: {
  seller: SellerDTO;
  permissions: CatalogPermissionRead;
}) {
  const address = seller.address;
  const business = seller.professional_details;
  const website = websiteHref(seller.website_url);
  const addressFields = [
    { label: "Nombre", value: address?.name },
    {
      label: "Contacto",
      value: [address?.first_name, address?.last_name]
        .filter(Boolean)
        .join(" "),
    },
    { label: "Dirección", value: address?.address_1 },
    { label: "Complemento", value: address?.address_2 },
    { label: "Ciudad", value: address?.city },
    { label: "Estado", value: address?.province },
    { label: "Código postal", value: address?.postal_code },
    { label: "País", value: address?.country_code?.toUpperCase() },
    { label: "Teléfono", value: formatPhoneNumber(address?.phone) },
  ].filter((field) => field.value?.trim());
  const businessFields = [
    { label: "Razón social", value: business?.corporate_name },
    { label: "Número de registro", value: business?.registration_number },
    { label: "Identificación fiscal", value: business?.tax_id },
  ].filter((field) => field.value?.trim());
  const addressSummary = address
    ? [address.address_1, address.city, address.province]
        .filter((value) => value?.trim())
        .join(", ") ||
      [address.postal_code, address.country_code?.toUpperCase()]
        .filter((value) => value?.trim())
        .join(", ") ||
      addressFields[0]?.value
    : undefined;
  return (
    <div className="max-w-4xl space-y-10">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight">
            {seller.name}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <StoreStatusBadge status={seller.status} />
            {seller.is_premium && <Badge variant="accent">Destacada</Badge>}
          </div>
        </div>
        {seller.description && (
          <p className="max-w-prose whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
            {seller.description}
          </p>
        )}
        {seller.status_reason && (
          <p className="text-sm leading-6">
            <span className="font-medium">Motivo del estado: </span>
            {seller.status_reason}
          </p>
        )}
      </header>

      <section aria-labelledby="store-settings-title" className="space-y-5">
        <h2 id="store-settings-title" className={SECTION_TITLE}>
          Configuración
        </h2>
        <Suspense fallback={<CatalogPermissionSkeleton settings />}>
          <CatalogPermissionRegion
            seller={seller}
            permissions={permissions}
            settings
            href={`/dashboard/stores/${encodeURIComponent(seller.id)}`}
          />
        </Suspense>
      </section>

      <section
        aria-labelledby="store-information-title"
        className="min-w-0 space-y-5"
      >
        <h2 id="store-information-title" className={SECTION_TITLE}>
          Información de la tienda
        </h2>
        <div>
          <dl className="pr-14">
            <StoreField label="Correo electrónico" value={seller.email} />
            <StoreField
              label="Teléfono"
              value={formatPhoneNumber(seller.phone)}
            />
            <StoreField
              label="Sitio web"
              value={
                website ? (
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-sm underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {seller.website_url}
                    <span className="sr-only"> (abre en otra pestaña)</span>
                  </a>
                ) : (
                  seller.website_url
                )
              }
            />
          </dl>
          {addressFields.length > 0 && (
            <SettingsOption label="Dirección registrada" value={addressSummary}>
              <dl>
                {addressFields.map((field) => (
                  <StoreField key={field.label} {...field} />
                ))}
              </dl>
            </SettingsOption>
          )}
          {businessFields.length > 0 && (
            <SettingsOption
              label="Datos de la empresa"
              value={businessFields[0]?.value}
            >
              <dl>
                {businessFields.map((field) => (
                  <StoreField key={field.label} {...field} />
                ))}
              </dl>
            </SettingsOption>
          )}
        </div>
      </section>
    </div>
  );
}
