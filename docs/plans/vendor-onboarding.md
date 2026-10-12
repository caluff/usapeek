# Customer-to-vendor onboarding and operational vendor portal

> **Plan histórico.** Se conserva el alcance y las decisiones de esta etapa. Para continuar el desarrollo, usar el [plan de cierre vigente](../develpment/development-implementation-plan.md) y su [progreso](../develpment/development-progress.md). Las fases de este documento no son las nuevas fases de cierre. El cuerpo original se conserva; sus pendientes no constituyen por sí solos el backlog actual.

Planning artifact, inspected 2026-09-04/05. No application code, dependencies,
configuration, database records, or infrastructure were changed by this planning
task. The coordinator subsequently relayed the user's expanded scope: connect
the existing vendor home, catalog, inventory, orders, and settings to Mercur,
deferring operations whose dependencies are not configured.

## Approved product contract

- A customer keeps the buyer account, orders, addresses, and favorites. Becoming
  a vendor adds access; it never converts or deletes the customer.
- Add the entry point to the account and avatar menu. Use `/account/sell` for
  the application and its status. Anonymous visitors go through
  `/login?next=%2Faccount%2Fsell`.
- Four steps: responsible person, store, activity, review. Save a resumable
  draft on the backend, submit an immutable review snapshot, and let an admin
  approve, request corrections with a reason, or reject with a reason.
- One application and at most one store created through this process per
  applicant. Rejection is terminal in this release; corrections are the path
  for editable resubmissions. No second application or self-service reopening.
- Approval grants vendor access and a setup checklist. Application approval,
  seller operating status, and checklist completion are different concepts.
- In-app status/history and notifications are required; transactional email
  uses the existing Medusa notification infrastructure once its delivery
  provider is configured. Never claim an email was sent merely because an
  event was queued.
- No payment, payout, bank account, tax/KYC document, commission-policy, checkout,
  or team-onboarding expansion. Native capabilities in these domains are not
  automatically in scope.
- Customer login adopts the existing vendor login's Mercado Sur visual
  identity and shadcn composition. Preserve the real customer login,
  registration, password reset, verification, MFA, and safe-return behavior.
- Both individuals and companies can apply. Collect business type, company
  name when applicable, and business address, without tax identifiers/documents.
  A buyer address may be copied into the draft as an independent snapshot.
- Country eligibility is still awaiting a coordinator/user decision. Existing
  customer addresses enforce US formatting, which is evidence of current
  implementation, not permission to invent a new seller-country policy.
  Use the coordinator's conservative configurable default `['us']` until the
  user changes it; do not enable broader geography without that decision.

## Verified repository and installed-package facts

The authority for Mercur behavior is the installed `2.3.3` implementation, with
`node_modules/@mercurjs/docs` as supporting documentation. All three frontends
currently pin Next.js `16.3.4`, React `19.2.8`, and Medusa JS SDK `2.18.0`.

| Area | Observed capability and consequence |
| --- | --- |
| Authentication | `apps/web/lib/auth-sdk.ts`, `apps/admin/src/lib/auth-sdk.ts`, and `apps/vendor/src/lib/auth-sdk.ts` create request-scoped Medusa SDK clients with JWT `nostore` and HttpOnly app cookies. Reuse them. |
| Actor types | Customer uses `customer`, admin uses `user`, vendor uses `member`, all through `emailpass`. Actor-specific JWTs are not interchangeable. |
| Admin/vendor status | Admin `/dashboard` and vendor `seller/(workspace)` layouts already query actual identities. Their business pages still contain demo data. Do not describe authentication as a demo or business controls as operational prematurely. |
| Generic Requests | No generic Requests module, request DTO, seller-application route, or request-approval workflow is exported by installed Mercur `2.3.3`. The module list contains seller, product-edit, etc.; product change requests do not represent seller applications. Do not invent `RequestDTO`, `/admin/requests`, or import an older Mercur requests package. |
| Seller creation | `createSellerAccountWorkflow` from `@mercurjs/core/workflows` accepts `auth_identity_id`, `seller: CreateSellerDTO`, optional `member_id`/`member_email`, and optional address/professional/payment details. It always creates `pending_approval`, creates owner membership with `SellerRole.SELLER_ADMINISTRATION`, and emits `seller.created`. |
| Unsafe default for this feature | When `member_id` is absent, `createSellerAccountWorkflow` calls `upsertMembersStep`, whose service looks up and reuses members by email, then sets auth metadata. Do not use that branch for buyer-to-vendor binding. |
| Other creation workflow | `createSellersWorkflow` requires `sellers[].member.email` and creates invites. The installed documentation example omitting `member` is incomplete for this version. It is not the chosen onboarding path. |
| Member uniqueness | Installed Member model has a global unique live `email` index, despite documentation discussing per-store uniqueness. `MemberDTO` contains `is_active`, not a `status` field. |
| Seller uniqueness | Seller has unique live indexes for `name`, `handle`, `email`, and non-null `external_id`. Currency is required on creation. Use native constraints and map conflicts to actionable errors. |
| Approval | `approveSellerWorkflow({ seller_id })` permits only `pending_approval`, sets `open` and `approved_at`, clears `status_reason`, and emits `seller.approved`. It does not review an application, enforce one store per customer, or journal customer ownership. |
| Native status bypass | Admin generic seller update accepts arbitrary `status` strings before model validation; `updateSellersWorkflow` is a generic update. Dedicated lifecycle workflows exist, including `unterminateSellerWorkflow` even though prose calls termination irreversible. Our application transitions must be explicitly enforced. |
| Vendor scoping | `ensureSellerMiddleware` queries `seller_member` by authenticated member ID and `x-seller-id`, then sets RBAC role. Its cached query does not itself enforce `member.is_active` or `seller.status === open`. `/vendor/sellers/select` also validates membership but not those states. Add live access checks for the operational portal/API. |
| Registration boundary | `featureFlags.seller_registration` is false and local middleware blocks `POST /vendor/sellers`. Keep both protections; custom customer application routes do not require opening generic registration. |
| Seller defaults | `createSellerDefaultsWorkflow` currently ensures RBAC roles only. Neither it nor the account workflow creates warehouses, shipping options, payout accounts, or a configured selling operation. Checklist values must reflect actual data. |
| Auth verification | Medusa `requestVerificationWorkflow`, `sdk.auth.verification.request/confirm`, and `AuthTypes.AuthVerificationDTO` exist in `2.18.0`. Verification is scoped by `auth_identity_id`, `entity_id`, and `entity_type`. Global `authVerificationsPerActor` is not configured here. |
| Delivery | Existing `auth.verification_requested` and `auth.password_reset` subscribers call `Modules.NOTIFICATION`. Auth email is guarded by `AUTH_EMAIL_ENABLED`; no external notification provider is configured in `medusa-config.ts`. |
| Contracts | API already exports `./_generated` to `.mercur/routes.d.ts`. That file is a route map with `typeof import('../src/api/.../route')`, not standalone transport declarations. No frontend currently imports it. |

