import type { ReactNode } from "react";

export function ProductCategoryGroup({ children }: { children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium">
        Categorías del catálogo
      </legend>
      {children}
    </fieldset>
  );
}
