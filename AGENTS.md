# usapeek

## Objective

- Produce maintainable, performant, and type-safe code that follows the patterns already established in this repository.
- Prefer the smallest safe change that fully solves the requested problem.
- Preserve product boundaries and avoid introducing marketplace capabilities that were not requested.
- Prefer consistency with nearby code and version-matched documentation over generic examples.

## Project stack

- pnpm workspace with a single root lockfile.
- Next.js 16 App Router, React 19, TypeScript 7, and Tailwind CSS 4.
- Editable shadcn/ui-style primitives, Radix UI, and Lucide icons.
- Mercur 2.3.7 on Medusa 2.21.2.
- PostgreSQL for persistence and Redis for cache, events, workflows, and locking.
- Railway Infrastructure as Code under `.railway/`.
- date-fns for date parsing, display, and calendar operations where needed.

Use pnpm only. Prefer dependencies that are already installed. Do not add a
production dependency when the platform or an existing package already covers
the requirement.

## Execution and autonomy

- Infer the user's intended scope from the request, repository context, and nearby implementation.
- When the user asks to implement, fix, refactor, review, or investigate something, carry the task through to completion rather than stopping after analysis or a plan.
- Make reasonable, reversible implementation decisions autonomously when repository conventions provide a clear answer.
- Ask the user only when a decision is genuinely blocking, materially changes product behavior, requires unavailable credentials, or would be destructive or difficult to reverse.
- Do not ask for confirmation for ordinary code edits, repository inspection, documentation lookup, targeted tests, formatting, or other reversible development actions.
- Do not stop after proposing what should be changed when the requested work can be performed directly.

## Documentation first

Use Context7 when implementation depends on version-sensitive or uncertain behavior of a library, framework, SDK, API, CLI, or cloud service, or when the user explicitly asks for documentation-backed guidance.

Do not query Context7 when the answer is already established by repository source, installed types, tests, version-matched local documentation, or a previously loaded authoritative source.

1. Call `resolve-library-id` with the library name and the user's question,
   unless an exact `/org/project` Context7 ID was provided.
2. Select the closest official source, preferring strong documentation coverage,
   source reputation, and the requested version.
3. Call `query-docs` with the selected ID and one focused concept per query.
4. Base the implementation or answer on the fetched documentation.

Do not use Context7 for business-logic debugging, general programming concepts,
ordinary refactors, or repository code review.

Before changing Mercur behavior, consult the version-matched documentation in
`node_modules/@mercurjs/docs`. Installed Mercur documentation supplements the
required skills and current framework documentation; it does not replace them.

Before every API change, inspect the installed Mercur workflows, routes,
validators, and hook registrations for the requested behavior. Reuse the native
flow when it already covers the requirement; add only the missing behavior.
Check both Mercur and application hook consumers before registering a handler:
Medusa permits only one handler per workflow hook. Preserve native validation,
inventory, pricing, authorization, and compensation behavior. For hook changes,
include a composition/load regression test with Mercur's hooks loaded.

## Existing codebase first

Before writing code:

1. Inspect the nearest implementation, package manifest, and configuration.
2. Locate existing components, SDK clients, helpers, schemas, tests, and naming
   conventions before creating new ones.
3. Confirm that an imported API, route, type, component, or utility actually
   exists. Never invent project abstractions.
4. Preserve unrelated user changes in a dirty worktree.

If a requested feature has no established local pattern, use the framework's
documented pattern and state any material assumption.

## Repository architecture

This is a monorepo organized by independently deployable application. The
backend remains a modular monolith.

```text
apps/
├── web/       # Public customer storefront
├── admin/     # Independent operator Next.js application
└── vendor/    # Independent seller Next.js application
packages/
└── api/       # Mercur/Medusa API and worker
.railway/      # Railway service definitions
```

Repository boundaries:

- Applications must not import source files directly from another application.
- Frontends must not import backend source or access PostgreSQL/Redis directly.
- Communication with the backend goes through the appropriate typed Medusa or
  Mercur SDK.
- Keep code local to an application by default. Create a shared workspace
  package only after code is genuinely reused by at least two applications and
  has a stable, application-agnostic public API.