Primary files inspected under
`packages/api/node_modules/@mercurjs/core/.medusa/server/src/`:
`modules/seller/models/{seller,member,seller-member}.js`,
`modules/seller/service.{js,d.ts}`,
`workflows/seller/workflows/{create-seller-account,create-sellers,approve-seller,update-seller,create-seller-defaults}.{js,d.ts}`,
`workflows/seller/steps/{upsert-member,create-seller,create-seller-member,validate-approve-seller}.js`,
`api/vendor/{middlewares,sellers/validators,sellers/select/route}.js`,
`api/utils/ensure-seller-middleware.js`, and `api/admin/sellers/validators.js`.
Published entity contracts are in `@mercurjs/types/dist/{seller,http}`.

## Architecture: minimal custom application domain

Use `src/modules/vendor-onboarding` registered as `vendorOnboarding`. Mercur
continues to own Seller, Member, SellerMember, catalog, inventory, and orders.
Do not store the application in customer metadata: customers can edit metadata,
there are no useful uniqueness/transition guarantees there, and drafts contain
private contact and review information.

Use three focused local records, rather than recreating a generic request engine:

1. **VendorApplication**: ID; immutable customer and auth-identity IDs; status;
   integer version; editable draft JSON validated by the application schema;
   submitted snapshot and submission revision; last submission/decision times;
   seller/member IDs after provisioning; active approval operation ID and its
   technical outcome. The application owns the single-applicant constraint.
2. **VendorApplicationEvent**: immutable submission/decision snapshot, public
   reason, reviewer user ID when applicable, event type, application revision,
   timestamp; per-customer read state and email delivery state. This supplies
   history, in-app notifications, and a durable delivery outbox. Draft saves do
   not create user-visible notifications.
3. **VendorApplicationMutation**: application/customer scope, client mutation
   ID, canonical request hash, expected version, operation type, processing
   state, workflow transaction ID, persisted native IDs, and result/error.
   This is the bounded idempotency/recovery journal for writes and approval.

Unique constraints: application `customer_id`, application `auth_identity_id`,
non-null application `seller_id`, non-null application `member_id`, and mutation
`(application_id, mutation_id)` (creation uses customer scope until the app ID
exists). Do not recycle a rejected application's identity through soft deletion.
Index the admin queue on `(status, submitted_at, id)` and event delivery on
pending state/time. Use module links for customer/application and
application/seller/member graph reads; scalar immutable IDs also serve the
ownership and uniqueness checks. Do not place cross-module SQL or module calls
inside the application service. Its custom atomic primitives only mutate its
own records; workflow steps orchestrate other services.

### State machine

| Current state | Operation | Next state | Preconditions |
| --- | --- | --- | --- |
| No application | Save draft | `draft` | Full authenticated customer and matching live auth identity; no existing applicant store |
| `draft` | Save draft | `draft` | Same applicant; version matches |
| `draft` | Submit | `submitted` | Complete valid data, consent, verified identity email, eligibility, currency/categories still valid |
| `submitted` | Request corrections | `changes_requested` | Authorized reviewer; version matches; no approval in progress; reason required |
| `changes_requested` | Save draft | `changes_requested` | Same applicant; version matches; previous reason remains visible |
| `changes_requested` | Submit | `submitted` | Full validation again; fresh immutable snapshot/revision |
| `submitted` | Reject | `rejected` | Authorized reviewer; version matches; no approval in progress; reason required |
| `submitted` | Approve | `approved` | Authorized reviewer; all validations repeat under lock; provisioning and identity binding finish successfully |

All other transitions fail. The client never posts a desired `status`, seller
ID, member ID, customer ID, auth ID, owner flag, role, approval date, or reviewer
ID. No editable draft after submission, no decisions from draft/corrections,
no changing an approved/rejected decision, and no automatic reopen. Keep a
technical `approval_state: idle | processing | failed | complete` alongside
the product status; approval failures leave `submitted`, disclose no vendor
access, and allow a controlled retry after compensation/recovery. A technical
failure is not a rejection and does not notify the customer of approval.

## Public transport contracts

Paths and names below are the agreed new contract, not preexisting Mercur
exports. Derive request and custom response types from backend Zod schemas
using `@medusajs/framework/zod`. All objects reject unknown keys. Use ISO-8601
UTC strings on the wire and JSON primitives, not Date objects in client props.

### Shared types and field rules

```ts
type ApplicationStatus =
  | "draft" | "submitted" | "changes_requested" | "approved" | "rejected"
type ApprovalState = "idle" | "processing" | "failed" | "complete"
type WizardStep = "responsible" | "store" | "activity" | "review"
type BusinessAddress = {
  [K in "address_1" | "address_2" | "city" | "province" |
    "postal_code" | "country_code"]: NonNullable<SellerAddressDTO[K]>
}

type DraftData = {
  responsible: { first_name: string; last_name: string; phone: string }
  store: { name: string; handle: string; description: string; website_url: string }
  activity: {
    business_type: "individual" | "company"
    company_name: string
    business_address: BusinessAddress
    currency_code: string
    category_ids: string[]
    description: string
  }
}
type SaveApplicationBody = {
  mutation_id: string // UUID generated once per logical action; reused on retry
  expected_version: number // 0 for creation, otherwise current version
  current_step: WizardStep
  data: DraftData // full replacement of editable draft only
}
type SubmitApplicationBody = {
  mutation_id: string
  expected_version: number
  accepted_terms: true
}
type ReviewApplicationBody = {
  mutation_id: string
  expected_version: number
  decision: "approve" | "request_changes" | "reject"
  reason?: string // required for request_changes/reject, absent for approve
}
```

