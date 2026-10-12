import type { CustomerDTO, ProductDTO } from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { FAVORITE_METADATA_KEY, prepareFavoriteProductIds } from "../../lib/customer-favorites";

type PrepareCustomerFavoriteInput = {
  customer_id: string;
  product_id: string;
  saved: boolean;
  customers: {
    id: CustomerDTO["id"];
    metadata: CustomerDTO["metadata"] | null;
  }[];
  products: Pick<ProductDTO, "id" | "status">[];
};

export const prepareCustomerFavoriteStep = createStep(
  "prepare-customer-favorite",
  async (input: PrepareCustomerFavoriteInput) => {
    const customer = input.customers[0];
    if (!customer || customer.id !== input.customer_id) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Customer was not found.");
    }

    const ids = prepareFavoriteProductIds(
      customer.metadata,
      input.product_id,
      input.saved,
      input.products.some((product) => product.id === input.product_id && product.status === "published"),
    );

    return new StepResponse(
      {
        selector: { id: customer.id },
        update: { metadata: { [FAVORITE_METADATA_KEY]: ids } },
      },
      {
        customer_id: customer.id,
        removeMetadataKey: !Object.prototype.hasOwnProperty.call(customer.metadata ?? {}, FAVORITE_METADATA_KEY),
      },
    );
  },
  async (data, { container }) => {
    if (!data?.removeMetadataKey) return;

    // Medusa merges metadata during rollback; an originally absent key needs explicit removal.
    const customers = container.resolve(Modules.CUSTOMER);
    await customers.updateCustomers(data.customer_id, {
      metadata: { [FAVORITE_METADATA_KEY]: "" },
    });
  },
);
