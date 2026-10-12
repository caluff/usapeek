/** Native HTTP/workflow regression suite on the reserved, disposable TLS environment only. */
import { randomUUID } from "node:crypto";
import type {
  IAuthModuleService,
  IFulfillmentModuleService,
  CreateOrderDTO,
} from "@medusajs/framework/types";
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  createOrdersStep,
  createStockLocationsWorkflow,
  createShippingProfilesWorkflow,
  createShippingOptionsWorkflow,
  createLinksWorkflow,
  createFulfillmentWorkflow,
  registerOrderFulfillmentStep,
  registerOrderShipmentStep,
  createShipmentWorkflow,
} from "@medusajs/core-flows";
import {
  createSellerAccountWorkflow,
  approveSellerWorkflow,
} from "@mercurjs/core/workflows";
import { MercurModules } from "@mercurjs/types";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  assertLifecycleBootstrap,
  isolatedCheckoutLifecycleEnvironment,
} from "../helpers/checkout-lifecycle-fixture";

const createZoneStep = createStep(
  "completion-fixture-zone",
  async (input: { pickup: boolean }, { container }) => {
    const service = container.resolve<IFulfillmentModuleService>(
      Modules.FULFILLMENT,
    );
    const set = await service.createFulfillmentSets({
      name: `Completion ${randomUUID()}`,
      type: input.pickup ? "pickup" : "shipping",
    });
    const zone = await service.createServiceZones({
      name: `Disposable completion zone ${randomUUID()}`,
      fulfillment_set_id: set.id,
      geo_zones: [{ type: "country", country_code: "us" }],
    });
    return new StepResponse({ zone_id: zone.id, fulfillment_set_id: set.id });
  },
);
const createZoneWorkflow = createWorkflow(
  "completion-fixture-zone",
  function (input: { pickup: boolean }) {
    return new WorkflowResponse(createZoneStep(input));
  },
);
const createCompletionOrdersWorkflow = createWorkflow(
  "completion-fixture-orders",
  function (input: { orders: CreateOrderDTO[] }) {
    return new WorkflowResponse(createOrdersStep(input.orders));
  },
);
const registerFulfillmentWorkflow = createWorkflow(
  "completion-fixture-register-fulfillment",
  function (input: {
    order_id: string;
    reference_id: string;
    items: { id: string; quantity: number }[];
  }) {
    return new WorkflowResponse(
      registerOrderFulfillmentStep({
        order_id: input.order_id,
        reference_id: input.reference_id,
        reference: Modules.FULFILLMENT,
        items: input.items,
      }),
    );
  },
);
const registerShipmentWorkflow = createWorkflow(
  "completion-fixture-register-shipment",
  function (input: {
    order_id: string;
    reference_id: string;
    items: { id: string; quantity: number }[];
  }) {
    return new WorkflowResponse(
      registerOrderShipmentStep({
        order_id: input.order_id,
        reference_id: input.reference_id,
        reference: Modules.FULFILLMENT,
        items: input.items,
      }),
    );
  },
);

