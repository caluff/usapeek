import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataError } from "../workspace/components";
import { resultOf, workspace } from "../workspace/data";
import { shippingConfiguration } from "./operations";
import { PickupForm } from "./pickup-form";
import { CreateShippingProfile } from "./create-shipping-profile";
import { ShippingProfileList } from "./shipping-profile-list";

export async function ShippingSettings() {
  const { client } = await workspace();
  const result = await resultOf(shippingConfiguration(client));
  if (!result.data) return <DataError message={result.error} />;
  const { profiles, options, locations, pickupEnabled } = result.data;
  if (locations.count !== 1 || locations.stock_locations.length !== 1)
    return (
      <Card>
        <CardContent className="pt-6 text-sm">
          Necesitas el almacén único de tu tienda para configurar envíos.{" "}
          <Link href="/seller/inventory/locations" className="underline">
            Revisar almacén
          </Link>
        </CardContent>
      </Card>
    );
  const warehouse = locations.stock_locations[0];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="grid size-9 shrink-0 place-items-center bg-muted text-muted-foreground">
              <MapPin className="size-4" aria-hidden="true" />
            </div>
            <div>
              <CardTitle>Origen de envíos y recogida</CardTitle>
            </div>
          </div>
          <Badge variant="outline">Estados Unidos · USD</Badge>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="font-semibold">{warehouse.name}</p>
          <p className="mt-1 text-muted-foreground">
            {[
              warehouse.address?.address_1,
              warehouse.address?.city,
              warehouse.address?.province,
              warehouse.address?.postal_code,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
          <div className="mt-5 border-t pt-5">
            <PickupForm enabled={pickupEnabled} />
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4" aria-labelledby="shipping-profiles-title">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <h2 id="shipping-profiles-title" className="text-lg font-bold">
            Perfiles de envío
          </h2>
          <CreateShippingProfile />
        </div>
        {profiles.length ? (
          <ShippingProfileList
            profiles={profiles}
            options={options}
            pickupEnabled={pickupEnabled}
          />
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            Todavía no tienes perfiles de envío.
          </p>
        )}
      </section>
    </div>
  );
}
