import type { ReactNode } from "react";
import type { ProductDTO } from "@mercurjs/types";
import type { MutationState } from "../workspace/presentation";

export type ProductEditSectionName =
  "details" | "organization" | "attributes" | "media";
export type ProductFormProps = {
  action: (previous: MutationState, form: FormData) => Promise<MutationState>;
  categories?: ReactNode;
  organization?: ReactNode;
  commercialConfiguration?: ReactNode;
  product?: ProductDTO;
  section?: ProductEditSectionName;
  disabled?: boolean;
  onSaved?: () => void;
  onBusyChange?: (busy: boolean) => void;
  onCancel?: () => void;
};
