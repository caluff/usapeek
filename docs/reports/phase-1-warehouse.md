# Phase 1 warehouse implementation

> **Informe histórico.** Sus resultados corresponden únicamente a la revisión, fecha y entorno descritos en el cuerpo original. No certifica el estado actual ni el cierre financiero. Consultar la [auditoría de cierre](../develpment/development-completion-audit.md), el [progreso](../develpment/development-progress.md) y las [guías vigentes](../README.md).

Date: 2026-09-05. This report covers the dispatched warehouse work only. Shared
registration, dependency repair, migration generation/application, and completion
builds belong to the coordinator; no shared database writes were performed.

## Implemented behavior

- Approval journals the native seller, reserves a durable `vendor_warehouse`
  ownership claim, and records its ID on the approval mutation before creating
  any location. The claim uses an unconditional unique seller ID and location ID.
- The warehouse address comes from the submitted revision selected for approval,
  validated with the existing US address and canonical US phone validator. It
  never reads the editable application draft or current seller business address.
  The migration makes the submission snapshot immutable while approval is
  processing and after approval, and makes warehouse ownership/source immutable.
- Stock Location creation uses a deterministic caller-supplied primary key.
  Lost create and seller-link responses are read back by that ID. Metadata is
  an additional ownership check, never the uniqueness constraint.
- The native Stock Location module and native Mercur seller/location link are
  reused. No shipping profile, fulfillment provider, service zone, shipping
  option, rate, sales channel, or shipping promise is fabricated.
- Finalization requires a ready claim, journal readiness, an existing stock
  location, exactly one seller/location link, and no foreign owner. Failure
  fencing refuses to clear approval while any warehouse claim is retained.
- Final approval reconciliation removes only locations owned by that operation
  and only when they have no inventory levels and no foreign owner. An adopted
  location, or an owned location with any inventory level, requires recovery and
  is never deleted. Released claims remain as durable audit records.
- A failed native write before its response is journaled remains recoverable
  through the precommitted claim. Known successful approval replay creates no
  additional stock location. Uncertain final database commits retain resources
  under the existing approval recovery flow.

## Integration contracts

`packages/api/src/lib/vendor-warehouse/access.ts` exports:

```ts
requireSellerWarehouse(container, sellerId): Promise<string>
assertSellerWarehouseLocations(container, sellerId, locationIds: string[]): Promise<string>
```

Both return the authoritative `stock_location_id`, failing closed for missing,
unready, missing-link, multiple-location, or foreign-owner states. The second
also rejects every supplied ID that differs from the warehouse.

The coordinator must invoke `guardSellerWarehouse(req, seller.id)` from
`lib/vendor-warehouse/native-guards.ts` after the existing live membership gate
resolves the seller and before existing inventory scoping. It denies native
`POST /vendor/stock-locations`, warehouse deletion, direct address/metadata edits,
foreign stock-location route IDs, and foreign nested inventory/offer references.
Inventory and offer mutations require a ready warehouse even with no explicit
location ID. The catalog worker owns native offer workflow validation hooks and
uses the same helper there; warehouse code does not register competing hooks.

No new module registration or link definition is necessary. The existing
`vendorOnboarding` module now owns the claim model and the existing native
seller/location link remains authoritative for cross-module ownership reads.

## Existing-shop backfill

The new `backfillVendorWarehouseWorkflow` accepts one seller ID and an explicit
`dry_run` boolean. Its script defaults to dry-run:

```sh
pnpm --filter @usapeek/api exec medusa exec ./src/scripts/backfill-vendor-warehouse.ts <seller-id> dry-run
pnpm --filter @usapeek/api exec medusa exec ./src/scripts/backfill-vendor-warehouse.ts <seller-id> apply
```

