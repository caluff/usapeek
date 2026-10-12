# API extensions

Local routes extend installed Mercur 2.3.3 / Medusa 2.18.0 APIs. This directory is
not the complete route inventory: native routes and middleware also load from
those packages.

| Area                           | Responsibilities                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `auth/`                        | Google completion and issuing/consuming vendor sessions.                                                                |
| `store/`                       | Favorites, account guards, product search, sale-readiness guards and vendor applications.                               |
| `vendor/`                      | Onboarding, warehouse, shipping, catalog images/options, prices, stock, sale status, Connect refresh, order finance and seller-scoped reporting. |
| `admin/`                       | Vendor application reviews, order finance and marketplace financial reporting.                                          |
| `middlewares.ts`               | Cross-cutting authentication, scoping and native/local composition.                                                     |
| `order-finance-middlewares.ts` | Financial writer protection and cart-completion handling.                                                               |

Start with each route's middleware/validator and workflow. Mutations belong in
workflows; routes are HTTP adapters. Frontends use their existing SDK and the
generated contracts exported by [the API package](../../package.json).

Before changing native behavior, inspect its installed route, workflow and hooks.
Medusa permits only one handler per workflow hook; preserve native checks and
compensation when composing local behavior.

Finance operates within TEST/USD restrictions. F01–F12 are closed for the manual
scope, including F04 writer/order-edit protection and reporting. New writers and
external SQL are outside that protection until reviewed. Automatic settlement
is active locally, with its full new-order 72-hour check still pending. The
[progress](../../../../docs/develpment/development-progress.md) records current
evidence; the audit preserves original findings. Neither certifies LIVE.
