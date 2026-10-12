/**
 * SEARCH_IMAGE_TESTS=disposable-local opts into the reserved TLS PostgreSQL
 * and Redis environment. Native product workflows and product graph reads
 * remain real; search hits and seller/region/offer discovery are local fixtures.
 * No external Algolia, payment, notification or storage provider is loaded.
 */
import { randomUUID } from "node:crypto";
import { asValue } from "@medusajs/framework/awilix";
import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  batchVariantImagesWorkflow,
  createProductsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/core-flows";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { SearchResponse } from "algoliasearch";
import { StoreSearchProductsSchema } from "../../src/api/store/products/search/validators";
import { ALGOLIA_MODULE } from "../../src/modules/algolia";
import { searchProducts } from "../../src/workflows/algolia/search-products";
import {
  assertLifecycleBootstrap,
  isolatedCheckoutLifecycleEnvironment,
} from "../helpers/checkout-lifecycle-fixture";

if (process.env.SEARCH_IMAGE_TESTS !== "disposable-local") {
  describe.skip("Search product images (requires disposable-local opt-in)", () => {
    it("requires reserved isolated PostgreSQL and TLS Redis", () => {});
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
    testSuite: ({ getContainer }) => {
      it("returns persisted general and assigned gallery images without a thumbnail, preserves an empty gallery and excludes draft hits", async () => {
        const container = getContainer();
        const imageUrl = `http://localhost:1/search-image-${randomUUID()}.jpg`;
        const secondImageUrl = `http://localhost:1/search-image-${randomUUID()}.jpg`;
        const variantImageUrl = `http://localhost:1/search-variant-image-${randomUUID()}.jpg`;
        const { result: products } = await createProductsWorkflow(
          container,
        ).run({
          input: {
            products: [
              {
                title: "Published gallery image",
                status: ProductStatus.PUBLISHED,
                images: [
                  { url: imageUrl },
                  { url: secondImageUrl },
                  { url: variantImageUrl },
                ],
              },
              {
                title: "Published without images",
                status: ProductStatus.PUBLISHED,
                images: [],
              },
              {
                title: "Draft gallery image",
                status: ProductStatus.DRAFT,
                images: [{ url: imageUrl }],
              },
            ].map((product) => ({
              ...product,
              handle: `search-image-${randomUUID()}`,
              thumbnail: null,
              options: [{ title: "Presentation", values: ["One"] }],
              variants: [
                {
                  title: "One",
                  options: { Presentation: "One" },
                  manage_inventory: false,
                  prices: [],
                },
              ],
            })),
          },
        });
        const [withImage, withoutImage, draft] = products;
        // Native creation derives a thumbnail from the first image. Clear it
        // through the native update flow to reproduce the persisted gallery case.
        await updateProductsWorkflow(container).run({
          input: {
            products: products.map((product) => ({
              id: product.id,
              thumbnail: null,
            })),
          },
        });
        const nativeQuery = container.resolve(ContainerRegistrationKeys.QUERY);
        const { data: galleryProducts } = await nativeQuery.graph({
          entity: "product",
          fields: ["id", "images.id", "images.url", "variants.id"],
          filters: { id: withImage.id },
        });
        const gallery = galleryProducts[0];
        const assignedImage = gallery.images.find(
          (image) => image.url === variantImageUrl,
        )!;
        const variant = gallery.variants[0];
        await batchVariantImagesWorkflow(container).run({
          input: { variant_id: variant.id, add: [assignedImage.id] },
        });
        const scope = container.createScope() as MedusaContainer;

        scope.register({
          [ContainerRegistrationKeys.QUERY]: asValue({
            graph: async (...args: Parameters<typeof nativeQuery.graph>) => {
              const [configuration] = args;
              switch (configuration.entity) {
                case "region":
                  return {
                    data: [
                      {
                        id: "region_fixture",
                        currency_code: "usd",
                        countries: [{ iso_2: "us" }],
                      },
                    ],
                  };
                case "seller":
                  return {
                    data: [{ id: "seller_fixture", name: "Fixture seller" }],
                  };
                case "offer":
                  return {
                    data: products.map((product) => ({
                      product_id: product.id,
                    })),
                  };
                default:
                  // Product hydration and its published-status filter use real
                  // Medusa queries, including all gallery relation selection.
                  return nativeQuery.graph(...args);
              }
            },
          }),
          [ALGOLIA_MODULE]: asValue({
            search: async (): Promise<SearchResponse<{ id: string }>> => ({
              hits: products.map((product) => ({
                id: product.id,
                objectID: `${product.id}:all`,
              })),
              nbHits: products.length,
              nbPages: 1,
              page: 0,
              hitsPerPage: 24,
              facets: {
                category_ids: {},
                seller_ids: { seller_fixture: products.length },
              },
            }),
          }),
        });

        try {
          const response = await searchProducts(
            {
              ...StoreSearchProductsSchema.parse({
                region_id: "region_fixture",
              }),
              sales_channel_ids: ["sales_channel_fixture"],
            },
            scope,
          );

          expect(response.products.map((product) => product.id)).toEqual([
            withImage.id,
            withoutImage.id,
          ]);
          const galleryProduct = response.products.find(
            (product) => product.id === withImage.id,
          );
          expect(galleryProduct?.thumbnail).toBeNull();
          expect(galleryProduct?.images).toEqual([
            expect.objectContaining({
              id: expect.any(String),
              url: imageUrl,
              variants: [],
            }),
            expect.objectContaining({
              id: expect.any(String),
              url: secondImageUrl,
              variants: [],
            }),
            expect.objectContaining({
              id: assignedImage.id,
              url: variantImageUrl,
              variants: [expect.objectContaining({ id: variant.id })],
            }),
          ]);
          const emptyGalleryProduct = response.products.find(
            (product) => product.id === withoutImage.id,
          );
          expect(emptyGalleryProduct?.thumbnail).toBeNull();
          expect(emptyGalleryProduct?.images).toEqual([]);
          expect(
            response.products.some((product) => product.id === draft.id),
          ).toBe(false);
          expect(container.resolve(ContainerRegistrationKeys.QUERY)).toBe(
            nativeQuery,
          );
          expect(container.hasRegistration(ALGOLIA_MODULE)).toBe(false);
        } finally {
          await scope.dispose();
        }
      });
    },
  });
}
