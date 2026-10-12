# Refreshing persisted provider costs

`refresh-order-finance-provider-facts` refreshes the existing reporting sources
for one exact order group. It uses native finance authorization, immutable sale
snapshots, the execution lock, group ownership and provider-observation storage.
It does not create captures, refunds, transfers, reversals or payouts.

The command requires an existing operator ID, the exact order/group/cart IDs
and an audit reason. Inspection is the default and reads persisted reporting
sources only; it makes no Stripe requests and writes no journal records.

```powershell
pnpm exec medusa exec ./src/scripts/refresh-order-finance-provider-facts.ts --args=<order_id> --args=<group_id> --args=<cart_id> --args=<actor_id> --args="<reason>"
```

After reviewing the scope and coverage, repeat with `--args=--execute` to retrieve
provider observations through the existing Stripe reader and persist them.
Execution rechecks authorization and group state under the native execution
lock, claims only the free group and releases only its own ownership token.
An existing fence, review, writer, pending change or incomplete financial
operation rejects the refresh. Such cases require financial recovery first.

Each execution writes a `FinanceRecoveryAttempt` with action
`refresh_provider_observation` and an operation identifier beginning with
`provider-observation:`. It creates no monetary `commerce_operation`.
Interrupted refreshes retain their audit record. A failed ownership release
does not authorize replacing or clearing another writer's fence.

The result reports native facts, costs and coverage. A pending or unavailable
cost remains incomplete with unknown fee/net values. Refreshing does not make
Stripe funds available or turn an unobserved fee into zero.

Reversal costs accept their exact parent transfer as the balance transaction's
source only when the reversal already references that exact balance transaction.
Other movement kinds retain their existing source checks. Stripe documents the
reversal's [transfer and balance transaction relationships](https://docs.stripe.com/api/transfer_reversals/object)
and the [balance transaction source](https://docs.stripe.com/reports/balance-transaction-types).
The implementation keeps the installed Stripe 15.12.0 SDK and its default
2024-04-10 API version; no API upgrade is part of this correction.

That API can represent a partial capture as the gross authorized charge and a
separate release balance transaction. The reader accepts this representation
only when the raw charge, successful releases and every release balance
transaction have exact matching references and amounts. For example,
`4998 + (-2499) = 2499` keeps the capture fact at 2499 minor units while retaining
the actual gross balance transaction at 4998. Ordinary customer refunds cannot
justify this exception. Missing or inconsistent release evidence leaves the
cost unavailable; the release does not become a customer refund or credit line.

Run operational commands only in the coordinated target environment. This
document does not authorize an infrastructure change or a provider money write.
