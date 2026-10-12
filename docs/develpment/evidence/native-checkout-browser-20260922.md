# Native checkout browser verification — 2026-09-22

This is ongoing verification, not a financial readiness certificate.

## Environment and scope

- Isolated API 9010 and storefront 3010 in worktree `4af6`; the user's development services on 3000/7000/7001/9000 remain running separately.
- Native PostgreSQL fixture `closure_browser_*`, TLS localhost 55432; Redis TLS localhost 56379/DB15 reserved to this QA session. No shared database migrations or live keys.
- Native workflows created a US/USD region, two sellers, 31 products, category, stock, buyers and positive commission rules. The seed did not create carts, orders or payments.
- Stripe TEST configuration and fixture classification are injected only into the validated process. Credentials and onboarding links are held in an external ACL-restricted directory and are omitted from this evidence.

## Verified in the browser

- While the API was unavailable, the storefront retained its independent header, hero and footer and displayed a local catalog error with retry. Retry resolved after API startup.
- Category navigation yielded 12, 12 and 7 products: 31 unique product links, with the category preserved across pages.
- Product pages showed their native seller, USD 19.99 price and stock. Adding one product from each seller produced a two-item cart with subtotal USD 39.98. Shipping and taxes remained explicitly uncalculated.
- A fresh guest session reached the address form. An older QA origin with an invalid session remained blocked by authentication; the clean session used a separate loopback hostname.

## Defects found and disposition

1. Saving an address rejected a valid US/USD cart. An HTTP comparison using the installed SDK confirmed that appending scalar `customer_id` to the default relation projection removed native root defaults: `currency_code` and `total` were absent. Appending `+customer_id` retained USD and 39.98. Both retrieval and authenticated adoption were corrected in root `7060df8` (source `f81e1ab`); no currency guard was weakened. Five regression cases exercise the installed native query parser against the actual action. Web lint, typecheck and 191 tests passed in the source task. Further browser validation continues.
2. The controlled contact fields did not retain entered values. The phone control then produced a repeated maximum-update-depth error, traced through `usePhoneDigits.useEffect` to `UsPhoneInput`. A separate React reproduction confirmed deferred reads of `event.target.value` can lose the email when other state updates are batched. Correction and browser retest are pending; the phone cycle is not yet declared resolved.

## Stripe TEST status

Native setup created two TEST Connect accounts and generated their onboarding links; it did not force ACTIVE status. The first account completed the Stripe-hosted test onboarding using Stripe's test phone, code and bank autofill, without saving information in Link. The user explicitly approved accepting the connected-account terms for both fictitious accounts. The first flow returned to the local site; workflow refresh and the second onboarding remain pending.

No PaymentIntent, charge, transfer or refund has yet been produced by this browser round. Capture, settlement, refunds before/after transfer, induced failure/recovery, 3DS and payment retry scenarios remain unverified here. API unit gates and other HTTP suites are separate evidence and do not substitute for those checks.

## Continuation — 2026-09-26

The preceding status describes the earlier checkpoint. Both Connect test onboardings subsequently completed with the user's explicit terms approval; the native refresh returned ACTIVE for both. Address state was corrected in `45f96ec`/`87e4507` and retested successfully. Empty email/phone values in accessibility inspection alone were not evidence of lost values: screenshots and successful native persistence confirmed both fields. The source task passed web lint, typecheck and 193 tests.

The isolated API now uses native `medusa start` with `NODE_ENV=test`: `medusa develop` forcibly changed the child environment to development and was correctly rejected by the fixture-classification guard. No production guard was relaxed. The September 26 startup processed native order events without the historical Redis worker error.

Two distinct guest purchases were completed through the storefront, each with one USD 19.99 item from each seller and two USD 5 shipping methods. Each purchase produced exactly two native orders of USD 24.99 and emptied the UI cart. Read-only PostgreSQL and Stripe checks confirmed two payment sessions `authorized` and two manual PaymentIntents `requires_capture`, each USD 49.98 capturable and zero received. No capture or transfer is claimed by this milestone.

