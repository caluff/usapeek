import "server-only";

import { FetchError } from "@medusajs/js-sdk";
import type { HttpTypes, ProductDTO } from "@mercurjs/types";
import type { OrderDetailDTO } from "@medusajs/types";
import { cache } from "react";
import { redirect } from "next/navigation";
import {
  createVendorSdk,
  getVendorContext,
  getVendorToken,
} from "@/lib/auth-sdk";
import { scopedClient, type AuthorizedVendor } from "./operations";
import { resourceId } from "./validation";

// Native order reads can expand fulfillments; compose the published contracts.
export type VendorOrderDetailResponse = {
  order: OrderDetailDTO;
};

export async function authorizeVendor(): Promise<AuthorizedVendor> {
  const context = await getVendorContext();
  if (context.status !== "authenticated")
    throw new Error(
      "Tu sesión o el acceso a la tienda cambió. Inicia sesión nuevamente; solo las tiendas activas pueden operar.",
    );
  const sdk = createVendorSdk(await getVendorToken());
  if (!sdk) throw new Error("El servicio del portal no está configurado.");
  return { sdk, membership: context.membership };
}

export const workspace = cache(async () => {
  const context = await getVendorContext();
  if (context.status === "seller_unavailable") redirect("/seller/status");
  if (context.status === "seller_missing") redirect("/seller/select-seller");
  if (context.status === "unauthenticated")
    redirect("/seller/login?reason=expired");
  if (context.status !== "authenticated") redirect("/seller/no-access");
  const sdk = createVendorSdk(await getVendorToken());
  if (!sdk) throw new Error("El servicio del portal no está configurado.");
  return {
    client: scopedClient({ sdk, membership: context.membership }),
    membership: context.membership,
  };
});

export function errorMessage(error: unknown) {
  if (error instanceof FetchError) {
    if (error.status === 401)
      return "Tu sesión venció. Inicia sesión nuevamente.";
    if (error.status === 403)
      return "Tu rol o el estado de la tienda no permite esta operación.";
    if (error.status === 404)
      return "El registro no existe o no está disponible para esta tienda.";
    if (error.status && error.status >= 400 && error.status < 500)
      return `No se pudo completar la operación: ${error.message.slice(0, 400)}`;
    return "El servicio no está disponible. Inténtalo nuevamente en unos momentos.";
  }
  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación.";
}

export async function resultOf<T>(
  request: Promise<T>,
): Promise<{ data: T; error?: never } | { error: string; data?: never }> {
  try {
    return { data: await request };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function productDetail(id: string) {
  const { client } = await workspace();
  // The API guards detail and catalog-options with the same catalog visibility rules.
  resourceId(id);
  const [detail, axes] = await Promise.all([
    client.get<HttpTypes.VendorProductResponse>(`/vendor/products/${id}`, {
      fields:
        "id,title,subtitle,description,material,weight,length,width,height,origin_country,hs_code,mid_code,status,handle,discountable,type_id,type.value,collection_id,collection.title,tags.id,tags.value,images.id,images.url,categories.id,categories.name,product_attribute_values.id,product_attribute_values.name,product_attribute_values.attribute.id,product_attribute_values.attribute.name,product_attribute_values.attribute.is_variant_axis,scoped_attributes.id,scoped_attributes.name,scoped_attributes.is_variant_axis,scoped_attributes.values.id,scoped_attributes.values.name,changes.id,changes.status,changes.created_by,changes.created_at,changes.external_note,changes.declined_reason",
    }),
    client.get<Pick<ProductDTO, "options" | "variants">>(
      `/vendor/products/${id}/catalog-options`,
    ),
  ]);
  return {
    product: {
      ...detail.product,
      options: axes.options,
      variants: axes.variants,
    },
  };
}

// Medusa formats quantities from the order-item relation: select its counters
// explicitly; items.quantity plus items.detail.* can omit them in a narrow read.
export const ORDER_FIELDS =
  "id,display_id,custom_display_id,status,email,currency_code,created_at,updated_at,total,payment_status,fulfillment_status,items.id,items.title,items.thumbnail,items.product_id,items.quantity,items.unit_price,items.total,items.requires_shipping,items.detail.quantity,items.detail.fulfilled_quantity,items.detail.return_requested_quantity,items.detail.return_received_quantity,items.detail.return_dismissed_quantity,items.detail.shipped_quantity,items.detail.delivered_quantity,shipping_address.*,shipping_methods.*,fulfillments.id,fulfillments.packed_at,fulfillments.shipped_at,fulfillments.delivered_at,fulfillments.canceled_at,fulfillments.items.*,fulfillments.labels.*";

export const ORDER_LIST_FIELDS =
  "id,display_id,custom_display_id,status,email,currency_code,created_at,total,items.id,items.title,items.thumbnail,items.product_id,items.quantity,fulfillments.id,fulfillments.packed_at,fulfillments.shipped_at,fulfillments.delivered_at,fulfillments.canceled_at,payment_status";
