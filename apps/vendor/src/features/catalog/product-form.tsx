"use client";

import { ProductCreateForm } from "./product-create-form";
import { ProductEditForm } from "./product-edit-form";
import type { ProductFormProps } from "./product-form-types";

export type { ProductEditSectionName } from "./product-form-types";

export function ProductForm(props: ProductFormProps) {
  return props.product ? (
    <ProductEditForm {...props} product={props.product} />
  ) : (
    <ProductCreateForm {...props} />
  );
}
