import {
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http";
import { FeatureFlag, MedusaError } from "@medusajs/framework/utils";
import { customerAccountMiddlewares } from "./store/customer-account/middlewares";
import { favoriteMiddlewares } from "./store/customers/me/favorites/middlewares";
import { vendorApplicationMiddlewares } from "./store/vendor-application/middlewares";
import { vendorInventoryMiddlewares } from "./vendor/inventory-adjustments/middlewares";
import { vendorCatalogMiddlewares } from "./vendor/catalog/middlewares";
import { vendorCatalogImageMiddlewares } from "./vendor/catalog-images/middlewares";
import { vendorStripeAccountRefreshMiddlewares } from "./vendor/stripe-account-refresh/middlewares";
import { vendorPaymentProtectionMiddlewares } from "./vendor/payments/middlewares";
import { vendorShippingConfigurationMiddlewares } from "./vendor/shipping-configuration/middlewares";
import { vendorWarehouseMiddlewares } from "./vendor/warehouse/middlewares";
import { productSaleStatusMiddlewares } from "./vendor/product-sale-status/middlewares";
import { productLifecycleMiddlewares } from "./vendor/product-lifecycle/middlewares";
import { storeProductSaleStatusMiddlewares } from "./store/product-sale-status/middlewares";
import { performanceTrace } from "../lib/performance/http-trace";
import { nativeStripePayoutWebhookGuard } from "../lib/stripe-connect/native-guards";
import { vendorOfferPriceMiddlewares } from "./vendor/offers/[id]/price/middlewares";
import { algoliaMiddlewares } from "./store/products/search/middlewares";
import { vendorOrderStageMiddlewares } from "./vendor/orders/middlewares";
import { vendorOrderNotificationsMiddlewares } from "./vendor/order-notifications/middlewares";
import { vendorCatalogNotificationsMiddlewares } from "./vendor/catalog-notifications/middlewares";
import { vendorNotificationsMiddlewares } from "./vendor/notifications/middlewares";
import { adminNotificationsMiddlewares } from "./admin/notifications/middlewares";
import { adminOverviewMiddlewares } from "./admin/overview/middlewares";
import { orderFinanceMiddlewares } from "./order-finance-middlewares";
import { googleAuthMiddlewares } from "./auth/google/complete/middlewares";
import { googleOneTapMiddlewares } from "./auth/google/one-tap/transaction/middlewares";
import { vendorSessionMiddlewares } from "./auth/vendor-session/middlewares";
import { commissionFinanceMiddlewares } from "./commission-finance-middlewares";
import { paymentCaptureSettingsMiddlewares } from "./admin/payment-capture-settings/middlewares";
import { paymentReleaseSettingsMiddlewares } from "./admin/payment-release-settings/middlewares";
import { storeCartOwnershipMiddlewares } from "./store/cart-ownership/middlewares";
import { storeCartPricingMiddlewares } from "./store/cart-pricing/middlewares";
import { financeReportingMiddlewares } from "./finance-reporting/middlewares";
import { catalogPermissionMiddlewares } from "./catalog-permission-middlewares";
import { adminCatalogManagementMiddlewares } from "./admin/catalog-products/middlewares";
import { adminCustomerPurchasesMiddlewares } from "./admin/customer-purchases/middlewares";
import { accountEmailVerificationMiddlewares } from "./auth/account/email-verification/middlewares";
import { googlePanelProfileMiddlewares } from "./auth/account/profile/google/middlewares";
import { orderTrackingMiddlewares } from "./store/order-tracking/middlewares";
import { orderTrackingClaimMiddlewares } from "./store/order-tracking/claim/middlewares";
import { orderAftersalesMiddlewares } from "./store/order-aftersales/middlewares";
import { spamProtectionMiddlewares } from "../lib/spam-protection/middleware";

const requireSellerRegistrationFlag = (
  _req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  if (!FeatureFlag.isFeatureEnabled("seller_registration")) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Seller registration is disabled.",
    );
  }

  next();
};

export default defineMiddlewares({
  routes: [
    ...spamProtectionMiddlewares,
    ...orderAftersalesMiddlewares,
    ...orderTrackingClaimMiddlewares,
    ...orderTrackingMiddlewares,
    ...googlePanelProfileMiddlewares,
    ...accountEmailVerificationMiddlewares,
    ...adminCustomerPurchasesMiddlewares,
    ...adminCatalogManagementMiddlewares,
    ...catalogPermissionMiddlewares,
    ...commissionFinanceMiddlewares,
    ...paymentCaptureSettingsMiddlewares,
    ...paymentReleaseSettingsMiddlewares,
    ...storeCartOwnershipMiddlewares,
    ...storeCartPricingMiddlewares,
    ...financeReportingMiddlewares,
    ...googleAuthMiddlewares,
    ...googleOneTapMiddlewares,
    ...vendorSessionMiddlewares,
    {
      matcher: /^\/(?:store|admin|vendor)(?:\/.*)?$/,
      middlewares: [performanceTrace],
    },
    ...vendorApplicationMiddlewares,
    ...vendorInventoryMiddlewares,
    ...vendorCatalogMiddlewares,
    ...vendorOfferPriceMiddlewares,
    ...vendorCatalogImageMiddlewares,
    ...vendorStripeAccountRefreshMiddlewares,
    ...vendorPaymentProtectionMiddlewares,
    ...orderFinanceMiddlewares,
    ...vendorShippingConfigurationMiddlewares,
    ...vendorWarehouseMiddlewares,
    ...vendorOrderStageMiddlewares,
    ...vendorOrderNotificationsMiddlewares,
    ...vendorCatalogNotificationsMiddlewares,
    ...vendorNotificationsMiddlewares,
    ...adminNotificationsMiddlewares,
    ...adminOverviewMiddlewares,
    ...productSaleStatusMiddlewares,
    ...productLifecycleMiddlewares,
    ...storeProductSaleStatusMiddlewares,
    ...customerAccountMiddlewares,
    ...favoriteMiddlewares,
    ...algoliaMiddlewares,
    {
      matcher: "/hooks/payout",
      method: "POST",
      bodyParser: { preserveRawBody: true, sizeLimit: "256kb" },
      middlewares: [nativeStripePayoutWebhookGuard],
    },
    {
      matcher: "/vendor/sellers",
      method: "POST",
      middlewares: [requireSellerRegistrationFlag],
    },
  ],
});