The above displays the generated contract shape; implementation must infer it
from schema, not copy it separately into the three apps. Responsible email is
read-only, derived from the authenticated identity/customer, and is also the
initial member and store contact email. A contact-email change must never
rebind identity. Do not add a second independent account or password to the
wizard.

Drafts allow empty strings and arrays, but enforce shape, limits, and safe
content on every save. Trim text; first/last names max 100 each, phone max 32,
store name max 120, handle max 80, store/activity descriptions max 2,000,
website max 2,048, company name max 200, address lines max 200, city/province
max 100, postal code max 20, max 10 distinct category IDs of max 100 characters. Maximum
JSON body 32 KiB. Plain text is rendered as text, never HTML. Reject control
characters in names/handle and URL credentials/non-HTTP(S) schemes. Empty
optional website becomes null when mapped to Seller; no server-side fetching
of applicant URLs.

On submit: names, store name, activity description, and selected geography and
currency are required. Company name is required for companies and empty for
individuals. Address line 1, city, postal code, and eligible country are required;
validate province/postal format for that country (US state and ZIP rules by
default). Responsible phone defaults the native address phone. Copy only an
address belonging to the authenticated customer, and do not link subsequent
buyer-address edits to the application. Store description is at least 20 characters; handle is
lowercase ASCII letters/digits with single internal hyphens, 3–80 chars;
phone is valid E.164 for the agreed eligible country (reuse installed
`libphonenumber-js`, not a US assumption copied from the buyer form); select
1–10 active/public backend category IDs. Currency must be an enabled store
currency; choices and country eligibility come from the backend. If there are
no configured categories/currencies, show a setup dependency, do not hardcode
catalog fixtures. Consent version is selected and recorded by the backend.
Recheck identity email, eligibility, categories, currency, and native uniqueness
before approval because they may have changed during review.

```ts
type SellerSummary = Pick<SellerDTO, "id" | "name" | "handle" | "status" | "currency_code">
type ReviewSummary = {
  decision: "request_changes" | "reject" | "approve"
  reason: string | null
  created_at: string
}
type ApplicationView = {
  id: string
  status: ApplicationStatus
  version: number
  current_step: WizardStep
  data: DraftData
  submitted_data: DraftData | null
  submission_revision: number
  submitted_at: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  review: ReviewSummary | null
  approval_state: ApprovalState
  seller: SellerSummary | null
  can_edit: boolean
  can_submit: boolean
  can_access_vendor: boolean
}
type ApplicationResponse = {
  application: ApplicationView | null
  applicant: {
    email: string
    email_verified: boolean
    existing_vendor_access: boolean
  }
  unread_count: number
}
type ApplicationNotification = {
  id: string
  type: "submitted" | "changes_requested" | "approved" | "rejected"
  reason: string | null
  created_at: string
  read_at: string | null
}
type ApplicantSummary = Pick<HttpTypes.StoreCustomer,
  "id" | "email" | "first_name" | "last_name">
type AdminApplicationSummary = Pick<ApplicationView,
  "id" | "status" | "version" | "submitted_at" | "reviewed_at" |
  "created_at" | "updated_at" | "approval_state"> & {
  customer: ApplicantSummary
  store_name: string
  business_type: "individual" | "company"
}
type AdminApplicationEvent = ApplicationNotification & {
  submission_revision: number
  reviewer_id: string | null
  submitted_data: DraftData | null
}
type AdminApplicationView = ApplicationView & {
  customer: ApplicantSummary
  history: AdminApplicationEvent[]
  approval_error_code: string | null
}
```

`SellerDTO` is imported from `@mercurjs/types`, never redefined. Admin responses
add `customer: Pick<HttpTypes.StoreCustomer, 'id' | 'email' | 'first_name' |
'last_name'>`, reviewer information limited to the ID/name required by the
operator, immutable submission/decision history, and a safe technical
`approval_error_code`. Do not return auth identity IDs, provider metadata,
mutation hashes, stack traces, tokens, or private reviewer identity to customers.

| Method and path | Authentication/input | Response |
| --- | --- | --- |
| `GET /store/vendor-application` | `authenticate('customer', ['session','bearer'])`; no `allowUnregistered`; publishable key | `200 ApplicationResponse`; application null is the ordinary no-draft state |
| `POST /store/vendor-application` | Same; `SaveApplicationBody` | `201 ApplicationResponse` on first creation, `200` on update/replay; never mutate on GET |
| `POST /store/vendor-application/submit` | Same; `SubmitApplicationBody` | `200 ApplicationResponse` with submitted snapshot; validation errors retain draft |
| `GET /store/vendor-application/options` | Same | `200 { country_codes: string[], currency_codes: string[], terms_version: string }`; choices derive from configuration/Medusa, not UI constants |
| `POST /store/vendor-application/verification` | Same; `{}` only; derive recipient from live identity | `202 { requested: true, retry_after_seconds: number }`; calls `requestVerificationWorkflow`; no verification code in response |
| `GET /store/vendor-application/notifications` | Same; `limit` 1–50 default 20, `offset` >=0 | `200 { notifications: ApplicationNotification[], count, limit, offset, unread_count }` |
| `POST /store/vendor-application/notifications/read` | Same; `{ notification_ids: string[] }`, 1–50 IDs; scoped workflow | `200 { unread_count: number }`; already-read owned IDs are idempotent, foreign IDs rejected |
| `GET /admin/vendor-applications` | Existing admin auth plus reviewer policy; `status`, `q` max 100, `limit` 1–100 default 20, `offset` >=0 | `200 { applications: AdminApplicationSummary[], count, limit, offset }`; defaults to submitted, excludes untouched drafts from review queue |
| `GET /admin/vendor-applications/:id` | Admin + reviewer read policy | `200 { application: AdminApplicationView }`; 404 if missing |
| `POST /admin/vendor-applications/:id/review` | Admin + reviewer decision policy; `ReviewApplicationBody` | `200 { application: AdminApplicationView }`; approved only once provisioning is complete; in-progress retry `202` with same envelope and processing state |
| `GET /vendor/onboarding` | Native member/seller scoping + live access check; `x-seller-id` | `200 VendorOnboardingResponse` defined below |

