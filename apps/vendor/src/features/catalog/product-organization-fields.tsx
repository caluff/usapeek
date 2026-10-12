import { Suspense } from "react";
import type { HttpTypes, ProductDTO } from "@mercurjs/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { DataError } from "../workspace/components";
import { resultOf, workspace } from "../workspace/data";

type Taxonomy = "type" | "collection" | "tag";

async function taxonomyOptions(kind: Taxonomy) {
  const { client } = await workspace();
  const options: { id: string; label: string }[] = [];
  for (let offset = 0; ; offset += 100) {
    const query = { limit: 100, offset };
    const response =
      kind === "type"
        ? await client.get<HttpTypes.VendorProductTypeListResponse>(
            "/vendor/product-types",
            { ...query, fields: "id,value" },
          )
        : kind === "collection"
          ? await client.get<HttpTypes.VendorCollectionListResponse>(
              "/vendor/collections",
              { ...query, fields: "id,title" },
            )
          : await client.get<HttpTypes.VendorProductTagListResponse>(
              "/vendor/product-tags",
              { ...query, fields: "id,value" },
            );
    const entries =
      "product_types" in response
        ? response.product_types.map(({ id, value }) => ({ id, label: value }))
        : "collections" in response
          ? response.collections.map(({ id, title }) => ({ id, label: title }))
          : response.product_tags.map(({ id, value }) => ({
              id,
              label: value,
            }));
    options.push(...entries);
    if (!entries.length || offset + entries.length >= response.count)
      return options;
  }
}

async function TaxonomyChoices({
  kind,
  product,
}: {
  kind: Taxonomy;
  product?: ProductDTO;
}) {
  const result = await resultOf(taxonomyOptions(kind));
  if (!result.data) return <DataError message={result.error} />;
  if (kind === "tag") {
    const selected = new Set((product?.tags ?? []).map(({ id }) => id));
    return (
      <>
        <input type="hidden" name="tags_present" value="true" />
        {result.data.length ? (
          <div className="grid max-h-48 gap-3 overflow-y-auto sm:grid-cols-2">
            {result.data.map(({ id, label }) => (
              <Label
                key={id}
                className="flex items-center gap-2 text-sm font-normal"
              >
                <Checkbox
                  name="tag_id"
                  value={id}
                  defaultChecked={selected.has(id)}
                />
                {label}
              </Label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay etiquetas disponibles.
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <input
        type="hidden"
        name={`${kind === "type" ? "type_id" : "collection_id"}_present`}
        value="true"
      />
      <NativeSelect
        id={`product-${kind}`}
        name={kind === "type" ? "type_id" : "collection_id"}
        defaultValue={
          kind === "type"
            ? (product?.type_id ?? product?.type?.id ?? "")
            : (product?.collection_id ?? product?.collection?.id ?? "")
        }
      >
        <option value="">
          {kind === "type" ? "Sin tipo" : "Sin colección"}
        </option>
        {result.data.map(({ id, label }) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </NativeSelect>
    </>
  );
}

export function ProductOrganizationFields({
  product,
}: {
  product?: ProductDTO;
}) {
  return (
    <div className="space-y-6">
      <input type="hidden" name="discountable_present" value="true" />
      <Label className="flex items-center gap-3 text-sm">
        <Checkbox
          name="discountable"
          value="true"
          defaultChecked={product?.discountable ?? true}
        />
        Permitir descuentos
      </Label>
      <div className="grid gap-5 sm:grid-cols-2">
        {(["type", "collection"] as const).map((kind) => (
          <Field key={kind}>
            <FieldLabel htmlFor={`product-${kind}`}>
              {kind === "type" ? "Tipo" : "Colección"}
            </FieldLabel>
            <Suspense
              fallback={
                <p role="status" className="h-10 text-sm text-muted-foreground">
                  Cargando…
                </p>
              }
            >
              <TaxonomyChoices kind={kind} product={product} />
            </Suspense>
          </Field>
        ))}
      </div>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium">Etiquetas</legend>
        <Suspense
          fallback={
            <p role="status" className="h-10 text-sm text-muted-foreground">
              Cargando etiquetas…
            </p>
          }
        >
          <TaxonomyChoices kind="tag" product={product} />
        </Suspense>
      </fieldset>
    </div>
  );
}
