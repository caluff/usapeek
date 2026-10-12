import type {
  MedusaContainer,
  OrderDetailDTO,
  PaymentCollectionDTO,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import { MercurModules } from "@mercurjs/types";
import { getLastPaymentStatus } from "@mercurjs/core/workflows/order-group/utils/aggregate-status";
import type OrderModuleService from "../../modules/order/service";
import type SellerModuleService from "../../modules/seller/service";
import {
  AdminCustomerPurchasesDetailResponseSchema,
  type AdminCustomerPurchasesDetailResponse,
  type AdminCustomerPurchasesQuery,
} from "./contracts";

const ADDRESS_FIELDS = [
  "phone",
  "address_1",
  "address_2",
  "city",
  "province",
  "postal_code",
  "country_code",
];
const CONTACT_FIELDS = ADDRESS_FIELDS.flatMap((field) => [
  `shipping_address.${field}`,
  `billing_address.${field}`,
]);
const PAYMENT_FIELDS = [
  "id",
  "status",
  "amount",
  "captured_amount",
  "refunded_amount",
];
const ORDER_FIELDS = [
  "id",
  "display_id",
  "custom_display_id",
  "created_at",
  "status",
  "currency_code",
  "summary",
  // Native Order formatting needs the line and current-version detail together.
  // The response projects only title/presentation/quantity after this bounded read.
  "items.*",
  "items.detail.*",
  "seller.name",
  ...PAYMENT_FIELDS.map((field) => `cart.payment_collection.${field}`),
  ...PAYMENT_FIELDS.map((field) => `payment_collections.${field}`),
];

// The native Mercur helper reads only currency and collection amounts/status.
// Normalize GraphQL's nullable amount fields at this narrow boundary.
const paymentStatus = getLastPaymentStatus as (order: {
  currency_code: OrderDetailDTO["currency_code"];
  payment_collections: Pick<
    PaymentCollectionDTO,
    "amount" | "status" | "captured_amount" | "refunded_amount"
  >[];
}) => string;

export async function readAdminCustomerPurchasesDetail(
  container: MedusaContainer,
  customerId: string,
  input: AdminCustomerPurchasesQuery,
): Promise<AdminCustomerPurchasesDetailResponse> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [{ data: customers }, purchaseCount] = await Promise.all([
    query.graph(
      {
        entity: "customer",
        fields: [
          "id",
          "first_name",
          "last_name",
          "email",
          "has_account",
          "phone",
        ],
        filters: { id: customerId },
      },
      { cache: { enable: false } },
    ),
    container
      .resolve<SellerModuleService>(MercurModules.SELLER)
      .countCustomerPurchases(customerId),
  ]);
  const customer = customers[0];
  if (!customer || !purchaseCount) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Customer purchases not found.",
    );
  }

  // Identity must still exist before reading contact from historical orders.
  // Orders are paged directly, so a multi-seller checkout cannot overfill a page.
  const orderFilters = {
    customer_id: customerId,
    is_draft_order: false,
    status: { $ne: "draft" },
  };
  const pagination = {
    take: input.limit,
    skip: input.offset,
    order: { created_at: "DESC", id: "DESC" },
  } as const;
  const [
    spent,
    { data: orders, metadata },
    { data: addresses },
    { data: latestOrders },
  ] = await Promise.all([
    container
      .resolve<OrderModuleService>(Modules.ORDER)
      .listCustomerSpentTotals([customerId]),
    query.graph(
      {
        entity: "order",
        fields: ORDER_FIELDS,
        filters: orderFilters,
        pagination,
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "customer_address",
        fields: [
          "id",
          "is_default_shipping",
          "is_default_billing",
          ...ADDRESS_FIELDS,
        ],
        filters: {
          customer_id: customerId,
          $or: [{ is_default_shipping: true }, { is_default_billing: true }],
        },
        pagination: {
          take: 2,
          order: { is_default_shipping: "DESC", id: "ASC" },
        },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "order",
        fields: ["id", ...CONTACT_FIELDS],
        filters: orderFilters,
        pagination: { take: 1, order: { created_at: "DESC", id: "DESC" } },
      },
      { cache: { enable: false } },
    ),
  ]);
  const latest = latestOrders[0];
  const address =
    addresses[0] ?? latest?.shipping_address ?? latest?.billing_address;
  const phone =
    customer.phone ||
    addresses.find((item) => item.phone)?.phone ||
    latest?.shipping_address?.phone ||
    latest?.billing_address?.phone ||
    null;

  return AdminCustomerPurchasesDetailResponseSchema.parse({
    customer: {
      id: customer.id,
      first_name: customer.first_name ?? null,
      last_name: customer.last_name ?? null,
      email: customer.email ?? null,
      has_account: customer.has_account,
      phone,
      addresses: address
        ? [
            {
              address_1: address.address_1 ?? null,
              address_2: address.address_2 ?? null,
              city: address.city ?? null,
              province: address.province ?? null,
              postal_code: address.postal_code ?? null,
              country_code: address.country_code ?? null,
            },
          ]
        : [],
      purchase_count: purchaseCount,
      spent_totals: spent.map(({ currency_code, amount }) => ({
        currency_code,
        amount,
      })),
    },
    orders: orders.map((order) => {
      const sharedPayment = order.cart?.payment_collection;
      const collections = sharedPayment
        ? [sharedPayment]
        : (order.payment_collections ?? []).flatMap((payment) =>
            payment ? [payment] : [],
          );
      return {
        id: order.id,
        display_id: order.display_id,
        custom_display_id: order.custom_display_id ?? null,
        created_at:
          order.created_at instanceof Date
            ? order.created_at.toISOString()
            : order.created_at,
        status: order.status,
        payment_status: paymentStatus({
          currency_code: order.currency_code,
          payment_collections: collections.map((payment) => ({
            status: payment.status,
            amount: payment.amount ?? 0,
            captured_amount: payment.captured_amount ?? 0,
            refunded_amount: payment.refunded_amount ?? 0,
          })),
        }),
        currency_code: order.currency_code,
        total: order.summary?.current_order_total ?? 0,
        seller_name: order.seller?.name ?? null,
        items:
          order.items?.flatMap((item) =>
            item
              ? [
                  {
                    title: item.title,
                    variant_title: item.variant_title ?? null,
                    quantity: item.quantity,
                  },
                ]
              : [],
          ) ?? [],
      };
    }),
    count: metadata?.count ?? 0,
    limit: input.limit,
    offset: input.offset,
  });
}
