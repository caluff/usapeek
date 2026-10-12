import Link from "next/link";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FieldLabel } from "@/components/ui/field";
import { DataError } from "../workspace/components";
import { resultOf, workspace } from "../workspace/data";
import { offerConfiguration } from "../offers/data";
import {
  isShippingProfileArchived,
  shippingProfileName,
} from "../shipping/presentation";

export async function ProductCommercialConfiguration() {
  const { client } = await workspace();
  const result = await resultOf(offerConfiguration(client));
  if (!result.data) return <DataError message={result.error} />;
  const [locations, profiles] = result.data;
  const activeProfiles = profiles.shipping_profiles.filter(
    (profile) => !isShippingProfileArchived(profile),
  );
  if (
    locations.count !== 1 ||
    locations.stock_locations.length !== 1 ||
    !activeProfiles.length ||
    profiles.count > profiles.shipping_profiles.length
  )
    return (
      <p className="text-sm text-muted-foreground">
        Configura el almacén y los envíos de tu tienda antes de guardar precios
        y existencias.{" "}
        <Link href="/seller/settings/shipping" className="underline">
          Revisar configuración
        </Link>
      </p>
    );
  return (
    <>
      <input type="hidden" name="initial_offers_present" value="true" />
      <Field className="max-w-sm">
        <FieldLabel htmlFor="product-shipping-profile">
          Perfil de envío *
        </FieldLabel>
        <NativeSelect
          id="product-shipping-profile"
          name="shipping_profile_id"
          required
          defaultValue=""
        >
          <option value="" disabled>
            Seleccionar perfil
          </option>
          {activeProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {shippingProfileName(profile)}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </>
  );
}
