import type { OfferInventoryItemLinkDTO, ProductDTO } from "@mercurjs/types";
import Link from "next/link";
import type { ReactNode } from "react";
import { VariantForm } from "../catalog/variant-form";
import {
  hasPresentationOptions,
  variantOptionValues,
} from "../catalog/variant-options";
import { DataError } from "../workspace/components";
import { resultOf, workspace } from "../workspace/data";
import { baseUsdPrice, OFFER_FIELDS, type OfferWithPrices } from "./operations";
import { OfferForm } from "./offer-form";
import type { offerConfiguration } from "./data";
import { createMasterSku } from "../catalog/master-sku";
import { isShippingProfileArchived } from "../shipping/presentation";
import { formatDate, formatMoney } from "../workspace/presentation";
import {
  sellerWarehouse,
  warehouseLevel,
  type InventoryItemWithLevels,
} from "../inventory/data";
import {
  ProductVariantsTable,
  type ProductVariantRow,
} from "./product-variants-table";
import type { scopedClient } from "../workspace/operations";

type ProductOffer = OfferWithPrices & {
  inventory_item_link?: (Pick<
    OfferInventoryItemLinkDTO,
    "required_quantity"
  > & {
    inventory_item?: Pick<InventoryItemWithLevels, "id"> | null;
  })[];
};
const PRODUCT_OFFER_FIELDS =
  OFFER_FIELDS +
  ",manage_inventory,inventory_item_link.required_quantity,inventory_item_link.inventory_item.id";

async function variantInventory(
  client: ReturnType<typeof scopedClient>,
  offers: ProductOffer[],
) {
  const ids = [
    ...new Set(
      offers.flatMap((offer) =>
        (offer.inventory_item_link ?? []).flatMap((link) =>
          link.inventory_item?.id ? [link.inventory_item.id] : [],
        ),
      ),
    ),
  ];
  if (!ids.length) return [];
  const items: InventoryItemWithLevels[] = [];
  let count = 1;
  while (items.length < count) {
    const page = await client.get<{
      inventory_items: InventoryItemWithLevels[];
      count: number;
    }>("/vendor/inventory-items", {
      id: ids,
      limit: 100,
      offset: items.length,
      fields:
        "id,title,location_levels.id,location_levels.location_id,location_levels.stocked_quantity,location_levels.reserved_quantity",
    });
    if (!page.inventory_items.length && items.length < page.count)
      throw new Error("No se pudieron cargar todas las existencias.");
    items.push(...page.inventory_items);
    count = page.count;
  }
  return items;
}