if (process.env.VENDOR_COMPLETION_TESTS !== "disposable-local") {
  describe.skip("vendor order completion (requires disposable-local opt-in)", () => {
    it("requires reserved TLS PostgreSQL and Redis", () => {});
  });
} else {
  const dbName = isolatedCheckoutLifecycleEnvironment();
  jest.setTimeout(180_000);
  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async (container) =>
        assertLifecycleBootstrap(container, dbName),
    },
    testSuite: ({ api, getContainer }) => {
      async function vendor() {
        const container = getContainer();
        const auth = container.resolve<IAuthModuleService>(Modules.AUTH);
        const email = `completion-${randomUUID()}@example.invalid`;
        const password = `Disposable-${randomUUID()}!`;
        const registration = await auth.register("emailpass", {
          body: { email, password },
        });
        if (!registration.success || !registration.authIdentity)
          throw new Error("Fixture registration failed.");
        const id = registration.authIdentity.id;
        const verification = await auth.requestAuthVerification({
          auth_identity_id: id,
          entity_id: email,
          entity_type: "email",
          code_provider: "token",
        });
        await auth.confirmAuthVerification({
          code: verification.code!,
          auth_identity_id: id,
        });
        const { result: seller } = await createSellerAccountWorkflow(
          container,
        ).run({
          input: {
            auth_identity_id: id,
            member_email: email,
            seller: {
              name: `Disposable completion seller ${randomUUID()}`,
              handle: `completion-${randomUUID()}`,
              email,
              currency_code: "usd",
            },
          },
        });
        await approveSellerWorkflow(container).run({
          input: { seller_id: seller.id },
        });
        const login = await api.post("/auth/member/emailpass", {
          email,
          password,
        });
        return {
          sellerId: seller.id,
          headers: {
            authorization: `Bearer ${login.data.token}`,
            "x-seller-id": seller.id,
          },
        };
      }
      async function fixture(
        owner: Awaited<ReturnType<typeof vendor>>,
        items = [
          {
            title: "Disposable shipment",
            quantity: 2,
            requires_shipping: true,
          },
        ],
      ) {
        const container = getContainer();
        const { result: orders } = await createCompletionOrdersWorkflow(
          container,
        ).run({
          input: {
            orders: [
              {
                currency_code: "usd",
                email: "completion-buyer@example.invalid",
                items: items.map((item) => ({ ...item, unit_price: 0 })),
                shipping_address: {
                  country_code: "us",
                  address_1: "Disposable fixture address",
                  city: "Miami",
                  postal_code: "33101",
                },
              },
            ],
          },
        });
        const order = orders[0];
        await createLinksWorkflow(container).run({
          input: [
            {
              [Modules.ORDER]: { order_id: order.id },
              [MercurModules.SELLER]: { seller_id: owner.sellerId },
            },
          ],
        });
        const { result: locations } = await createStockLocationsWorkflow(
          container,
        ).run({
          input: {
            locations: [
              {
                name: "Disposable completion warehouse",
                address: { country_code: "us", address_1: "Fixture" },
              },
            ],
          },
        });
        const { result: profiles } = await createShippingProfilesWorkflow(
          container,
        ).run({
          input: {
            data: [{ name: `Completion ${randomUUID()}`, type: "default" }],
          },
        });
        await createLinksWorkflow(container).run({
          input: [
            {
              [Modules.STOCK_LOCATION]: { stock_location_id: locations[0].id },
              [Modules.FULFILLMENT]: {
                fulfillment_provider_id: "manual_manual",
              },
            },
          ],
        });
        async function prepare(
          itemIndex: number,
          amount: number,
          pickup: boolean,
        ) {
          const { result: zone } = await createZoneWorkflow(container).run({
            input: { pickup },
          });
          await createLinksWorkflow(container).run({
            input: [
              {
                [Modules.STOCK_LOCATION]: {
                  stock_location_id: locations[0].id,
                },
                [Modules.FULFILLMENT]: {
                  fulfillment_set_id: zone.fulfillment_set_id,
                },
              },
            ],
          });
          const { result: options } = await createShippingOptionsWorkflow(
            container,
          ).run({
            input: [
              {
                name: pickup ? "Pickup fixture" : "Shipping fixture",
                service_zone_id: zone.zone_id,
                shipping_profile_id: profiles[0].id,
                provider_id: "manual_manual",
                price_type: "flat",
                prices: [{ currency_code: "usd", amount: 0 }],
                data: { id: "manual-fulfillment" },
                type: {
                  label: "Fixture",
                  description: "Disposable completion delivery",
                  code: `completion-${randomUUID()}`,
                },
              },
            ],
          });
          const item = order.items![itemIndex];
          const { result: fulfillment } = await createFulfillmentWorkflow(
            container,
          ).run({
            input: {
              location_id: locations[0].id,
              provider_id: "manual_manual",
              shipping_option_id: options[0].id,
              data: { id: "manual-fulfillment" },
              delivery_address: {
                country_code: "us",
                address_1: "Disposable fixture address",
              },
              items: [
                {
                  line_item_id: item.id,
                  title: item.title,
                  sku: "fixture",
                  barcode: "fixture",
                  quantity: amount,
                },
              ],
              order,
            },
          });
          await createLinksWorkflow(container).run({
            input: [
              {
                [Modules.ORDER]: { order_id: order.id },
                [Modules.FULFILLMENT]: { fulfillment_id: fulfillment.id },
              },
            ],
          });
          const counterInput = {
            order_id: order.id,
            reference_id: fulfillment.id,
            items: [{ id: item.id, quantity: amount }],
          };
          await registerFulfillmentWorkflow(container).run({
            input: counterInput,
          });
          if (!pickup) {
            await createShipmentWorkflow(container).run({
              input: { id: fulfillment.id, labels: [] },
            });
            await registerShipmentWorkflow(container).run({
              input: counterInput,
            });
          }
          return fulfillment.id;
        }
        return { order, prepare };
      }
      const request = (
        owner: Awaited<ReturnType<typeof vendor>>,
        method: "GET" | "POST",
        path: string,
      ) =>
        api.request({
          method,
          url: `/vendor/orders/${path}`,
          headers: owner.headers,
          data: method === "POST" ? {} : undefined,
          validateStatus: () => true,
        });
      async function state(id: string) {
        const {
          data: [order],
        } = await getContainer()
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph(
            {
              entity: "order",
              fields: [
                "id",
                "status",
                "items.detail.fulfilled_quantity",
                "items.detail.delivered_quantity",
              ],
              filters: { id },
            },
            { cache: { enable: false } },
          );
        return order;
      }
      it("blocks early completion, retains a partial delivery, completes the last delivery and safely retries it", async () => {
        const owner = await vendor();
        const other = await vendor();
        const sale = await fixture(owner);
        const first = await sale.prepare(0, 1, false);
        const second = await sale.prepare(0, 1, false);
        const id = sale.order.id;
        expect(
          (
            await api.get(`/vendor/orders/${id}/completion`, {
              validateStatus: () => true,
            })
          ).status,
        ).toBe(401);
        expect((await request(other, "GET", `${id}/completion`)).status).toBe(
          404,
        );
        expect((await request(other, "POST", `${id}/complete`)).status).toBe(
          404,
        );
        expect(
          (
            await request(
              other,
              "POST",
              `${id}/fulfillments/${first}/mark-as-delivered`,
            )
          ).status,
        ).toBe(404);
        expect((await request(owner, "GET", `${id}/completion`)).data).toEqual({
          can_complete: false,
          pickup_fulfillment_ids: [],
          preparation_groups: [],
        });
        expect((await request(owner, "POST", `${id}/complete`)).status).toBe(
          400,
        );
        const partial = await request(
          owner,
          "POST",
          `${id}/fulfillments/${first}/mark-as-delivered`,
        );
        expect(partial.status).toBe(200);
        expect((await state(id)).status).toBe("pending");
        expect(
          Number((await state(id)).items![0]!.detail.delivered_quantity),
        ).toBe(1);
        const complete = await request(
          owner,
          "POST",
          `${id}/fulfillments/${second}/mark-as-delivered`,
        );
        expect(complete.status).toBe(200);
        expect(complete.data.order.status).toBe("completed");
        expect((await state(id)).status).toBe("completed");
        expect(
          Number((await state(id)).items![0]!.detail.delivered_quantity),
        ).toBe(2);
        expect(
          (
            await request(
              owner,
              "POST",
              `${id}/fulfillments/${second}/mark-as-delivered`,
            )
          ).status,
        ).toBe(200);
        expect(
          Number((await state(id)).items![0]!.detail.delivered_quantity),
        ).toBe(2);
      });
      it("allows completion of prepared physical pickup without shipment or delivery", async () => {
        const owner = await vendor();
        const sale = await fixture(owner);
        const pickup = await sale.prepare(0, 2, true);
        const id = sale.order.id;
        expect((await request(owner, "GET", `${id}/completion`)).data).toEqual({
          can_complete: true,
          pickup_fulfillment_ids: [pickup],
          preparation_groups: [],
        });
        expect(
          (
            await request(
              owner,
              "POST",
              `${id}/fulfillments/${pickup}/mark-as-delivered`,
            )
          ).status,
        ).toBe(400);
        expect((await request(owner, "POST", `${id}/complete`)).status).toBe(
          200,
        );
        expect((await state(id)).status).toBe("completed");
        expect(
          Number((await state(id)).items![0]!.detail.delivered_quantity),
        ).toBe(0);
      });
      it("automatically completes mixed pickup/shipping only after shipment delivery", async () => {
        const owner = await vendor();
        const sale = await fixture(owner, [
          { title: "Pickup item", quantity: 1, requires_shipping: true },
          { title: "Shipping item", quantity: 1, requires_shipping: true },
        ]);
        const pickup = await sale.prepare(0, 1, true);
        const shipment = await sale.prepare(1, 1, false);
        const id = sale.order.id;
        expect((await request(owner, "GET", `${id}/completion`)).data).toEqual({
          can_complete: false,
          pickup_fulfillment_ids: [pickup],
          preparation_groups: [],
        });
        expect((await request(owner, "POST", `${id}/complete`)).status).toBe(
          400,
        );
        expect(
          (
            await request(
              owner,
              "POST",
              `${id}/fulfillments/${shipment}/mark-as-delivered`,
            )
          ).status,
        ).toBe(200);
        expect((await state(id)).status).toBe("completed");
      });
      it("derives a preparation group from the persisted selected method before any fulfillment exists", async () => {
        const owner = await vendor();
        const sample = await fixture(owner);
        const pickupId = await sample.prepare(0, 2, true);
        const {
          data: [pickup],
        } = await getContainer()
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({
            entity: "fulfillment",
            fields: ["id", "shipping_option_id"],
            filters: { id: pickupId },
          });
        const {
          result: [order],
        } = await createCompletionOrdersWorkflow(getContainer()).run({
          input: {
            orders: [
              {
                currency_code: "usd",
                items: [
                  {
                    title: "Unprepared pickup",
                    quantity: 2,
                    unit_price: 0,
                    requires_shipping: true,
                  },
                ],
                shipping_methods: [
                  {
                    name: "Selected pickup",
                    amount: 0,
                    shipping_option_id: pickup.shipping_option_id!,
                  },
                ],
              },
            ],
          },
        });
        await createLinksWorkflow(getContainer()).run({
          input: [
            {
              [Modules.ORDER]: { order_id: order.id },
              [MercurModules.SELLER]: { seller_id: owner.sellerId },
            },
          ],
        });
        expect(
          (await request(owner, "GET", `${order.id}/completion`)).data,
        ).toEqual({
          can_complete: false,
          pickup_fulfillment_ids: [],
          preparation_groups: [
            {
              shipping_option_id: pickup.shipping_option_id,
              is_pickup: true,
              item_ids: [order.items![0].id],
            },
          ],
        });
      });
    },
  });
}