For verification confirmation, use the existing
`sdk.auth.verification.confirm({ code })` and its published
`AuthVerificationConfirmResponse`. Then refetch application state. Request and
confirmation must use the current customer bearer token. Gating submit checks
the live Auth service for `auth_identity_id + exact provider entity_id + email`
with non-null `verified_at`; an arbitrary email verification, client checkbox,
or another identity's code never qualifies. Do not enable a new global buyer
login verification mandate. Configure a resend cooldown and per-identity/IP
limits; 429 includes Retry-After. The existing email subscriber is reused for
the verification request with `metadata.actor_type = 'customer'`.

Errors use the existing Medusa envelope (`type`, `message`) with a stable
feature `code` and optional field-error map. Transport/security errors can
remain native. New codes: `validation_failed` (400),
`verification_required`/`not_eligible`/`member_inactive`/`seller_not_open` (403),
`application_not_found` (404), and `version_conflict`, `invalid_transition`,
`application_exists`, `existing_vendor_account`, `identity_changed`,
`member_identity_conflict`, `store_name_taken`, `store_handle_taken`,
`store_email_taken`, `mutation_conflict`, `approval_in_progress` (409).
Unconfigured backend/notification capability is 503; unhandled technical
failure is a sanitized 500. 401 means login required, not an empty collection.
Never reveal which unrelated identity owns a conflicting email/member.

### Contract publication without backend imports in frontends

Create the narrowly scoped **type-only** workspace package
`@usapeek/vendor-onboarding-contracts` at
`packages/vendor-onboarding-contracts`. It is reused by web and admin; vendor
also uses it if consuming `/vendor/onboarding`, while native-only vendor features
need only their existing native types. API owns its generator and lockfile. Export only
transport declarations, importing native types from `@mercurjs/types` and
`@medusajs/types` with `import type` where necessary; no runtime JS or framework
server imports. Frontends must not import `packages/api/src` or route handlers.

Source of truth is API Zod schemas and typed response boundaries. Generate the
standalone declarations using the installed TypeScript Compiler API (a small,
explicit export list of this feature's inferred JSON object/union/array types;
fail on unsupported/non-JSON types), with a `--check` mode that compares output
without rewriting. Preserve references to published native entity types instead
of serializing duplicate Seller/Member/Customer definitions. Add a script such
as `contracts:generate` / `contracts:check` to the API package. Generated
declarations are an intentional contract artifact, not a new hand-maintained
frontend model. Confirm generated output has no backend/framework imports.
No external production dependency or replacement SDK is needed. Add type-only
workspace dependencies and missing pinned `@mercurjs/types@2.3.3` declarations
to the apps via pnpm, under the API worker's manifest ownership.

All custom calls use `createCustomerSdk`, `createAdminSdk`, or `createVendorSdk`
and `sdk.client.fetch<Response>(path, { method, body: plainObject })`. Existing
Medusa methods remain in use for Medusa endpoints. Revalidate affected route
data after mutations, disable form resubmission while pending, and handle stale
version errors by refetching while retaining the user's unsaved form values.
Do not silently overwrite a newer draft. No cross-user Next cache: private
reads use `cache: 'no-store'` and request-scoped SDKs.

## Identity binding, authorization, and concurrency

### Binding sequence on approval

1. Authenticate and authorize the reviewer in middleware; pass the trusted user
   ID to the workflow. Claim the versioned mutation and acquire Redis locks
   for the applicant/auth identity and native uniqueness resources in a stable
   order. Re-read everything under the lock, uncached.
2. Verify the stored auth identity still has exactly the application's customer
   ID in live `app_metadata.customer_id`; retrieve the customer by ID. Require
   the current `emailpass` provider entity to match the submitted verified
   applicant email. A changed email/identity requires corrections or explicit
   account support; do not search for a replacement identity by email.
3. If live `app_metadata.member_id` exists, retrieve that exact active member by
   ID and verify its existing seller associations. Never overwrite the key.
   This first-store flow refuses applicants already associated with a store;
   the account CTA can point them to the existing vendor login instead. An
   unassociated, explicitly bound active member can be reused.
4. Otherwise, create a **new** Member through a compensatable custom step
   calling the native Seller module `createMembers`, using its published or
   inferred service input. A preexisting member with the same email causes
   `member_identity_conflict`; do not call upsert, accept an invite, search
   another identity, or attach that member automatically. Database uniqueness
   is the final race guard. Record created IDs in the operation journal.
5. Call `createSellerAccountWorkflow.runAsStep` with **explicit `member_id`**,
   stored `auth_identity_id`, and a whitelisted `CreateSellerDTO` built from the
   submitted store data. Set reserved `external_id = 'vendor-application:' +
   application.id` as an additional native unique recovery key. Do not accept
   that reserved prefix from ordinary vendor/admin write bodies. Pass validated
   business address as `UpdateSellerAddressDTO` with responsible name/phone;
   for companies only pass `{ corporate_name: company_name }` as
   `UpdateProfessionalDetailsDTO` through `professional_details`. These native
   input types exist. Never pass tax/registration numbers or payment details.
   Retain business type in the application. Map empty optional values to null.
6. Persist module links and native IDs, approve the seller through
   `approveSellerWorkflow.runAsStep`, then, only for a newly created member,
   call `setAuthAppMetadataStep({ authIdentityId, actorType: 'member', value })`.
   It preserves customer metadata and rejects an existing member key. Preserve
   every unrelated auth metadata key. A reused explicit member needs no write.
7. Atomically finalize application `approved`, mutation success, and immutable
   approved notification/event in the application module. Operational API gates
   require this committed state, so a temporarily open seller or temporarily
   linked member during a workflow cannot grant premature access.
8. Release locks with ownership checked. Process notification delivery after
   commit. Return approval success only after this sequence is complete.

