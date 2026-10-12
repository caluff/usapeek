# Railway service definitions

[railway.ts](railway.ts) defines five application services and one Redis
database sourced from the repository's `develop` branch. It records builds,
start commands, watch paths, networking and variable references. It does not
prove that a remote environment matches.

All six resources declare one replica in US East (Virginia),
`us-east4-eqdc4a`. PostgreSQL and product images remain in Supabase North
Virginia (`us-east-1`). See the [migration record](../docs/operations/east-region-migration-2026-10-05.md)
for the verified remote state and deployment limits.

The project and GitHub source are `usapeek` / `caluff/usapeek`. Public domains,
private frontend DNS names, CORS and Google callbacks follow the new name.
See the [rename record](../docs/operations/usapeek-rename-2026-10-05.md).

| Service    | Build                      | Start               | Health check    |
| ---------- | -------------------------- | ------------------- | --------------- |
| API        | `pnpm build:api:deploy`    | `pnpm start:api`    | `/health`       |
| Worker     | `pnpm build:worker:deploy` | `pnpm start:worker` | None declared   |
| Storefront | `pnpm build:web`           | `pnpm start:web`    | `/`             |
| Admin      | `pnpm build:admin`         | `pnpm start:admin`  | `/login`        |
| Vendor     | `pnpm build:vendor`        | `pnpm start:vendor` | `/seller/login` |

Only API declares `pnpm db:migrate` before deployment. Worker shares the database
and backend build but has no public domain declared.

Railway terminates TLS at its public edge and redirects HTTP to HTTPS before
requests reach the services, including static resources and callbacks. The
three frontend Next.js configurations add
`Strict-Transport-Security: max-age=31536000` to production responses marked
`X-Forwarded-Proto: https`, scoped to the current hostname. After a successful
HTTPS visit, browsers upgrade subsequent requests to HTTPS for one year.
Development and internal HTTP health checks do not receive HSTS.

Other deployment proxies must enforce HTTP-to-HTTPS redirects at the edge and
set and overwrite `X-Forwarded-Proto` with the original client protocol. HSTS
does not secure a client's first HTTP request. In Railway, use HTTPS URLs
directly for API calls: the edge's 301 can turn a redirected POST into a GET.

The local routing unit checks were removed at the user's request. Verify redirects,
HSTS and certificates against the intended deployment when changing routing.
See Railway's [edge behavior](https://docs.railway.com/networking/public-networking/specs-and-limits)
and [health check requirements](https://docs.railway.com/deployments/healthchecks).

PostgreSQL remains external. Redis is provisioned in Railway and API/worker use
the database helper's private `REDIS_URL`. Backend references also include
`DATABASE_URL`, signing secrets, CORS, Google and Stripe TEST settings.
Frontends reference public configuration only. Credentials belong in the
deployment environment, never in docs or Git.

This file does not declare every optional integration supported by
[medusa-config.ts](../packages/api/medusa-config.ts). Email/Resend,
onboarding options and the public theme-cookie domain are
not all mapped here. Review feature configuration alongside this definition
before later deployment work.

API and worker preserve the five Supabase Storage variables, and Storefront
preserves `NEXT_PUBLIC_PRODUCT_IMAGE_URL`. Their values are managed in Railway;
`preserve()` does not provision credentials. Changing the storefront's public
image origin requires a new Next.js build.

API and worker also preserve `ALGOLIA_APP_ID`, `ALGOLIA_API_KEY` and
`ALGOLIA_PRODUCT_INDEX`. Railway uses the existing remote index
`marketplace_v2_dev_products`; local development uses the separate
`marketplace_v2_dev_products_local_dcalu` index. Configure the three variables
on both backend services and run the existing `src/scripts/reindex-search`
script inside the deployed API to initialize or refresh the remote projection.

`NODE_ENV=production` does not enable live Stripe: the application accepts TEST
keys only and financial operations are scoped to USD. General commerce jobs stay
disabled (`STRIPE_AUTOMATIC_JOBS_ENABLED=false`). The separate 72-hour settlement
job requires `STRIPE_AUTOMATIC_SETTLEMENT_ENABLED=true`, the financial migrations
and a running worker. It is active in the local TEST environment; that does not
prove activation in Railway or a new-order transfer after 72 real hours.

F01–F12 / Phase 1–6 are complete for TEST/USD/manual operations. The new automatic
path still needs its full elapsed-time verification. LIVE compatibility cannot be
enabled by replacing keys alone, and transfer to a Connect balance does not prove
arrival at the seller's bank. Consult [current development progress](../docs/develpment/development-progress.md)
and the [job contract](../packages/api/src/jobs/README.md).

The migration record documents the remote region changes, temporary deployment
checks and final shutdown of all six Railway services. Before production,
validate authenticated business flows, optional integrations, monitoring,
financial recovery and backup restoration against the selected destination.
