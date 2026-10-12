---
name: date-fns
description: Implement and review date parsing, formatting, and calendar calculations in usapeek using date-fns. Load when changing date handling, not for unrelated forms or numeric formatting.
---

# Dates in usapeek

This is a project-maintained skill, not an upstream date-fns skill.

- Inspect the consuming package's manifest and nearby date helpers first. Use
  the declared date-fns version; add a direct dependency with pnpm only in
  packages that actually import it. Do not rely on transitive dependencies.
- Import the functions used, preferably from their public subpaths, such as
  `date-fns/parseISO`, `date-fns/isValid`, and `date-fns/intlFormat`.
- Parse API ISO strings with `parseISO`; retain existing `Date` values. Check
  `isValid` before formatting and use the feature's existing unavailable state.
  Do not silently normalize impossible calendar dates into another month.
- Preserve existing locale, timezone, and output semantics during refactors.
  For localized instants, use `intlFormat(date, options, { locale })` with an
  explicit `options.timeZone`. `format` without a timezone context uses the
  host zone, which can change the day between SSR and the browser.
- Distinguish an instant (ISO timestamp with offset/Z) from a date-only field
  (`YYYY-MM-DD`). Do not treat a date-only value as a UTC instant accidentally.
  Require offsets on new timestamp contracts instead of guessing a host zone.
- Use immutable operations. Do not use display strings for storage, ordering,
  authorization, or release eligibility.
- Calendar days, business days, and elapsed hours are different policies. Before
  implementing a deadline, consult the confirmed phase plan and establish the
  relevant timezone/calendar. Weekend-only `addBusinessDays` does not account
  for public holidays. Add timezone extensions only when the operation needs
  them; do not assume date-fns alone resolves all zoned calendar arithmetic.
- Test invalid and missing values, leap dates, explicit offsets near midnight,
  input immutability, and DST boundaries for zoned calculations. Keep parsing
  tests independent from backend, Redis, and Stripe.

Existing entry points:

- `apps/web/features/account/order-format.ts`
- `apps/web/features/vendor-onboarding/presentation.ts`
- `apps/admin/src/features/vendor-applications/helpers.ts`
- `apps/vendor/src/features/workspace/presentation.ts`

For APIs not established by installed types/source, use Context7 with
`/date-fns/date-fns` after resolving the library ID as required by AGENTS.md.
Verify against [upstream documentation](https://date-fns.org/docs/Getting-Started)
and the installed version, not examples from a different major release.
