import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeading } from "@/features/workspace/components";
import { resultOf, workspace } from "@/features/workspace/data";
import { sellerWarehouse } from "@/features/inventory/data";
import {
  WarehouseCard,
  InventorySkeleton,
} from "@/features/inventory/warehouse-card";

export const metadata: Metadata = {
  title: "Almacén",
  description: "Consulta la información del almacén desde el que opera tu tienda en USAPEEK.",
};
export default async function LocationsPage() {
  const { client } = await workspace();
  const warehouse = resultOf(sellerWarehouse(client));
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Inventario"
        title="Almacén de la tienda"
        description="Tu tienda opera desde un único almacén en Estados Unidos, configurado con la dirección de tu solicitud aprobada."
      />
      <Suspense fallback={<InventorySkeleton warehouse />}>
        <WarehouseCard result={warehouse} />
      </Suspense>
    </div>
  );
}
