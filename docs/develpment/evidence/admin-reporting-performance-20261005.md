# Admin financial report performance — 2026-10-05

## Change and measured cause

The previous authenticated `/admin/finance/reporting` read took 86,406.96 ms in
the current local environment. It repeatedly retrieved complete native financial
views for each group, including revision verification. Its request trace included
33 order-group reads, 32 order links, 32 seller payouts and 32 order-change reads.

The endpoint now reads the private `admin_finance_reporting_projection` registry
and applies the existing financial aggregation. The seller reconciliation worker
already reads complete group evidence; it now persists that evidence privately
for operators in the same transaction as the redacted seller projections.
No new financial arithmetic, provider calls or monetary actions were introduced.

Recorded authenticated API responses after preparation: 743.95, 1,291.03,
443.22 and 636.74 ms. A separate read-only comparison measured the registry and
aggregation at 224–229 ms versus 61,429 ms for its native source reads. Browser
report responses were 4.91–5.77 seconds during development compilation and
1.28 seconds for a subsequent response. These measurements cover this environment's
11 groups and 16 grouped seller orders, not a guarantee for larger histories.

## Freshness and preparation

Migration `Migration20261005141208` creates the private table with RLS, object
validation and revoked public, anonymous and authenticated database access.
Semantic source revisions include references, invalidation tokens, journal
state, original snapshots, operations, provider facts and referenced costs.
Concurrent changes prevent committing a mismatched projection. Both projections
roll back together when either guard fails.

Unavailable, changed or unsafe groups produce unknown totals and an explicit
preparation warning. Verified records do not become financially invalid merely
because a scheduling TTL elapsed. Missing historical classifications, source
observations and provider fees retain their existing coverage warnings.
SSE notifications refresh the view using the existing single connection.

The table was migrated and all 11 groups prepared in the current environment.
Other environments need their normal migration and an initial preparation run:

```powershell
pnpm --filter @usapeek/api exec medusa exec ./src/scripts/prepare-admin-finance-reporting.ts
```

Preparation uses the existing workflow and lock, defaults to 25 bounded batches,
and can be repeated. It stores read models only. The minute worker evaluates
1–2 groups per run; a large cold history needs dedicated preparation rather
than waiting for that schedule. The existing 2,000-group reporting limit remains;
exceeding it marks the report truncated and keeps totals unknown. Semantic SQL
work grows with the number and size of groups.

## Validation

- Read-only native comparison: four periods × ordinary/QA data, eight checks.
  Known totals, each sale's amounts and coverage match. Tied capture timestamps
  are compared by order identity because discovery traversal order can differ.
- 24 focused reader, registry, cancellation and shared-request tests.
- Isolated TLS PostgreSQL: six Admin projection tests and ten Vendor projection
  tests, including changes to costs, concurrent writes, rollback and access revokes.
- 37 nearby HTTP tests and 21 nearby settlement PostgreSQL tests.
- 20 nearby Admin tests; Admin/API lint, typecheck and builds passed. API lint
  retains 58 existing warnings and no errors.
- Browser verification: report and period changes resolve successfully with
  the real figures and coverage warnings; independent statistics remain visible.

This is performance and reporting-projection evidence. It does not replace the
separate final financial validation or certify production/live payments.
