# Scheduled jobs

| Job                                   | Schedule         | Gate and behavior                                                                                                |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `reconcile-search.ts`                 | Every 15 minutes | Returns if Algolia is not registered; otherwise synchronizes products.                                           |
| `reconcile-automatic-captures.ts` | Every minute | When Pagos is set to Automatic, resumes a durable scan of up to 25 purchases and uses the guarded finance workflow to capture fully prepared active orders. Manual mode and uncertain operations are skipped. |
| `vendor-application-notifications.ts` | Every minute     | Requires enabled email; drains up to 20 successful deliveries, stopping at an empty claim or failure.            |
| `evaluate-commerce.ts`                | Every 15 minutes | Requires `STRIPE_AUTOMATIC_JOBS_ENABLED=true` and valid TEST Connect configuration before invoking its workflow. |
| `automatically-settle-orders.ts`      | Every minute     | Requires saved Automatic release mode, valid TEST Connect and general commerce jobs disabled; settles verified orders after their immutable recorded delay. |
| `reconcile-vendor-settlements.ts`     | Every minute     | Updates the seller's persisted pending-settlement read model from existing financial records. Uses a dedicated lock and bounded sequential batches; never captures, refunds or transfers funds. |
| `reconcile-vendor-finance-reporting.ts` | Every minute | Discovers native order references by durable pages and refreshes up to two groups of the seller and private operator financial-report read models under one dedicated lock. Shared native evidence is read once per group; both projections commit atomically. It preserves verified source timestamps and never executes financial movements. |

General commerce evaluation remains disabled by default. Enabling its environment flag
does not complete capture, payout or recovery:
[configuration.ts](../lib/commerce-automation/configuration.ts) has additional
code gates and [runner.ts](../lib/commerce-automation/runner.ts) retains pending
integration boundaries. Keep `STRIPE_AUTOMATIC_JOBS_ENABLED=false` while following the
[development plan](../../../../docs/develpment/development-implementation-plan.md).

Automatic settlement is selected in Pagos → Liberaciones → Modo de liberación.
The native Store metadata choice is shared by API and worker; without a saved
choice, `STRIPE_AUTOMATIC_SETTLEMENT_ENABLED` provides the legacy initial mode.
Apply the `order_completion` migrations, including `Migration20261006171340`, before using this feature. Valid TEST
Connect and `STRIPE_AUTOMATIC_JOBS_ENABLED=false` remain mandatory. A running
worker/shared process checks up to 25
due orders per minute, continuing after blocked orders and wrapping its durable
cursor. A backlog can delay execution beyond the deadline; it never advances it.

The `order.completed` subscriber records a server-owned, immutable completion
clock after checking the current native order, when that TEST integration is
available and the order has an original financial snapshot, including Manual
mode. Switching modes preserves the clock; enabling Automatic includes earlier
clocked orders already due. Pagos accepts a delay of 0–365 whole days (default 3),
with Immediate/3 days/One week presets and an adjacent numeric field. Each day is
24 elapsed hours, including weekends;
zero means eligible immediately and processed by the next normal cycle.
The delay is frozen with the first server observation under the payment-settings
lock. Only later observations use a newly saved delay; retries and existing clocks
retain their stored `release_delay_days` and deadline. Legacy clocks receive 3
without rewriting their instants. PostgreSQL verifies the exact elapsed delta,
and rejects rollback if any clock uses another delay.
Event delivery delays can extend the wait, never shorten
it. Replayed events preserve the clock, including a lost persistence response.
Existing completed orders without a clock are not backfilled from `updated_at`
and remain available for manual review.

The observed order's `updated_at` is stored only as a version check, never as the
start of the retention. If it differs at settlement, automatic execution stops
for manual review. This also covers an event published before an exceptional
native workflow rollback and later completion. Any later update to the order,
including repeating completion, conservatively requires manual review.

Settlement reuses the manual financial executor, execution lock, unique payout
operation and stable Stripe idempotency key. It verifies completed status,
preparation/shipping, an active seller and Connect account, full capture,
attributable refunds, pending changes, disputes and reconciliation holds before
moving money. An uncertain operation stays held for operator reconciliation.
Successful manual payouts are never duplicated by the scheduler. Its scan
excludes orders with any payout operation, including processing/uncertain ones.
Pre-existing execution writers or group holds also prevent automatic takeover.

Both payment-setting editors and the full automatic financial execution share
an owner-bound lock without expiry. An in-flight operation conflicts with mode
changes. A crashed process can leave this lock held: inspect its operations and
prove all writers stopped before explicit recovery; never take it over by age.
The native HTTP Store update rejects metadata replacement, including empty/null
metadata, so it cannot erase or bypass either payment setting.

This transfers the net entitlement to the seller's Stripe TEST Connect balance.
The connected account's bank payout schedule is separate. LIVE activation and
migrations against shared databases require explicit authorization.

Jobs invoke workflows instead of owning business mutations. Ambiguous financial
outcomes retain durable claims for reconciliation. Notification and search
READMEs describe their separate retry/consistency behavior.

API and worker share persistence. [Package scripts](../../package.json) set their
runtime modes; a job file does not prove that a remote worker is running.
