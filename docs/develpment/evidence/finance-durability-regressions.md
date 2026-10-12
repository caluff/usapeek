# Finance durability integration regressions

These opt-in suites keep PostgreSQL persistence, native Medusa/Mercur workflows
and application code real. All Stripe HTTPS traffic is intercepted by an
explicit in-memory provider ledger; unexpected HTTPS destinations and endpoints
fail closed. No test claims live Stripe delivery, real authorization expiry,
provider costs or an operating-system process crash.

`finance-effect-durability.spec.ts` covers nine cases:

- An authorized, natively fulfilled two-seller purchase encounters a simulated
  Stripe authorization in `canceled` state with zero capturable amount. The
  authenticated admin finance POST must reject before capture or monetary
  journal reservation, preserve original allocations, and persist no captures,
  refunds or payouts. This exercises the observed provider state, not a fake
  clock standing in for Stripe's authorization deadline.
- A provider refund succeeds but its response is lost; native compensation
  removes the provisional refund. Recovery must adopt the exact provider refund
  and finish accounting without issuing another refund.
- The journal becomes unavailable after the refund or reversal effect. Real
  persisted checkpoints and the durable fence must allow recovery without
  repeating that effect.
- An attempted refund or reversal is absent from provider observation. Recovery
  and replay must refuse further money requests while preserving the fence.
- A completed operation loses its response before or after fence release.
  Recovery/replay must return the persisted result without duplicate money.
- Read-only cost inspection performs no provider requests or persistence. Two
  native observation refreshes must retain the same provider fact IDs, create
  separate complete audit attempts and preserve all economic effects. Missing
  balance transactions retain incomplete costs.

The refund cases retain frozen USD 70/30 allocations and an 8% commission.
Their USD 20 refund reduces commission by USD 1.60 and seller entitlement by
USD 18.40, without changing the sibling order. Tests check native refunds,
transactions, credit lines, provider identities, journal state and replay.
Provider balance transactions are omitted, so these fixtures do not establish
confirmed processing costs.

`stripe-webhook-durability.spec.ts` covers two cases through the native Connect
HTTP route, signature verification, Redis event bus, subscriber, workflow,
account lock and PostgreSQL persistence. Duplicate and reordered
`account.updated` deliveries must converge on the currently observed provider
account without duplicate accounts, links or payouts. Forged signatures and
wrong account bindings must be rejected before enqueue or persistence. That
route does not handle refund or transfer reconciliation.

`payment-webhook-durability.spec.ts` adds two cases through the native payment
HTTP route, signature verification, Redis subscriber and payment workflow. A
native authorized/fulfilled fixture is captured by the finance workflow, which
persists the operation marker. Duplicate success events with that marker must
return `NOT_SUPPORTED`; a reordered authorization event reaches the native
payment workflow against the existing capture. Every delivery must preserve
originals, journal rows, captures, refunds, transactions and credit lines, with
no additional provider POST.

All three suites load the installed Stripe Connect ESM provider through a
test-only VM adapter after their environment guards and before migrations.
Jest 29 cannot use Medusa 2.18's require-based import for that ESM package. The
adapter evaluates the unchanged installed source with its real dependencies
and supplies the supported provider-definition object to the native loader.
An offline regression reproduces the original import failure and verifies
native registration, HMAC validation and current account reads without sockets.
The runner also clears local database driver options, so a separate guarded
adapter restores certificate-verified TLS before the native PG loader runs.
Every suite still verifies `pg_stat_ssl.ssl = true` on its actual connection.

## Execution boundary

All runners require the isolated TLS importer, a random disposable PostgreSQL
database and exclusive Redis `localhost:56379/15`. Stop the isolated QA API and
reserve the infrastructure through its coordinator before any runner. Run
them sequentially from `packages/api`, with the relevant opt-in set to
`disposable-local`:

```powershell
$env:FINANCE_EFFECT_DURABILITY_TESTS = 'disposable-local'
pnpm test:integration:http --runTestsByPath integration-tests/http/finance-effect-durability.spec.ts

$env:STRIPE_WEBHOOK_DURABILITY_TESTS = 'disposable-local'
pnpm test:integration:http --runTestsByPath integration-tests/http/stripe-webhook-durability.spec.ts

$env:PAYMENT_WEBHOOK_DURABILITY_TESTS = 'disposable-local'
pnpm test:integration:http --runTestsByPath integration-tests/http/payment-webhook-durability.spec.ts
```

The original finance and Connect sources passed TypeScript and targeted ESLint
(zero errors; fixture warnings). Offline smoke checks used
the real Stripe SDK, allocated payment provider, reversal logic and provider-fact
reader over the simulated transport: canceled authorization was observed by GET
with zero POSTs; refund/replay, reversal and four movement facts were read
without an unexpected endpoint. Those facts retained explicit incomplete costs.

The payment smoke used the real SDK, provider and subscriber and observed
`NOT_SUPPORTED`, `AUTHORIZED`, `NOT_SUPPORTED`, `NOT_SUPPORTED` without an
additional POST. Its workflow engine was an observer; this smoke does not
establish execution of the native payment workflow or HTTP/Redis/PG behavior.

The coordinator executed all thirteen cases successfully on 2026-09-26:
Connect 2/2, followed by finance 9/9 and payment webhooks 2/2. The runners
verified PostgreSQL TLS, used the reserved Redis database and retained native
HTTP handlers, workflows and persistence. The initial failed runs exposed
runner ESM/TLS configuration and fixture/oracle defects, which were corrected
before these successful runs.

Stripe transport remained simulated throughout these suites. These results do
not establish live Stripe webhook delivery, elapsed authorization expiry or an
operating-system process crash. Full API completion checks are recorded by the
coordinator separately from these focused integration results.