- The shared frontend design system is established reuse, not speculative
  sharing. Its generic UI primitives, semantic design tokens, typography,
  icon rules, and motion primitives belong in a dedicated workspace package
  rather than being copied between `apps/web`, `apps/admin`, and `apps/vendor`.
  Use `packages/ui` as that package.
- Do not create a broad `shared`, `common`, or `utils` package for speculative
  reuse.

## Frontend organization

The storefront uses `apps/web/app`; the operator and vendor applications use
`apps/admin/src/app` and `apps/vendor/src/app`. Respect the structure of the
application being edited rather than moving files solely for uniformity.

Within each frontend:

- `app/`: routes, layouts, metadata, loading/error boundaries, and route-level
  composition.
- Route-local `_components/`: UI used only by that route or route subtree.
- `features/<domain>/`: substantial reusable business features, including their
  components, hooks, schemas, query keys, and feature-specific helpers.
- `components/ui/`: thin application adapters for shared primitives, or legacy
  primitives awaiting migration. New generic primitives without marketplace
  business logic belong in the shared design-system package.
- `components/`: application-wide layout and reusable presentation components.
- `lib/`: SDK clients, environment validation, infrastructure adapters, and
  generic pure helpers.

Frontend rules:

- Keep route files thin. They load/validate route input and compose feature UI.
- Use Server Components by default. Add `"use client"` only for browser APIs,
  event handlers, or client state.
- Keep server state in the backend/SDK cache rather than duplicating it in a
  global client store.
- Use Next.js `Image` for product and editorial images when compatible with the
  source. Configure allowed remote origins explicitly.
- Use dynamic routes for products, categories, sellers, and other data-driven
  entities.
- Do not hardcode products, categories, regions, inventory, shipping options, or
  other backend-owned data in operational storefront code.
- Handle loading, error, empty, and success states explicitly.
- Keep view headers concise: do not add explanatory subtitles that repeat the
  title or obvious page purpose. Reserve helper text for meaningful constraints
  and actions that need clarification.
- Maintain one marketplace visual language across the storefront, operator
  panel, and vendor panel. All three frontends must use the same canonical
  semantic colors, typography, spacing and radius scales, shadows, icon rules,
  interaction states, and motion durations/easings. Generic UI primitives such
  as buttons, fields, cards, dialogs, menus, badges, tables, tooltips, and toasts
  must converge on the same shared implementations and variants.
- Product composition may still differ by audience: storefront, operator, and
  vendor routes can use different layouts, navigation, information density, and
  domain-specific components, but those compositions must be built from the
  same design-system foundations. Do not rebrand an application independently.
- Treat the current duplicated frontend tokens and `components/ui` primitives
  as migration debt, not as separate sources of truth. Do not introduce new
  divergence. When changing a shared token or primitive, update or migrate all
  affected frontends together and verify the behavior in each application.
- Motion must use shared tokens, remain restrained for high-frequency dashboard
  interactions, and preserve keyboard usability and `prefers-reduced-motion`.
- When a flow needs a confirmation dialog, reuse `ConfirmationDialog` from
  `@usapeek/ui/confirmation-dialog` through the application's
  `components/ui/confirmation-dialog` adapter. Its implementation is in
  `packages/ui/src/confirmation-dialog.tsx`, based on the shared Radix alert
  dialog. Do not create another confirmation modal or use `window.confirm`.
  The caller owns the requested change, persistence, and error feedback: cancel
  must leave saved data unchanged, and asynchronous confirmations must pass
  `isPending`, close after the request completes, and restore focus to their
  control with `returnFocusRef` when there is no dialog trigger.

### Settings and configurable options

Use the established Configuración/Comisiones presentation for new settings
menus and configurable option views across the applications:

- Reuse `SettingsOption` from `packages/ui/src/settings-option.tsx` through the
  application's `components/ui/settings-option` adapter. Keep domain-specific
  forms and persistence in the owning feature; do not copy the generic row or
  dialog implementation.
