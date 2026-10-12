# Financial reporting (F09)

The current Admin read uses a private prepared registry. Its implementation,
freshness guarantees and measured performance are documented in
[the 2026-10-05 performance evidence](admin-reporting-performance-20261005.md).

## Scope and filters

The admin and vendor dashboard reports support `today`, `last_7_days`,
`last_30_days`, and `current_month`. Windows use the `America/Montevideo`
calendar, include the local start date and today, and query the half-open interval
`[start_at, end_at)`. `end_at`, `cutoff_at`, and `generated_at` use one captured
instant. All current report routes require explicit Stripe `test` mode, USD,
and either `ordinary` or `qa_fixture` data. Unknown data classifications are
counted as excluded and never included in either selected report.

## Measures

- Captured volume, merchandise GMV, recognized commission, and vendor earnings
  use confirmed, matched capture allocations in the period. The shared capture
  is counted through its per-order allocation, not once per order group.
- Effective refunds are period flows. Net captured volume is captured volume
  minus effective refunds. Refunds without verified component attribution do
  not reduce merchandise GMV. Seller entitlement and commission are reduced
  only by verified refund adjustments.
- Transfers and reversals are period flows. Pending settlement is cumulative
  captured seller entitlement, less verified seller entitlement reductions,
  less cumulative transfers net of reversals at the cutoff. It may be negative.
- Platform fees are unique by provider, mode, connected account, and balance
  transaction. Fees count only when confirmed and their provider effective
  timestamp is known. After-fees result is net marketplace commission minus
  confirmed platform fees and is null unless report coverage is complete.

## Coverage and privacy

Only effective timestamps are used for report windows; `recorded_at` is not a
fallback. Missing effective time, unknown classification, unresolved provider
facts, pending fees, duplicate/conflicting facts, source errors, and a truncated
group scan mark coverage partial. Admin sees coverage reasons. Vendor totals
contain only that seller's allocations, adjustments, and transfers; vendor
responses do not include other sellers' identifiers or platform fee details.
Both endpoints require private no-store responses. Reads use the Phase 3
reporting source reader and do not call Stripe or write journal records.

## Evidence limits

The API unit tests cover calendar windows, shared capture allocation, range
boundaries, effective-time requirements, ordinary versus QA classification,
fee incompleteness, and seller fee visibility. They do not establish the
accuracy of persisted records against live Stripe TEST sales. That contrast
remains a separate release gate. No database-backed/integration runner was
used for the initial implementation. The later integrated checks below are
separate evidence; they do not change that historical scope.

## Integrated evidence — 2026-10-03

F09 is integrated in root `141082c`. An independent pure oracle checked the four
Montevideo periods against the final saved Stripe TEST/native cost receipt.
Native observations and persisted movements reconcile: USD74.97 captured,
59.97 merchandise GMV,49.98 monetary refunds,24.99 net captured, commission
6.00−4.00=2.00, vendor earnings22.99, transfers44.14−21.15=22.99 and pending0.
The31 unique fees are pending at both provider and persistence; total fees remain
unknown and after-fees result is null. Confirmed subtotal0 is not total cost0.
Authorization release24.99 does not count as a refund of captured money.

Real visual verification passed for ordinary empty admin, QA last30days totals,
all four admin/vendorA periods and URL selection, sellerA/B scope and per-order
details. A displays captured/refunded49.98 and earnings0; B captured24.99,
refund0 and earnings/net transfers22.99. A sees two own orders and B one paid
order; vendor responses/details omit foreign identifiers and platform fees.
Each A order shows commission gross/reversed/net2/2/0; B shows2/0/2.

After local midnight, today flows are0 while originals at the cutoff and the
unverified release-time notice remain visible. Zero unknown fees in a period
does not imply complete coverage if that independently verified notice remains.
HTTP attempt1 failed because the external oracle omitted this exact non-fee
reason. Its narrow external correction was reviewed with19 pure regressions and
preserved strict controls. HTTP attempt2 passed44 checks:24 responses200 with
private/no-store (three scopes,four periods,QA/ordinary) and20 rejected requests,
including forged-seller400not_allowed. No monetary mutations or Stripe calls.
Production reporting and independent economic expectations are unchanged; the
failed first receipt is preserved.

Controlled5second delays showed only a local report skeleton, retaining title,
navigation and independent statistics. Controlled503 errors were local; retry
restored filters/URL and real figures in both panels. Mobile390×844 retained
controls within375px document width; tables scroll inside303px containers rather
than widening the page, and seller details remain readable. Viewport and proxy
passthrough were restored. Verified screenshot hashes and the17DoD/9Phase6
matrix are in [current closure evidence](development-closure-20261003.md).

The independent proposed-products indicator returned403 because the QA actor
lacks product:read; its explicit error was retained instead of a fabricated0.
This is an actor permission limit,not an F09 defect; no privileges were widened.

UI results and HTTP44 are separately verified. Final offline checks passed
functionally with strict-audit qualifications documented separately. QA API was
restarted alone; two TLS/run-identity reads verified a polling eventbus worker
and backlog0. Financial Readiness is **PASS only for local Stripe TEST/USD/manual
F01–F12**, with31 fees still unknown,resultnull and historical/audit limits explicit.
No live,payout-bank,disabled-provider delivery,indexing/upload or production
readiness is certified.

## Presentation simplification — 2026-10-03

Following operator feedback, the admin summary now has four primary indicators:
merchandise sales, net commission income, result after fees, and pending settlement.
Paid orders and refunds appear in a compact row. Eight reconciliation totals are
available in a collapsed disclosure; vendor earnings are removed from the admin
summary and its order table. The main admin table has six columns, with capture
and transfer details retained in each order's disclosure. Unknown amounts still
display `—`, and incomplete coverage remains visible.

The vendor summary also has four primary indicators: net collections, earnings,
transfers in the period, and pending settlement. Orders/refunds use a compact row;
original collections and merchandise GMV remain available in a disclosure.
These are presentation changes; API contracts, calculations, authorization,
filters, pagination and local loading/error boundaries are preserved.

Current checks: admin/vendor lint and typecheck PASS; admin 99 and vendor 138
tests PASS. Both current local dashboards were checked with their ordinary empty
financial dataset, including disclosures by pointer and Enter, partial coverage,
and independent loading regions. At a 390px viewport both documents stayed within
375px available width; viewport overrides were restored. This follow-up does not
claim a new nonempty Stripe TEST flow or repeat the financial mutations above.
