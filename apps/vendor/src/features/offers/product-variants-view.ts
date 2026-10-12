export type VariantFilter =
  "all" | "in-stock" | "out-of-stock" | "unconfigured";
export type VariantSort =
  | "original"
  | "name-asc"
  | "name-desc"
  | "price-asc"
  | "price-desc"
  | "stock-asc"
  | "stock-desc";

type Row = {
  title: string;
  values: string[];
  priceAmount?: number;
  stockQuantity?: number;
};

export function organizeVariants<T extends Row>(
  rows: T[],
  query: string,
  filter: VariantFilter,
  sort: VariantSort,
): T[] {
  const search = query.trim().toLocaleLowerCase("es");
  const filtered = rows.filter(
    (row) =>
      [row.title, ...row.values].some((value) =>
        value.toLocaleLowerCase("es").includes(search),
      ) &&
      (filter === "all" ||
        (filter === "in-stock" &&
          row.stockQuantity !== undefined &&
          row.stockQuantity > 0) ||
        (filter === "out-of-stock" && row.stockQuantity === 0) ||
        (filter === "unconfigured" &&
          (row.priceAmount === undefined || row.stockQuantity === undefined))),
  );
  if (sort === "original") return filtered;
  const direction = sort.endsWith("desc") ? -1 : 1;
  return filtered.toSorted((first, second) => {
    if (sort.startsWith("name"))
      return (
        direction *
        first.title.localeCompare(second.title, "es", {
          sensitivity: "base",
          numeric: true,
        })
      );
    const firstValue = sort.startsWith("price")
      ? first.priceAmount
      : first.stockQuantity;
    const secondValue = sort.startsWith("price")
      ? second.priceAmount
      : second.stockQuantity;
    if (firstValue === undefined) return secondValue === undefined ? 0 : 1;
    if (secondValue === undefined) return -1;
    return direction * (firstValue - secondValue);
  });
}
