import Link from "next/link";
import type { ProductDTO } from "@mercurjs/types";
import type { offerConfiguration } from "../offers/data";
import { isShippingProfileArchived } from "../shipping/presentation";
import { DataError } from "../workspace/components";
import type { resultOf } from "../workspace/data";
import { CreateVariantForm } from "./create-variant-form";

export async function CreateVariantContent({
  product,
  configuration,
}: {
  product: ProductDTO;
  configuration: ReturnType<
    typeof resultOf<Awaited<ReturnType<typeof offerConfiguration>>>
  >;
}) {
  const result = await configuration;
  if (!result.data) return <DataError message={result.error} />;
  const [locations, profiles] = result.data;
  const active = profiles.shipping_profiles.filter(
    (profile) => !isShippingProfileArchived(profile),
  );
  if (
    locations.count !== 1 ||
    locations.stock_locations.length !== 1 ||
    !active.length ||
    profiles.count > profiles.shipping_profiles.length
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        Configura el almacén y los envíos de tu tienda antes de crear variantes
        con precio y existencias.{" "}
        <Link href="/seller/settings/shipping" className="underline">
          Revisar configuración
        </Link>
      </p>
    );
  }
  return <CreateVariantForm product={product} profiles={active} />;
}
