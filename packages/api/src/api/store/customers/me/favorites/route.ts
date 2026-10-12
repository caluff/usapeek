import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { updateCustomerFavoriteWorkflow } from "../../../../../workflows/update-customer-favorite";
import type { StoreUpdateCustomerFavorite } from "./middlewares";

export async function POST(
  req: AuthenticatedMedusaRequest<StoreUpdateCustomerFavorite>,
  res: MedusaResponse<HttpTypes.StoreCustomerResponse>,
) {
  const customerId = req.auth_context.actor_id;
  await updateCustomerFavoriteWorkflow(req.scope).run({
    input: {
      customer_id: customerId,
      product_id: req.validatedBody.product_id,
      saved: req.validatedBody.saved,
    },
  });

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: [customer] } = await query.graph({
    entity: "customer",
    fields: ["id", "email", "company_name", "first_name", "last_name", "phone", "metadata", "created_at", "updated_at", "addresses.*"],
    filters: { id: customerId },
  });

  if (!customer) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Customer was not found.");
  }

  const addresses = customer.addresses
    .filter((address) => address !== null)
    .map((address) => ({
      ...address,
      created_at: address.created_at instanceof Date ? address.created_at.toISOString() : address.created_at,
      updated_at: address.updated_at instanceof Date ? address.updated_at.toISOString() : address.updated_at,
    }));
  res.json({
    customer: {
      ...customer,
      email: customer.email ?? "",
      metadata: customer.metadata ?? undefined,
      addresses,
      default_shipping_address_id: addresses.find((address) => address.is_default_shipping)?.id ?? null,
      default_billing_address_id: addresses.find((address) => address.is_default_billing)?.id ?? null,
    },
  });
}