export async function ProductOffers({
  product,
  configuration,
  hasPending,
}: {
  product: ProductDTO;
  hasPending: boolean;
  configuration: ReturnType<
    typeof resultOf<Awaited<ReturnType<typeof offerConfiguration>>>
  >;
}) {
  const options = (product.options ?? []).filter(
    (option) => option.title !== "__default__",
  );
  const hasOptions = hasPresentationOptions(product);
  const baseRows = (product.variants ?? []).map(
    (variant): ProductVariantRow => {
      const values = variantOptionValues(product, variant);
      return {
        id: variant.id,
        title: (hasOptions ? variant.title : product.title) || "Sin nombre",
        values: (product.options ?? []).flatMap((option, index) =>
          option.title === "__default__" ? [] : [values[index]],
        ),
        price: "Sin configurar",
        stock: "Sin configurar",
        createdAt: formatDate(variant.created_at),
        updatedAt: formatDate(variant.updated_at),
        form: !hasPending ? (
          <VariantForm
            product={product}
            variant={variant}
            defaultSku={variant.sku || createMasterSku(variant.title)}
          />
        ) : undefined,
      };
    },
  );
  const unavailable = (notice: ReactNode) => (
    <div className="space-y-4">
      <div className="px-5 pt-4">{notice}</div>
      <ProductVariantsTable
        options={options.map((option) => option.title)}
        rows={baseRows}
      />
    </div>
  );
  if (!product.variants?.length)
    return unavailable(
      <p className="text-sm text-muted-foreground">
        El producto necesita al menos una variante para configurar su precio.
      </p>,
    );
  if (product.status !== "published" && product.status !== "proposed")
    return unavailable(
      <p className="text-sm text-muted-foreground">
        Podrás configurar precios cuando el producto se envíe a aprobación o
        esté publicado.
      </p>,
    );
  const { client } = await workspace();
  const result = await resultOf(
    Promise.all([
      client.get<{ offers: ProductOffer[]; count: number }>("/vendor/offers", {
        variant_id: product.variants.map((variant) => variant.id),
        limit: 100,
        fields: PRODUCT_OFFER_FIELDS,
      }),
      configuration,
      sellerWarehouse(client),
    ]),
  );
  if (!result.data) return unavailable(<DataError message={result.error} />);
  const [offers, configured, warehouse] = result.data;
  if (!configured.data)
    return unavailable(<DataError message={configured.error} />);
  const [locations, profiles] = configured.data;
  if (
    warehouse.status !== "ready" ||
    locations.count !== 1 ||
    locations.stock_locations.length !== 1 ||
    locations.stock_locations[0].id !== warehouse.location.id
  )
    return unavailable(
      <p className="text-sm text-muted-foreground">
        Tu tienda necesita un almacén único validado.{" "}
        <Link href="/seller/inventory/locations" className="underline">
          Revisar almacén
        </Link>
      </p>,
    );
  if (offers.count > offers.offers.length)
    return unavailable(
      <DataError message="Hay más ofertas de las que se pudieron cargar. El operador debe revisar el catálogo antes de editar precios." />,
    );
  if (profiles.count > profiles.shipping_profiles.length)
    return unavailable(
      <DataError message="No se pudieron cargar todos los perfiles de envío. Revisa la configuración antes de editar ofertas." />,
    );
  const inventory = await resultOf(variantInventory(client, offers.offers));
  const warehouseId = warehouse.location.id;
  const hasActiveProfiles = profiles.shipping_profiles.some(
    (profile) => !isShippingProfileArchived(profile),
  );
  const rows = product.variants.map((variant, index): ProductVariantRow => {
    const row = baseRows[index];
    const offer = offers.offers.find(
      (entry) => entry.variant_id === variant.id,
    );
    let amount = "";
    let priceError = "";
    try {
      const base = baseUsdPrice(offer?.prices ?? []);
      amount = base ? String(Number(base.amount)) : "";
    } catch (failure) {
      priceError =
        failure instanceof Error ? failure.message : "Precio no disponible.";
    }
    const links = offer?.inventory_item_link;
    const link = links?.length === 1 ? links[0] : undefined;
    const required = Number(link?.required_quantity);
    const item = inventory.data?.find(
      (entry) => entry.id === link?.inventory_item?.id,
    );
    const level = item ? warehouseLevel(item, warehouseId) : null;
    const canEditStock = Boolean(
      offer?.manage_inventory &&
      link &&
      Number.isSafeInteger(required) &&
      required > 0 &&
      level?.status === "ready",
    );
    const stock =
      canEditStock && level?.status === "ready"
        ? Math.floor(Math.max(0, level.available) / required)
        : offer
          ? "No disponible"
          : "Sin configurar";
    return {
      ...row,
      price: priceError ? (
        <span className="text-destructive">No disponible</span>
      ) : amount ? (
        formatMoney(amount, "USD")
      ) : (
        "Sin precio"
      ),
      stock,
      priceAmount: !priceError && amount ? Number(amount) : undefined,
      stockQuantity: typeof stock === "number" ? stock : undefined,
      form:
        !priceError && (offer || hasActiveProfiles) ? (
          <OfferForm
            key={offer?.id ?? "new"}
            defaultSku={
              offer?.sku || createMasterSku(variant.title || product.title)
            }
            variantId={variant.id}
            product={product}
            variant={variant}
            hasPending={hasPending}
            masterSku={variant.sku || createMasterSku(variant.title)}
            warehouseId={warehouseId}
            profiles={profiles.shipping_profiles}
            inventory={
              canEditStock && item && level?.status === "ready"
                ? {
                    id: item.id,
                    stocked: level.stocked,
                    reserved: level.reserved,
                  }
                : undefined
            }
            offer={
              offer
                ? {
                    id: offer.id,
                    sku: offer.sku,
                    amount,
                    shippingProfileId: offer.shipping_profile_id,
                  }
                : undefined
            }
          />
        ) : (
          row.form
        ),
      inventoryLink: offer ? (
        <Link
          href={"/seller/inventory?q=" + encodeURIComponent(product.title)}
          className="inline-block text-sm text-primary underline underline-offset-4"
        >
          Ver inventario
        </Link>
      ) : undefined,
    };
  });
  return (
    <div className="space-y-4">
      {product.status === "proposed" ? (
        <p className="px-5 pt-4 text-sm text-muted-foreground">
          Los precios y las existencias se guardan en borrador y estarán
          disponibles para los clientes cuando se apruebe el producto.
        </p>
      ) : null}
      {!hasActiveProfiles ? (
        <p className="px-5 pt-4 text-sm text-muted-foreground">
          Configura tus envíos antes de empezar a vender este producto.{" "}
          <Link
            href="/seller/settings/shipping"
            className="font-medium underline"
          >
            Configurar mis envíos
          </Link>
        </p>
      ) : null}
      {!inventory.data ? (
        <div className="px-5 pt-4">
          <DataError message={inventory.error} />
        </div>
      ) : null}
      <ProductVariantsTable
        options={options.map((option) => option.title)}
        rows={rows}
      />
    </div>
  );
}