- Group options under clearly separated section headings. Use the existing
  subtle brand tint:
  `text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]`, with
  `text-lg font-semibold` and the spacing used in Configuración.
- Present each configurable option as a plain row: label on the left, current
  value and optional status badge on the right, followed by the arrow button.
  Avoid enclosing cards, row separators, and a background highlight across the
  whole row. Put status badges beside their values instead of adding a separate
  Estado row when the status only describes that option.
- The arrow opens the editing dialog. Only the arrow button gains a background
  on hover; the adjacent value moves 4 px to the left with the shared 120 ms
  motion tokens. Preserve the component's 44 px button, visible keyboard focus,
  pointer/hover guards, and reduced-motion behavior.
- When an option needs a calculation or explanation, make its label a separate
  accessible button with a discreet dotted underline that opens an information
  dialog. Use `labelContent` while retaining the plain `label` for the editing
  dialog title and arrow's accessible name. The information button's accessible
  name must include its visible label. Avoid a separate explanatory option row
  such as Cómo se calcula when the information belongs to an existing option.
- Use the shared dialog with its transparent, blurred backdrop. Editing and
  information dialogs must have distinct triggers and return focus to the
  appropriate trigger on close.
- Canceling an editor discards its draft without changing saved data. Preserve
  validation, pending guards, error feedback, and existing concurrency checks.
  Close after a successful save and keep the row's trigger stable when refreshed
  data resets the inner form.
- Reference implementations are the account settings features in admin/vendor
  and `apps/admin/src/features/commissions/components/commission-form.tsx`.
  Apply this pattern to configurable options; keep navigation lists, data tables,
  and other domain-specific views suited to their own purpose.

### Progressive rendering and loading states

Apply these rules whenever creating or changing a view in `apps/web`,
`apps/admin`, or `apps/vendor`:

- Identify which parts actually depend on remote data before composing the
  view. Render independent content immediately: the layout, static navigation,
  hero, headings, labels, and footer must not wait for unrelated API requests.
- Isolate data-dependent content in focused components. In Server Components,
  place `await` inside the consuming child and wrap that child in a local
  `Suspense` boundary. Do not await all view data in a page or layout before
  returning otherwise independent content.
- Start independent requests in parallel and share promises or existing
  request deduplication where appropriate. Products must not wait for account,
  favorites, or seller status when only their individual controls need that
  information.
- Scope skeletons to the smallest meaningful loading region, such as a product
  grid, table body, counter, or account control. Keep already available content
  visible. Do not replace an entire view with skeletons unless the entire view
  genuinely depends on the pending data; `loading.tsx` is not a default reason
  to skeletonize static content.
- Match skeleton dimensions to the content they replace to minimize layout
  shifts. Keep empty and error states local where possible, and never show
  fabricated data or a logged-out state while authentication is unresolved.
- Preserve required authentication and authorization gates: progressive
  rendering must never expose protected content before access is verified.
- When implementing loading behavior, verify initial loads and navigation with
  slow responses: independent content appears first, only dependent regions
  show loading indicators, and those regions resolve to success, empty, or
  error states without replacing the rest of the view.

## Backend organization

`packages/api` is a Medusa/Mercur modular monolith. Follow this flow for custom
backend behavior:

```text
Module → Workflow → API route → Typed frontend SDK
```

Use the Medusa conventions below:

- `src/modules/<domain>/`: one domain's models, service, module definition, and
  migrations.
- `src/workflows/`: mutation orchestration and cross-domain business processes.
- `src/workflows/steps/`: focused workflow operations with compensation where
  applicable.
- `src/api/`: thin HTTP adapters, authentication/scoping middleware, and request
  validation.
- `src/links/`: relationships between separate modules.
- `src/subscribers/`: asynchronous reactions to domain events.
- `src/jobs/`: scheduled background work.
- `src/scripts/`: operational CLI scripts.

Backend rules:

- All mutations go through workflows. API routes must not call module mutation
  methods directly.
- Keep business validation, ownership checks, and cross-domain orchestration in
  workflows, not route handlers.
- Modules own their data and must not import or directly call other modules.
  Connect domains with module links.
