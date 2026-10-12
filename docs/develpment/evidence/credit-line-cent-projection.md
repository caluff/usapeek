# Exact-cent native credit projection

On 2026-09-26, the first USD 0.01 refund after the native USD 2 + USD 3
refund sequence completed its Stripe refund and transfer reversal, persisted the
native refund and USD -0.01 order transaction, then stopped before creating the
credit line. The financial journal remained `uncertain` and the group fence
remained active. No second money request was issued during diagnosis.

The coordinator's read-only PostgreSQL inspection found an exact persisted
`order_summary.totals.pending_difference` of `0.01`, including its raw value.
The native graph projection with `total` returned zero, with caching enabled or
disabled. Removing `total` returned the exact persisted `0.01` in both cases.

Medusa 2.18.0 `decorateCartTotals` replaces a pending difference whose absolute
value is at most the currency epsilon with zero. USD epsilon is `0.01`.
`createOrderCreditLinesWorkflow` unnecessarily requested `total`, invoking that
decorator before its native validator. Its validator correctly rejects a credit
when the supplied pending difference is zero.

The existing reproducible `@mercurjs/core@2.3.3` pnpm patch now extends Mercur's
bundled `@medusajs+core-flows@2.18.0.patch` to omit `total` from that one query.
The workflow uses only order ID, status and the accounting summary. Native
validation, order-change actions, confirmation, compensation and the
`creditLinesCreated` hook remain in place. No epsilon, amount, provider operation
or general totals behavior changes.

Run the offline native regression from `packages/api`:

```powershell
node --test scripts/credit-line-projection.test.cjs
```

The eight cases check the installed correction occurs exactly once, reject a
second forward application of the outer patch, reproduce the decorator failure,
apply the outer pnpm
patch and both inner native patches, exercise Mercur's real loader with
core-flows already loaded, create the exact-cent credit through the native
workflow and hook, preserve invalid-credit rejections, and retain native
compensation on confirmation failure. Persistence is simulated in this test;
it is not a PostgreSQL integration or Stripe-provider success claim.

The package lock must be regenerated with pnpm when integrating the changed
patch. The coordinator owns that update because the shared worktree already has
unrelated lockfile changes. Restart the isolated QA API after installing the
updated package patch. The existing refund operation must be inspected and
recovered by its original operation ID; recovery should create only its missing
credit line. Actual recovery and the remaining refund sequence are separate
verification gates, not established by this offline regression.

## Repeated installation protection

The initial append-only outer hunk could be applied twice because its context
remained unchanged. pnpm 12.0.0 tries the forward patch first and checks its
reverse only when forward application fails. The installed duplicate was a
valid cached artifact: its content matched its content-addressed hash. A
hardlink alone does not establish corruption of the original package store.
See [pnpm's version-matched patch application source](https://github.com/pnpm/pnpm/blob/v12.0.0/pnpm/crates/patching/src/apply.rs).

The corrected outer patch also removes the inner diff's optional `index`
metadata line. Native JavaScript behavior is unchanged by that deletion, but
the complete outer patch can no longer be applied to its own result. The new
regression rejects duplicated, missing or outdated installed corrections.

Installation was verified outside all application worktrees using isolated
stores and pnpm 12.0.0. The official Mercur tarball matched the repository's
SHA-512 integrity and contained no credit correction. A scratch `readPackage`
hook removed dependency declarations only, to isolate installation of the
original Mercur package files without building a second application graph.
Fresh install, upgrade from the previous patch hash using the same scratch
store, frozen reinstall and a frozen offline sibling install all produced
exactly one credit correction. The eight native offline tests passed using
that freshly installed patch file with the existing Medusa runtime. The old
worktree installation was left untouched and correctly failed the new guard
with two corrections. Root and QA must install the new hash and pass the
ordinary, unredirected regression before financial recovery.
