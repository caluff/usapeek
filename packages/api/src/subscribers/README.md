# Event subscribers

| Subscriber                       | Responsibility                                                       |
| -------------------------------- | -------------------------------------------------------------------- |
| `auth-verification-requested.ts` | Auth verification notifications through the shared email adapter.    |
| `auth-password-reset.ts`         | Password-reset notifications through the same adapter.               |
| `algolia-catalog-changed.ts`     | Search projections after catalog, offer, seller and related changes. |
| `order-shipped.ts`               | Shipment notification workflow for native shipment-created events.   |
| `order-confirmed.ts`             | Order confirmation with a private guest tracking link after native order placement. |
| `order-prepared-capture.ts` | Reviews the shared purchase on native fulfillment/cancellation events; captures only when Automatic mode and every financial/preparation guard allow it. |
| `order-completed-settlement.ts`  | Observes completed orders through a workflow and records an immutable settlement clock with the configured delay whenever the safe TEST integration is available, including Manual release mode. |
| `vendor-settlement-order-changed.ts` | Invalidates the seller settlement read model after native order changes; reconciliation stays in the background worker. |
| `vendor-finance-reporting-changed.ts` | Registers native order references and invalidates the seller financial-report read model after group creation and native order changes; financial source verification stays in the background worker. |

Installed Mercur/Medusa packages also register subscribers; these files are not
the entire event graph. Inspect native consumers before extending events that
affect money, orders or inventory.

Email uses the [Resend provider](../modules/resend/README.md) and persisted
deduplication adapter. Vendor application emails are drained from the local
outbox by a [job](../jobs/README.md). Algolia also has scheduled reconciliation
for missed events and time-dependent visibility.

Both normal Medusa checkout and the installed Mercur split checkout emit
`order.placed` for each created order. Order confirmation uses that event once
per order; it does not also subscribe to `order_group.created`. Delivery runs
asynchronously through a workflow, so a provider failure retries on the existing
event bus without failing checkout. Confirmation and shipment emails open the
same private tracking view without requiring a customer account.

Retries must retain stable event/operation identity. Provider acceptance differs
from confirmed delivery or fully reconciled persistence. The
[development audit](../../../../docs/develpment/development-completion-audit.md)
records financial recovery and idempotency limits.

Automatic settlement uses the persisted Pagos release mode (legacy environment
flag only before the first saved choice). Completion observation continues in
Manual mode with a safe TEST integration and retains the first clock across
event retries and mode changes. The configured 0–365-day delay (default 3) only
applies to new observations; existing clocks retain their deadlines. It never
transfers money in the subscriber. The
[settlement job](../jobs/README.md) performs fresh checks and invokes the existing
financial executor after the retention expires. Changed order versions and
ambiguous money operations remain for manual review.