- Use Medusa Query for reads across modules. Use `query.graph()` for graph
  retrieval and `query.index()` when filtering across linked modules.
- Use Zod from `@medusajs/framework/zod` in Medusa code and derive request types
  from schemas.
- Use authenticated request types for protected routes and rely on configured
  authentication/scoping middleware.
- Keep workflow composition functions synchronous; use workflow primitives such
  as steps, `transform`, and `when` rather than ordinary async control flow.
- Use static imports. Do not dynamically import workflows or modules inside
  request handlers.
- Medusa prices are stored in display units. Do not multiply or divide values by
  100 when saving or rendering prices.

## Backend integration from frontends

- Locate the existing SDK instance before adding an API call.
- Use built-in SDK methods for built-in endpoints.
- Use the SDK's generic client method for custom routes.
- Do not use raw `fetch` for Medusa/Mercur API calls; the SDK supplies required
  publishable-key, authentication, and session headers.
- Pass plain objects to SDK request bodies. Do not pre-serialize them with
  `JSON.stringify` unless the verified API explicitly requires a string.
- Use published or generated Medusa/Mercur types. Do not maintain handwritten
  copies of backend entity types in frontend applications.
- Include the correct region when retrieving priced storefront entities.

## Naming and TypeScript

- Components and types: `PascalCase`.
- Variables, functions, and hooks: `camelCase`; hooks begin with `use`.
- Constants: `UPPER_SNAKE_CASE` when they are true module-level constants.
- Files and directories: `kebab-case`, except for framework-mandated names.
- Prefer descriptive state names such as `isLoading`, `hasError`, and `canEdit`.
- Avoid `any`; use `unknown` and narrow it safely.
- Use `import type` for type-only imports.
- Prefer inference when it is clear; add explicit types at public boundaries.
- Derive TypeScript types from Zod schemas instead of duplicating validation
  shapes.
- Keep functions and components focused. Split large files at domain or behavior
  boundaries rather than extracting arbitrary tiny helpers.

## Product and security boundaries

- Store backend credentials only in the ignored root `.env`.
- Browser-visible storefront configuration may use `apps/web/.env.local` for local development and platform-managed environment variables in deployed environments. Only explicitly public values may use `NEXT_PUBLIC_*`.
  `apps/web/.env.local` must be limited to public values.
- Never commit database, Redis, signing, admin, or provider secrets.
- Keep seller registration disabled unless marketplace onboarding is explicitly
  requested.
- Do not add Stripe, checkout, seller onboarding, payments, or payouts without
  an explicit request.
- `apps/admin` and `apps/vendor` now have authentication and operational flows
  connected to Mercur. Check each route's implementation rather than assuming
  all controls are complete. Stripe remains test-only and financial development
  is not complete; use `docs/develpment/development-completion-audit.md` as the
  evidence baseline and `docs/develpment/development-progress.md` for phase status.
- Validate external input and enforce authorization on the backend. UI hiding is
  not an authorization mechanism.

## Required skills

Before planning, researching, implementing, reviewing, or debugging these areas,
load every applicable installed skill:

- Medusa backend modules, workflows, API routes, subscribers, jobs, links, or
  data models: `building-with-medusa`.
- Medusa Admin extensions: `building-admin-dashboard-customizations`.
- Storefront work or Store API consumption in `apps/web`:
  `building-storefronts` and `storefront-best-practices`.
- Database migration generation: `db-generate` plus `building-with-medusa`.
- Running Medusa migrations: `db-migrate` plus `building-with-medusa`.
- Creating a Medusa admin user: `new-user`.
- Intentional creation or redesign of frontend interfaces: `frontend-design`
  and `better-ui`.
- Animation, gesture, transition, or microinteraction work in any frontend:
  `emil-design-eng` and `better-ui`.
- Supabase-specific work: `supabase`.
- Date handling: read the project skill `docs/skills/date-fns/SKILL.md` before
  changing parsing, formatting, or calendar calculations.