The buyer cookie remains a customer token. Do not manufacture a member JWT,
pass tokens through query strings, set a domain-wide shared cookie, or treat
`sdk.auth.refresh()` as an actor switch. The approved CTA goes to configured
`VENDOR_URL + '/seller/login?next=%2Fseller'`; the existing member login uses the
same identity credentials and obtains a proper member token, including existing
MFA/verification challenges. The vendor app then selects the actual membership
and sends `x-seller-id` with every scoped request. No shared-cookie SSO is needed.

### Concurrency and recovery contract

- Every draft/submission/decision write uses optimistic `expected_version` plus
  a conditional database update. A stale tab/admin receives 409 with no effect.
- `mutation_id` is scoped to the authenticated applicant/application and actor
  operation. Same key + same canonical payload returns the existing result;
  same key + different payload returns 409. Never let a foreign actor retrieve
  an idempotency result. Replays cannot create extra events or increment version.
- Reuse Medusa's published `acquireLockStep`/`releaseLockStep` with a unique
  owner token (`ownerId`), bounded timeout, and explicit TTL, as the favorites
  workflow already does. Claim approval in the database as well: a Redis TTL
  expiring is not permission for a second approving worker to provision.
- One active approval operation is stored durably; competing corrections,
  rejection, approval, and submission cannot overtake it. Persist/reuse the
  workflow transaction ID and native IDs. An in-progress replay returns 202.
- All subsequent writes compare the claimed operation/version (fencing). Do
  not base correctness solely on a 60-second lock. An expired lock or process
  crash triggers recovery of the same journaled operation, never an unguarded
  second call to the native account-creation workflow.
- Native seller `external_id` uniqueness plus application identity uniqueness
  prevent multiple stores if two processes race or a create response is lost.
  Recover only through the reserved application key and recorded identity/IDs;
  verify all associated data before continuing. An unjournaled member collision
  fails closed for operator recovery, not implicit email binding.
- Steps compensate new membership, seller, links, and new member when later
  work fails. Never delete a reused member or alter its original auth metadata.
  Only restore/remove the exact key written by this operation. Native upsert
  has no suitable compensation here and is intentionally not used.
- A failed approval remains submitted with a safe admin-only error and retry
  path; after rollback it must have no usable vendor access. Do not reverse a
  completed decision as compensation for a mail-provider failure.
- Final application/event/outbox writes share the application's own DB
  transaction. Email delivery retries use the event ID as idempotency key and
  maintain delivery state. Reconciliation of pending outbox rows is safe across
  multiple workers; provider exactly-once delivery is not assumed.

### Native route protection

Add local middleware/workflow validation; do not edit `node_modules`:

- Keep `POST /vendor/sellers` closed regardless of the new UI flow.
- Protect custom customer routes explicitly; never use an unregistered auth
  identity or an admin/member token as the applicant.
- Register admin read/review authorization using existing Medusa RBAC policies
  (seller read/update permissions), with real user actor checks for audit. Do
  not assume every authenticated admin or API key may approve applications.
- Reject generic admin `status`, `approved_at`, `rejected_at`, or reserved
  ownership writes on application-managed sellers. Before approval finishes,
  reject native approve/member-invite/member-add paths for the in-progress
  managed store; its custom application workflow is the sole approver. Generic
  vendor update already excludes status, but do not rely on unknown-field
  stripping as a security test: unauthorized changes must have no effect.
- A local live vendor access guard checks active member, current membership,
  seller `open`, and, for an application-managed seller, committed application
  approval. Read the application link/state, not editable seller metadata.
  Apply it to custom onboarding and operational `/vendor/*` routes, and check
  selection from its body rather than trusting a cookie. Preserve sellerless
  login/discovery routes needed for the existing login flow. The membership
  discovery response can inform no-access UI but grants no operational access.
- Tests must prove middleware ordering against the installed plugin: local
  guards execute before route mutations and after enough auth context is
  available. Ownership and transition validation also lives in custom workflow
  steps, so direct workflow use cannot bypass it.
- Session roles/customer metadata/client `can_*` flags are UI hints only.
  Re-read authorization for every mutation. Cache invalidation cannot replace
  live revocation checks.

## Screens and setup checklist

### Customer application and unified login

`/account/sell` composes a server-loaded feature from
`apps/web/features/vendor-onboarding`. The wizard has four explicit steps,
back/continue controls, “Guardar y salir”, saved/error feedback, and a final
submitted-data review with the application consent. Keep editable local form
state in the wizard, with the backend draft as durable state; do not store PII
or tokens in localStorage. Refreshing resumes the last saved step. Submitting
requires a review of the exact saved version. Corrections show the admin reason
above editable fields; submitted/approved/rejected screens show history and
the relevant next action. Surface notification unread count in the account
menu and mark only displayed owned notifications as read.

The activity step includes individual/company selection, company name when
applicable, business address with an optional owned-buyer-address copy action,
operating currency, backend categories, and activity description. All identity
and copied-address ownership validation remains server-side. Review reasons are
trimmed nonempty plain text, at most 2,000 characters.

Avatar/account actions by state: no application → “Vender en Mercado Sur”;
draft/corrections → “Continuar solicitud”; submitted → “Ver solicitud”;
approved with live seller access → “Ir al portal vendedor”; rejected → “Ver
resultado”. If vendor access is revoked, show the status screen and access
message rather than a misleading approved-access button. Anonymous menu links
preserve the safe local return path.

Use `apps/vendor/src/components/vendor/vendor-auth-shell.tsx` as the visual
reference, **not as a cross-app import**: Mercado Sur mark, Store icon,
desktop dark sidebar with existing brand accent, `ModeToggle`, right-hand
Card/CardHeader/CardContent, max-width form, and mobile composition. Use existing
Public Sans/Geist Mono and local Button/Input/Label primitives. Web already has
the font assets, theme provider, mode toggle, avatar, and dropdown menu. Web
lacks vendor sidebar/font-display token aliases; add only local auth-scoped
aliases/classes necessary to match the reference, not a global storefront
theme rewrite or new font dependency. Update copy for customers and remove
Medusa/backend implementation language from the customer-facing auth shell.
Keep accessible labels, live errors, password visibility, keyboard focus,
pending states, and minimum 44px targets. Matching identity does not mean
copying vendor-only membership restrictions into customer login.

### Admin review

