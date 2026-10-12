# Inventory concurrency extension

This replaces the `inventory` module service with a subclass of the installed
Medusa **2.18.0** service. Native models, module links, internal services and
migration history remain in use. The connection loader points to the installed
inventory migration directory. Explicit CLI migration hooks point to that same
directory, because Medusa constructs CLI migration scripts separately from its
runtime loader. This extension introduces no schema migration.

`compareAndSetInventory` is used by the vendor stock workflow. It reads an existing
inventory level, compares `expected_quantity`, checks `stocked_quantity` against
current reservations, and invokes native `updateInventoryLevels_` in one database
transaction. A stale quantity or count below reservations throws a conflict.
Native mutation hooks aggregate events within the transaction; the public method
emits them only after successful transaction completion.

The inventory-level and reservation-item repositories add `FOR UPDATE` locking
to transactional `find` calls. This is essential: the installed native stock,
reservation and fulfillment adjustment methods read before writing absolute
quantities. A lock used only by the vendor workflow would not protect those
reads. Batch reads lock in ascending ID order. Reservation updates/deletions read
existing reservations before levels; reservation creation locks levels before
inserting new reservations. Nontransactional reads retain native query behavior.

Refreshing locked reads avoids using a previously cached entity. `FlushMode.AUTO`
preserves pending native changes before refresh when a transaction is reused, and
the native `OnInit` hook recomputes available quantity after hydration. Module
ownership is preserved: neither workflow nor route accesses inventory SQL.

The guarantee applies to vendor absolute-count edits racing with native module
operations. Native backorders and fulfillment's separate stock/reservation steps
remain supported; the system does not impose a global `stocked >= reserved`
constraint. External SQL writers and additional code that bypasses native
services are outside this contract. Multi-operation callers that manually retain
transactions must use consistent resource order, as with any row-locking API.

The native module service is the typed `service` property on the public
`@medusajs/medusa/inventory` default export. The package exposes the required native models,
repository and internal inventory-level service only through its `dist` subpaths,
with no equivalent framework exports. Those imports trigger the Medusa
internal-import lint warning and require review when upgrading Medusa.
Keep `@medusajs/inventory` pinned to the same version as the framework.

Historical unit verification (the unit suites were removed at the user's request):

The former concurrency unit fixture executed installed native module methods through
the real repository override and simulates transactional row locks. It is not a
PostgreSQL integration test. Real database races must also be verified using
dedicated QA inventory and the configured module.

The former registration test used Medusa's actual resource discovery and container
loader with MikroORM metadata initialization and `connect: false`. It detects
missing internal services and mismatched dependency instances without opening a
database connection. Native inventory and the API framework must resolve to the
same MikroORM installation; stale dependency links can otherwise split the
metadata registry even when package version strings match.

On 2026-09-05, the coordinator also ran four races against the configured
PostgreSQL database with the real module: competing stale edits, a vendor decrease
against a native reservation, an absolute edit against a native delta, and two
native reservations competing for insufficient stock. All passed, and the four
QA inventory items, their reservations, and the QA location were removed through
native workflows. See the full [QA report](../../../../../docs/reports/vendor-qa-resend-inventory.md)
for evidence and the external blockers affecting the remaining onboarding QA.