- Effect setup, only when its adoption is justified for a concrete requirement:
  read the upstream skill at `docs/skills/effect-ts/SKILL.md`. Effect is not an
  adopted project dependency. Do not install it merely because this skill is
  present or because a task uses async code; preserve Medusa's workflows and
  avoid duplicating retry engines. The user's conditional adoption requirement
  takes precedence over the skill's installation step.

These two skills are stored under `docs/skills` and loaded through these explicit
paths; do not assume they are globally installed or automatically discovered.
If Effect is adopted later, read `node_modules/effect/AGENTS.md` completely before
writing Effect code, follow its required references, and inspect the installed
source/types for APIs not covered there. Verify the exact version: `effect@rc`
is a prerelease channel, not an instruction to upgrade automatically.

When a task spans multiple areas, use all applicable skills. The user's explicit
requirements take precedence over optional skill guidance.

## Code modifications

- Make the smallest coherent change that satisfies the request.
- Preserve architecture, formatting, import style, and naming in nearby files.
- Do not rewrite entire files or migrate an unrelated legacy area unless the
  user explicitly requests it.
- Avoid touching unrelated code, generated output, build artifacts, or lockfile
  entries.
- Update the root lockfile only through pnpm when dependencies actually change.
- Add comments only where intent, constraints, or non-obvious business behavior
  would otherwise be unclear.

## Validation before completion

Run checks proportional to the affected area. Do not claim a check passed unless
it was executed successfully.

During implementation:

- Prefer targeted typecheck, lint, and focused tests when useful for feedback.
- Select tests by the behavior changed, using the commands in the root README.
  Do not run the full API integration suite for localized changes or run backend
  integrations for CSS, layout, copy or animation changes alone.
- Unit tests and their runners were removed at the user's request. There is no
  general `pnpm test` command; the remaining suites are explicit HTTP/module
  integrations and require their isolated environment.
- Run HTTP/module integrations only when the change affects their persistence,
  authorization, concurrency, compensation or cross-module behavior. Select the
  relevant files with `--runTestsByPath`; run multiple HTTP files in separate
  processes. Expand to other domains only when a cross-cutting change affects them.
- External Stripe TEST suites require changes to that integration and their
  explicit disposable-environment launcher. Do not enable them as an incidental
  completion check.

At completion:

- Run the required completion checks for the affected area once.
- Repeat a check only when subsequent changes could invalidate its result.

Useful commands:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm peers check
```

Targeted variants are available as `lint:*`, `typecheck:*`, and `build:*` for
`web`, `admin`, `vendor`, and `api`. Integration runners are
`test:api:integration:http` and `test:api:integration:modules`.

- For changes limited to one application, the completion gate is its targeted lint and typecheck plus the closest meaningful tests.
- For changes to Medusa modules, workflows, links, configuration, or API routes, the completion gate is API lint, typecheck, tests, and build.
- After changing shared configuration, dependencies, or multiple applications,
  run the corresponding root checks and `pnpm peers check` when dependencies
  changed.
- Documentation-only changes do not require application builds.
- Test-only maintenance or test-command changes require the changed runners and
  applicable lint/typechecks; they do not require application builds or restarting
  deployed services when application behavior and dependencies are unchanged.
- If a required check cannot run because of missing infrastructure or
  credentials, report exactly what was not verified.

## Parallel work and subagents

Use subagents when independent work can be performed in parallel and doing so materially reduces latency or improves coverage.

Good candidates include:

- repository exploration across independent areas;
- documentation research;
- independent frontend and backend investigation;
- test failure investigation;
- review of a completed implementation.

Do not delegate trivial edits or tightly coupled work where coordination would cost more than performing the task directly.

Subagents must not make overlapping edits to the same files unless explicitly coordinated.

## Review checklist

Before finishing, verify that:

- The change follows the repository and domain boundaries above.
- Inputs, authorization, errors, and empty/loading states are handled where
  relevant.
- Independent view content renders without waiting for unrelated data, and
  skeletons are limited to the components that actually need loading states.
- Types come from schemas or official/generated contracts rather than duplicate
  definitions.
- No secret, generated artifact, unrelated edit, or unnecessary dependency was
  introduced.
- Tests exercise meaningful behavior instead of merely mirroring the
  implementation.