New independent Next routes:
`/dashboard/vendor-applications` and `/dashboard/vendor-applications/[id]`.
Use the existing admin shell, local shadcn table/cards/badges/dialogs, request-
scoped `createAdminSdk`, and server actions. The real review queue is separate
from existing synthetic dashboard metrics; replace only the matching review
entry or navigation, keeping remaining demonstrations labeled until connected.
Show submitted snapshot, responsible contact, activity, timestamp/history, and
store conflicts. Approve has a deliberate confirmation; changes/reject require
an explanation. A stale version refreshes instead of applying to an unseen
revision. Technical approval failures get a controlled retry, not an apparent
successful decision. Do not use Medusa dashboard widget APIs in these Next apps.

### Vendor onboarding response

```ts
type SetupCheck = {
  key: "profile" | "location" | "first_product" | "inventory"
  status: "complete" | "incomplete" | "blocked"
  reason: string | null // stable code localized by frontend
}
type VendorOnboardingResponse = {
  seller: SellerSummary
  checks: SetupCheck[]
  completed_count: number
  total_count: number
}
```

Checklist status is computed from native seller profile, linked stock
locations, owned product submissions/offers, and offer inventory levels, not
client-set booleans.
Profile: nonempty name/description/contact; location: at least one linked
stock location with an address sufficient for the existing selling geography;
first product: an owned product submission or existing seller offer
(approval/publication is shown separately); inventory: at least one seller offer
whose linked inventory has an assigned location level, or explicit native offer
untracked-inventory configuration. Offer stock is not variant-wide stock. Zero stock is
reported honestly, not treated as a claim that sales are ready. Setup remains
advisory and never marks payment/shipping readiness. The expanded vendor scope
below must supply real destinations/actions for these checks.

## Three-worker ownership and execution order

| Owner | Exclusive implementation files | Deliverable |
| --- | --- | --- |
| API worker | `packages/api/src/modules/vendor-onboarding/**`, `src/links/vendor-application-*.ts`, `src/workflows/*vendor-application*` and related steps, `src/api/store/vendor-application/**`, `src/api/admin/vendor-applications/**`, `src/api/vendor/onboarding/**`, access middleware, `src/policies/**`, feature subscriber/job/tests; `packages/api/medusa-config.ts`; `packages/vendor-onboarding-contracts/**`; all dependency manifests, pnpm lockfile, contract generator | Verified contracts first, application/security/workflows, native access protection, notifications, checklist, integration fixtures |
| Web worker | `apps/web/features/vendor-onboarding/**`, `app/account/sell/**`, `features/account/components/customer-menu.tsx`, account CTA, `components/site-header.tsx` if state props are needed, `components/auth/**`, login route/auth action integration, auth-scoped styling, web tests | Four-step application/status/notifications and customer login identity matching vendor login |
| Admin + vendor worker | `apps/admin/src/features/vendor-applications/**`, new review routes and navigation; `apps/vendor/src/features/**` for native dashboard/catalog/inventory/orders/settings, existing vendor route composition/auth/access presentation, relevant local UI/tests | Real admin review and current vendor tabs using native routes |

API publishes the stable declarations and error/status names before frontend
integration begins; frontends may work on structure/design in parallel. Only
API changes dependency manifests and the root lockfile; the other workers send
needed script/dependency changes to that owner. No app imports another app.
Each worker re-loads its required skills/references before implementation.
For the storefront specifically: design, navbar/account navigation, backend
integration, and Medusa SDK references; for API: custom modules, workflows,
routes, links, authentication, queries, migration skills, and Postgres rules.

With the expanded dashboard scope, the coordinator may use two waves without
exceeding three implementation workers: API + web + admin review first, then
reuse the completed admin worker for vendor dashboard integration. That avoids
one worker editing admin and vendor concurrently while another touches auth.
Coordinator owns integration verification, browser testing, configuration docs,
and final scope/eligibility decisions. Do not stop or replace the already-running
development servers on 3000/7000/7001/9000.

Latest coordinator scheduling supersedes the combined-owner suggestion: a
native-only vendor worker is already dispatched; coordinator owns admin, with
API and web onboarding workers taking remaining slots after this plan. A
separate login styling worker owns only web auth-shell/form styling and local
auth CSS. Web onboarding must not overlap those files until that worker finishes.
Stable schema names are above; communicate changes to consumers first.

## Infrastructure and validation gates

- Existing PostgreSQL, Redis caching/events/workflow/locking, API, and worker
  services are the intended infrastructure. Generate/apply only application
  module/link migrations; no new database, Redis instance, or cloud service.
  API is the only Railway service running migration predeploy.
