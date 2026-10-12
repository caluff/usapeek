import { catalogCategories } from "./data";
import { resultOf, workspace } from "../workspace/data";
import { DataError } from "../workspace/components";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export type CategoryResult = ReturnType<
  typeof resultOf<Awaited<ReturnType<typeof catalogCategories>>>
>;

export async function CategoryFields({
  selected = [],
  categories,
}: {
  selected?: string[];
  categories?: CategoryResult;
}) {
  const result = await (categories ??
    resultOf(catalogCategories((await workspace()).client)));
  if (!result.data) return <DataError message={result.error} />;
  return (
    <>
      <input type="hidden" name="categories_present" value="true" />
      {result.data.length ? (
        <div className="grid max-h-56 gap-3 overflow-y-auto rounded-lg border p-4 sm:grid-cols-2">
          {result.data.map((category) => (
            <Label
              key={category.id}
              className="flex items-center gap-2 text-sm font-normal"
            >
              <Checkbox
                name="category_id"
                value={category.id}
                defaultChecked={selected.includes(category.id)}
              />
              {category.name}
            </Label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          El operador todavía no ha publicado categorías. Puedes enviar el
          producto sin categoría.
        </p>
      )}
    </>
  );
}
