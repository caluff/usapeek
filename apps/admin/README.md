# usapeek Admin

Independent Next.js operator application connected to the Mercur/Medusa Admin API.
This is no longer a demonstration shell. Authentication, protected reads and the
listed mutations use the application SDK and backend authorization.

## Connected surfaces

| Route                              | Current behavior                                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login` and authentication routes | Login, MFA, recovery, email verification and Google authentication/linking when configured.                                                                                        |
| `/dashboard`                       | Operational counts and financial reporting: merchandise sales, commissions, result after confirmed fees and pending settlement; sale detail, periods and reconciliation. Unknown costs remain explicit. |
| `/dashboard/vendor-applications`   | Application review, details, approval, rejection and requests for corrections; category-proposal handling.                                                                         |
| `/dashboard/product-review`        | Review of proposed products and pending content/image changes.                                                                                                                     |
| `/dashboard/stores`                | Store list/detail and catalog permission selector: Supervised (admin review) or Authorized (native publication/confirmation). Store suspension/reactivation controls are not yet connected in this panel. |
| `/dashboard/orders`                | Orders and details, supported order operations and financial controls for capture, cancellation and refunds in Stripe TEST. Availability comes from backend state and permissions. |
| `/dashboard/commissions`           | Pagos: global commission, capture mode and release mode (Manual/Automatic). Automatic accepts a 0–365-day wait (default 3; Immediate/3 days/One week presets and an adjacent numeric field); changes apply only to new verified completions, preserving existing deadlines. Settings use permissions and concurrency revisions. |

Financial reporting uses backend snapshots and reconciled movements in TEST/USD,
with periods defined in `America/Montevideo`. Four primary cards keep the operator
view focused; additional movement and fee information appears in reconciliation.
Incomplete coverage leaves the result after fees unknown rather than treating
missing costs as zero. Transfer reporting is separate from bank payouts.

F01–F12 / Phase 1–6 are **DONE**, with **Financial Readiness: PASS for TEST/USD
and manual operations**. Automatic settlement is implemented; Pagos controls its
mode, while safe TEST configuration remains mandatory. The development copy is
currently Manual. Full new-order verification after 72 real hours is pending;
the original TEST #16 follow-up is paused after the environment change. LIVE and
production readiness remain unverified; the
[progress](../../docs/develpment/development-progress.md) records current evidence.

## Development

After the workspace installation and backend configuration described in the
[root README](../../README.md):

```bash
pnpm --filter @usapeek/admin dev
```

Open `http://localhost:7000/login` or `http://localhost:7000/dashboard`.
`NEXT_PUBLIC_MEDUSA_BACKEND_URL` configures the public backend origin; it is not a
place for backend credentials. Sessions remain isolated from the other apps.

```bash
pnpm lint:admin
pnpm typecheck:admin
pnpm build:admin
```

These are verification commands, not a claim that checks ran on the current tree.
The App Router composes domain features under `src/features`; editable generic
primitives use `packages/ui` through application adapters under `src/components/ui`.

## Documentation

- [Development audit](../../docs/develpment/development-completion-audit.md)
- [Implementation phases](../../docs/develpment/development-implementation-plan.md)
- [Session handoff/progress](../../docs/develpment/development-progress.md)
- [Vendor operations](../../docs/vendor-operations.md)
- [Catalog permissions](../../docs/catalog-permissions.md)
- [Form feedback](../../docs/admin-vendor-form-notifications.md)
- [Historical shell implementation report](IMPLEMENTATION_REPORT.md)