Neither command was executed. Dry-run reads only and reports `would_create`,
`would_adopt`, `ready`, or `conflict`, without logging application address or
phone. Adoption requires one existing location with exactly the approved address
and phone, plus exclusive seller ownership. Multiple locations, an invalid or
absent approved application, mismatched addresses, foreign links, and released
claims are conflicts. There is no automatic merging, inventory deletion, address
rewrite, or invented application for legacy sellers without an approved source.

Apply reserves the same durable claim as approval and can be retried after an
uncertain native result. Operational database failures propagate and retain the
claim; they are not misreported as successful repairs.

## Exact migration requirements

`Migration20260906001500.ts` contains the complete handwritten executable delta:

1. Nullable `vendor_application_mutation.warehouse_id` and non-null
   `warehouse_ready` defaulting to false.
2. `vendor_warehouse` with its primary key, source/address/name, seller and stock
   location IDs, operation/revision, ownership flag, state, and normal timestamps.
3. Unconditional unique constraints `vendor_warehouse_seller_forever` and
   `vendor_warehouse_location_forever`. The `ON CONFLICT (seller_id)` claim insert
   depends on unconditional uniqueness; retain these alongside DML indexes.
4. DML indexes, claim immutability trigger, application snapshot immutability
   trigger, restricted trigger-function search paths, RLS, and role revokes.

No migration or generator was run. The existing
`.snapshot-vendor-onboarding.json` was deliberately left untouched. The
coordinator must generate/reconcile the vendorOnboarding schema snapshot on
disposable infrastructure, merging the generated delta with this migration
rather than appending duplicate CREATE TABLE / ADD COLUMN statements. Preserve
the custom forever constraints, triggers, and RLS grants/revokes. Run the final
migration gate before enabling the guard or approving another application.
Rollback drops warehouse audit data and is not a routine operational recovery.

## Evidence and limitations

- Focused unit command: `pnpm --filter @usapeek/api test:unit --runTestsByPath src/workflows/__tests__/vendor-application.unit.spec.ts src/workflows/__tests__/vendor-warehouse.unit.spec.ts`.
- Both suites passed together: 28 tests; after the final guard refinement, the
  warehouse suite passed again with 12 tests (29 total across the two suites).
  Coverage includes approval replay, lost location/link
  responses, concurrent provisioning, immutable-source selection, US phone
  rejection, adoption, populated-location preservation, safe empty cleanup,
  foreign ownership and nested IDs, inventory mutations without explicit
  location IDs before warehouse readiness, and backfill dry-run conflicts.
- Concurrency tests use in-memory persistence with primary-key/link conflicts;
  they do not establish live PostgreSQL locking or migration correctness.
- API typecheck was executed and reported only work-in-progress catalog files
  outside this dispatch after the warehouse fixture type errors were fixed.
- Targeted ESLint could not initialize because installed ESLint lacked
  `@eslint/config-helpers`. The coordinator acknowledged an ongoing dependency
  relink failure and owns repair plus the final checks.
- No build, server, shared database migration, integration suite, backfill apply,
  credential inspection, Redis polling, Effect adoption, or commit was performed.
- Existing approvals in flight across deployment must follow the existing
  operator recovery protocol: inspect the original execution and stop its worker
  before cancellation/reconciliation. This change does not authorize concurrent
  operator recovery against an executing approval worker.
- Legacy shops with no approved application need an explicit operator decision
  before a trustworthy source can be established. This implementation safely
  reports that condition rather than provisioning from an editable seller record.

## Installed contracts consulted

- `@mercurjs/docs@2.3.3`, vendor onboarding and offers documentation.
- Mercur `createSellerStockLocationsWorkflow`: native creation followed by the
  seller/location link; no shipping configuration is created.
- Mercur `linkSellerStockLocationStep` and stock-location middleware/contracts.
- Medusa 2.18 StockLocation module implementation: caller input is passed to the
  DML create service and the caller-supplied ID is retained.
- Existing approval journal, recovery workflows, module audit migrations, and
  existing US submission validation.