The second purchase exercised Stripe's documented test cases: an insufficient-funds card was rejected with a Spanish retry message, without orders or capturable funds for that cart. A 3DS-required test card opened the hosted test challenge; cancellation returned an authentication error while preserving the cart and totals. Retrying the same purchase and completing the challenge produced its two orders. Exactly four orders existed across the two purchases, with no duplicate completion from these retries. Test values came from [Stripe's testing documentation](https://docs.stripe.com/testing).

The receipt still showed `Sin pagar` despite confirmed authorization. Source inspection identified the two Store wrappers delegating to Medusa instead of Mercur's native cart-payment normalization for split orders; F05 is correcting and testing that delegation. Therefore the receipt's payment label is not a PASS yet.

Screenshots are retained outside Git in the private QA workspace: `browser-native-confirmation-20260926.png`, `browser-native-decline-20260926.png`, `browser-native-3ds-cancel-20260926.png`, and `browser-native-3ds-confirmation-20260926.png`. The old vendor browser tab could not be reopened because its error-page protocol was blocked by browser policy; no workaround was attempted. Native backend fulfillment and financial verification remain the next steps.

The receipt correction was integrated as `fa70e58` (source `aa5d045`). After restarting only QA API 9010, the existing second receipt showed `Autorizado` for both orders and explicitly stated that capture remained pending. The user opened a new valid vendor login tab; sign-in succeeded and seller 1 saw exactly its two orders. The first order detail showed its native fulfillment as prepared, `Pago autorizado`, USD 24.99 allocated and zero captured/refunded. Both first-purchase orders were fulfilled through the native vendor SDK route, without capture. Screenshots: `browser-native-confirmation-authorized-20260926.png` and `browser-native-vendor-authorized-20260926.png`.

Root web lint, typecheck and 193 tests passed on September 26. The financial inspection helper still stopped before financial operations: first on Medusa's injected project retry callback (corrected in `ff4b39c` with 18 real-config tests), then on a module configuration key outside its allowlist. The second rejection is under investigation; no capture, refund or transfer is claimed yet.

### First reconciled Stripe TEST cycle — September 26, 18:49 UTC

The second guard issue was traced by a sanitized runtime probe to Medusa's injected SQL metadata on the native event bus. `642a9f9` admits only that native shared configuration, with 10 bootstrap regression cases and 127 preceding guard tests passing in the source task. Root additionally passed 51 receipt/projection/config tests. Native financial inspection then succeeded against the running fixture.

The first UI purchase completed capture of USD 49.98, allocated as USD 24.99 to each order. Its target order retained original gross/commission/seller amounts of 24.99/2.00/22.99 throughout. A USD 2 refund before settlement reduced the seller entitlement by 1.84 and returned commission of 0.16. Settlement created a single USD 21.15 Connect transfer. A USD 3 refund afterward created a USD 2.76 reversal and returned a further 0.24 commission. Cumulative refund was USD 5, net seller transfer USD 18.39; the sibling remained fully captured and untouched.

Each native helper compared provider movements with native payment/refund records and immutable originals, then repeated its successful request to confirm no duplicate movement. All four phases exited 0 with `verified`, no pending changes, financial problems or active fences. External logs/checkpoints use prefixes `normal-capture-1`, `normal-refund-before-1`, `normal-settle-1`, and `normal-refund-after-1`. This is effective Stripe TEST evidence, distinct from unit simulations. Interruption/recovery, partial capture, cumulative full refunds and final cost/reporting reconciliation remain pending.

### Recovery and partial capture — September 26, 18:57 UTC

The normal sibling's native settlement process deliberately exited 86 after Stripe confirmed its USD 22.99 transfer and before native payout persistence. A synced private checkpoint recorded the response and dead writer identity. The admin UI blocked further financial operations with a reconciliation message. The general recovery CLI inspected the existing transfer and proposed only `adopt_payout` and `link_payout`. Execution with that exact plan hash and explicit stopped-writer release completed successfully, released the fence and reported no pending provider observation. The admin UI then restored its permitted operations. Original settlement-request replay remains a separate pending check. Screenshots: `browser-native-admin-interrupted-20260926.png` and `browser-native-admin-recovered-20260926.png`.

For the second purchase, the target had been prepared through vendor UI. Its unfulfilled sibling was canceled through the native finance workflow before capture, with zero refunded. Partial capture then received exactly USD 24.99; the active target owns the full amount, the canceled sibling owns zero and no capturable balance remains. Stripe's release of the unused USD 24.99 authorization is explicitly excluded from refunds of captured money. Cancellation and capture both passed native/provider assertions and exact-request replays (`partial-cancel-1` and `partial-capture-1`, exit 0). No transfer has been created for this group.

### Centavo regression discovered — September 26, 19:08 UTC

The original F08 settlement request replay subsequently passed without a new transfer. Changing only the fixture's scoped commission rule from 10% to 12% and refreshing all four orders also passed: original snapshots, commission lines and financial effects remained unchanged.

The first USD 0.01 extension refund then stopped in an uncertain state. Read-only inspection confirmed its Stripe refund and USD 0.01 transfer reversal, a native payment refund and a native order transaction of -0.01; no matching credit line exists. Both provider references are already persisted in the operation. No request was retried and the remainder of the extension was not executed.

The latest PostgreSQL order summary (version 4) stores `pending_difference=0.01` and raw value `0.01`. The native Query projection used by credit-line creation returns both values as zero, for singular/plural order entities and with cache enabled or disabled. The native credit validator accepts 0.01 against 0.01 in the independent offline reproduction; this difference in the read path is the current defect under investigation. The active group fence correctly blocks further operations until reconciliation. Logs: `normal-extension-execute-1`, `normal-finance-inspect-after-cent-1`, `credit-summary-inspect-1`; the private extension receipt retains all original request IDs for deliberate continuation after correction. This remains a FAIL/pending recovery, not completed centavo or financial readiness evidence.

### Exact-cent recovery — September 26, 19:40 UTC

The native projection correction was integrated in `101cfa8`, followed by the repeat-application guard in `5b488cd`; pnpm-generated lock updates are `b6edbca` and `44fa527`. The installed inner patch contains exactly one credit correction in both root and QA. Eight native offline regressions pass in both installations, including the existing Mercur shipping patch, preloaded core-flows, invalid-credit rejection, the native hook and compensation. No currency epsilon was changed.

Fresh recovery inspection proposed only `create_credit_line`, referencing the existing refund and reversal. Execution with the exact plan hash completed at 19:39:37 UTC: state `complete`, fence released, no provider observation pending. The continuation's independent provider/native accounting oracle then verified refunded USD 5.01, the exact first request completed, original snapshots unchanged and no effects for the remaining seven request IDs. Logs: `normal-cent-recovery-inspect-2`, `normal-cent-recovery-execute-1`, `normal-cent-continuation-inspect-1`. The remaining sequence is a separate pending check; the recovery did not repeat the Stripe refund or reversal.