- Coordinator confirmed Supabase-hosted PostgreSQL. Enable RLS on all new
  application/event/mutation/link tables in exposed schemas and revoke table
  access from `anon` and `authenticated` when those roles exist. No public
  customer policies: Medusa IDs are not Supabase Auth identities, and all access
  goes through the API. Preserve and verify the actual backend DB role's access;
  if it is not an owner/BYPASSRLS role, add a backend-role policy. Include grants
  and RLS in the additive Medusa migration, without Supabase migration history.
  Test browser-role denial and backend read/write.
  [Supabase RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Migration generation/application is an implementation step, not performed
  during planning. Use pnpm equivalents under the API package and inspect the
  generated migration for application tables/indexes/links only.
- Store secrets only in ignored root `.env`/Railway variables. Public backend
  URL/publishable key and vendor/storefront origins can be exposed where needed.
  `STOREFRONT_URL`, `ADMIN_URL`, `VENDOR_URL`, `AUTH_EMAIL_FROM`, email-provider
  configuration, and eligibility/terms configuration must be valid. Keep CORS
  aligned with actual app origins; never expose backend signing credentials.
- Configure and verify the existing email provider and templates before claiming
  real verification/decision email delivery. No email-provider choice has been
  made by this plan. An enabled verification requirement without working
  delivery must produce a visible setup dependency, never a bypass.
- Coordinator confirmed root `.env` currently lacks auth-email enable/from,
  app-origin, and external mail-provider variables. This planner did not inspect
  secret values. Configuration/provider delivery remain prerequisites.
- Outbox notices remain available in-app if email delivery fails. Verification
  delivery is required for a new unverified applicant to submit. Replay and
  retry tests use a test notification sink, never real customer mailboxes.
- Initial application needs no uploads. Operational product images require
  durable media storage; current `file-local` on Railway is not proof of
  persistence. Defer new upload controls until storage is configured or use
  already-supported validated image URLs with explicit remote-image policy.

Meaningful API tests: ownership/actor isolation; full-vs-intermediate auth token;
verification bound to identity and exact email; no email grant on collision;
preserve customer ID/metadata and buyer access after approval; unauthorized
admin role; every invalid state transition; saved drafts/resubmission snapshot;
reason validation; duplicate application creation; duplicate/reordered mutations;
two reviewers racing; approve-vs-reject race; Redis expiry and crash recovery;
native uniqueness collisions; rollback at member/seller/link/auth/finalize
boundaries; no approved event on failure; email failure after success; stale
member/seller revocation; forged `x-seller-id`; native route bypass attempts;
notification privacy/read idempotency; real checklist values and empty states.

Use `medusaIntegrationTestRunner` with a disposable test database, isolated
Redis namespace/database or instance, and test email provider. The current HTTP
suite contains only a health check; unit mocks cannot prove middleware order,
database uniqueness, workflow compensation, or runtime RBAC. Do not run test
migrations/fixtures against shared production data.

Frontend checks: draft resume and 409 conflict handling; login return path and
malicious redirect rejection; verification/MFA error paths; four-step keyboard
navigation; correction reason and immutable submitted view; admin action
pending/error behavior; approved member login with the same credentials; setup
links and genuine empty/error/loading states; no demo records in operational
views. Coordinator owns browser verification at mobile and desktop widths,
including light/dark login comparison with the existing vendor screen.

Run targeted lint/typecheck and verify the affected flows for every changed
application, plus API lint, typecheck, relevant isolated HTTP/module integration
tests, and API build. Unit tests and their commands were removed at the user's
request; consult the [HTTP integration guide](../../packages/api/integration-tests/http/README.md)
before running retained suites. At final integration run root lint/typecheck/build
and `pnpm peers check` if workspace dependencies changed. Run the contract
generator in check mode from a clean checkout.

Coordinator-reported baseline (not re-run by this planning worker): web 26 tests
pass; admin 9/10 pass, with a preexisting Railway service-name regex expecting
`@usapeek/admin` while current IaC calls it `UI Admin`. Preserve unrelated
IaC; report that baseline failure separately unless the coordinator assigns it.
Planning itself requires no application build and makes no runtime-test claim.

## Documentation consulted

Loaded repository AGENTS and skills for Medusa backend/storefront, storefront
best practices/design, frontend design, admin dashboard applicability, React,
Next.js, shadcn, Context7, migration generation/application, Postgres, and Orca
orchestration. Admin SDK/React Router/Medusa UI installation prescriptions do
not apply to these independent Next/shadcn applications.

- Installed Mercur docs: `content/learn/{sellers,seller-members,architecture}.mdx`,
  `content/platform/store/guides/create-a-store.mdx`,
  `content/resources/tutorials/extend-onboarding.mdx`, and
  `content/resources/best-practices/types.mdx`. The tax-ID example illustrates
  extension mechanics only; its business field is out of scope.
- Context7 resolved `/medusajs/medusa` and queried actor identity/metadata
  binding. The current docs include an email-linking example; this feature
  deliberately does not use that unsafe-for-this-policy association method.
  [Auth identity and actor types](https://docs.medusajs.com/resources/commerce-modules/auth/auth-identity-and-actor-types).
- Context7 resolved `/vercel/next.js`, used available version `v16.2.9` for
  server-action/cookie guidance, and cross-checked current official `16.3.4`
  [authentication documentation](https://nextjs.org/docs/app/guides/authentication):
  layouts alone do not authorize actions; check each mutation and use secure
  session cookies. Installed declarations remain the API syntax authority.
- Context7 resolved `/shadcn-ui/ui` and queried login form composition,
  `useActionState`, pending feedback, and accessible errors; use existing local
  primitives rather than regenerating the theme.
  [shadcn Next.js forms](https://ui.shadcn.com/docs/forms/next).
- Supabase skill, current changelog index, and Context7 `/supabase/supabase`
  query on backend-only table grants/RLS. Protect new tables through existing
  Medusa migration ownership; do not introduce Supabase Auth or migration history.

## Expanded vendor dashboard appendix

The native routes below were checked in installed route implementations,
validators, and published type declarations. `M` means `HttpTypes` from
`@mercurjs/types`. Use the existing vendor SDK's `client.fetch`, member bearer
token, and `x-seller-id` on every scoped call. This app's Medusa SDK has no
`sdk.vendor` namespace. Do not substitute admin routes in the vendor app.

| Surface/action | Verified native request/response | Implementation behavior |
| --- | --- | --- |
| Profile | `GET/POST /vendor/sellers/me` → `M.VendorSellerResponse`; POST accepts name, handle, email, phone, description, logo, banner, website_url | Real non-sensitive profile form; contact-email edits never change member/auth binding; no seller-status/premium/bank controls |
| Business address | `POST /vendor/sellers/:id/address` with native `UpdateSellerAddressDTO` fields → `M.VendorSellerResponse` | Validate selected seller, save independent business address, refetch |
| Company | `POST /vendor/sellers/:id/professional-details {corporate_name}` → `M.VendorSellerResponse` | Company name only; no tax/registration/KYC fields |
| Locations | `GET /vendor/stock-locations` → `M.VendorStockLocationListResponse`; `POST /vendor/stock-locations {name,address?}` and `POST /vendor/stock-locations/:id` → `M.VendorStockLocationResponse` | Native address requires address_1/country_code and supports city/province/postal/phone; do not create shipping services implicitly |
| Catalog | `GET /vendor/products?limit=20&offset=0&q=...` → `M.VendorProductListResponse`; `has_offer=true` filters offered products; status filters are arrays | List intentionally includes own drafts plus eligible published shared master products; do not call global catalog count seller inventory |
| Product detail | `GET /vendor/products/:id` → `M.VendorProductResponse` | Show content/publication state; verify private-draft visibility on direct ID reads |
| New product | `POST /vendor/products` → `201 M.VendorProductResponse`; title, description, categories `[{id}]`, optional draft/proposed status and variants/options | Save draft or submit proposed; backend defaults status to proposed and derives creator seller |
| Edit product | `POST /vendor/products/:id` → **202 `{product_change: ProductChangeDTO}`** | Staged change, not immediate live-product update; display pending review |
| Change preview | `GET /vendor/products/:id/preview` → `{product_change: ProductChangeDTO|null}` | Published ProductChangeStatus values: pending, confirmed, declined, canceled; expose feedback |
| Offers | `GET /vendor/offers` → `M.VendorOfferListResponse`; `GET /vendor/offers/:id` → `M.VendorOfferResponse` | Seller offer owns SKU, prices, inventory, and shipping-profile association |
| Offer price edit | `POST /vendor/offers/:id` with `M.VendorUpdateOfferReq` → `M.VendorOfferResponse` | If prices is included, it replaces the price ladder; send the full intended ladder or omit it; display units, never cents conversion |
| Inventory | `GET /vendor/inventory-items` → `M.VendorInventoryItemListResponse`; `GET /vendor/inventory-items/:id/location-levels` → `M.VendorInventoryLevelListResponse` | Actual stocked/reserved/available/incoming quantities, with locations |
| Set stock | `POST /vendor/inventory-items/:id/location-levels/:location_id {stocked_quantity,incoming_quantity?}` → `M.VendorInventoryItemResponse` | Nonnegative finite quantities, integer units in this UI; absolute target quantity, not an increment; re-read after save |
| Add stock level | `POST /vendor/inventory-items/:id/location-levels {location_id,stocked_quantity,incoming_quantity?}` → `M.VendorInventoryItemResponse` | Select and validate owned locations on backend; no arbitrary IDs |
| Orders | `GET /vendor/orders` → `M.VendorOrderListResponse`; `GET /vendor/orders/:id` → `M.VendorOrderResponse` | Real list/search/pagination/detail/items/addresses/fulfillments and currency-aware totals; read-only for this release |

Use published request types where they exist and generated declarations from
verified native validator exports where they do not. Never import those server
validators at runtime in a frontend. Published response contracts above remain
the entity source of truth. Native date-valued DTOs need JSON-safe serialization
at the server/client boundary; do not write duplicate entity models.

### Coherent delivery for the existing tabs

1. **Home:** live seller identity and setup checklist, real recent orders, and
   exact native list counts for offered products, inventory items, and orders.
   Remove synthetic revenue/growth charts; do not sum one page and label it
   all-time revenue. Period-wide revenue analytics needs a scoped aggregation
   and an agreed financial definition, so defer that chart.
2. **Catalog:** real list/detail, create draft/proposed, stage text/content edits,
   and visible pending/declined state. Keep `product_request` policy (installed
   default true). No force-publish switch. Show existing own offers and their
   actual prices/stock separately from master catalog content.
3. **Inventory:** native items/levels, add a level at an owned location, set
   quantity, and verify persistence. Preserve reservation invariants; no force
   deletion or destructive batch controls. Inventory is linked to offers,
   not master variants.
4. **Orders:** live list and detail. Per the coordinator's final assigned scope,
   no capture/refund, cancel/complete order, fulfillment, shipment, or delivery
   mutation is enabled in this wave.
5. **Settings:** real profile, address, company name, and stock-location setup.
   Keep real sign-out/identity; remove simulated operational toggles. Checklist
   destinations must point to these actual forms.

Only connected surfaces lose their demo notices. Empty/error responses must
never fall back to synthetic records. Revalidate context in each page/server
action, use explicit pending/error/empty states, and refresh after mutations.
Existing non-owner members may have restricted RBAC capabilities: UI hints
complement backend permissions, not replace them.

### Dependencies and important native-route caveats

- **Products and offers differ.** Installed `learn/offers.mdx` and offer
  validators confirm new offers require `sku`, `variant_id`,
  `shipping_profile_id`, nonempty `inventory_items`, and nonempty `prices`.
  `M.VendorCreateOfferReq` exists. Native product-variant create bodies do not
  accept a generic Medusa prices/inventory payload. New sellable offers await
  an eligible variant and existing shipping profile; do not create fulfillment
  configuration implicitly. Existing offer price edits need no payment/payout
  expansion.
- **Product moderation remains separate.** Editing stages a change and rejects
  another pending change. A future focused admin product-review surface can
  connect native approval routes after contract/permission verification;
  otherwise publication remains an explicitly reported operator dependency.
  Seller approval never approves products automatically.
- **Inventory location scoping:** the inspected native level update validates
  seller ownership of the inventory item, but neither that route nor its
  middleware independently checks ownership of supplied location_id. Verify
  and harden both IDs (including nested create/batch inputs) before exposing
  writes. Test own item + foreign location, foreign item + own location, and
  forged seller header. A filtered dropdown is insufficient.
- **Catalog visibility:** native product list filters own products and eligible
  published catalog entries, while the inspected detail route queries by ID.
  Test detail/preview/mutations against another seller's private/proposed
  product; add a local guard for demonstrated gaps. Preserve intentional shared
  published catalog visibility and native product-change rules.
- **Absolute stock concurrency:** the native endpoint sets a quantity; it is
  not an atomic increment or compare-and-set. Re-read after save. If strict
  stale-write prevention is needed, use a narrow versioned backend workflow
  adapter; pre-reading from a Next server action is not atomic protection.
- **Images:** defer initial application logo upload and new upload controls
  until durable storage is configured. Validate optional URL fields and use
  explicit Next remote-image origins; no arbitrary URL proxy.
- **Shipping/order mutations:** native fulfillment/shipment/cancel endpoints
  exist, but require configured location/stock/providers, correct order states,
  and potentially payment side effects. Existence is not permission to enable
  them in this release. Show dependencies honestly.

Expanded tests: two-seller isolation and revocation, native product-edit 202 and
pending preview, master/offer distinction, real stock persistence/reservations/
location ownership, profile/address/company persistence, genuine empty orders,
API failures without demo fallback, native currency units, and exact count
metrics. Use disposable fixtures; do not mutate/delete real catalog, stock, or
orders for demonstration. The independent vendor worker will verify its actual
route fields/signatures again before implementing each call.
