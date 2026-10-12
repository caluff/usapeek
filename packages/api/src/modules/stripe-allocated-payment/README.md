# Allocated Stripe payment provider

This wraps the installed Medusa 2.18 Stripe provider module. Configure it in place
of `@medusajs/medusa/payment-stripe`, with the same provider configuration ID
`stripe` and existing options. Its native service identifier remains `stripe`,
preserving `pp_stripe_stripe`, and all other native Stripe variants are retained.

The only override suppresses a signature-verified `payment_intent.succeeded`
webhook when both the event and intent explicitly have `livemode: false`, the
intent has succeeded, and its `marketplace_final_capture_operation_id` metadata
is a nonempty string. All other events use native handling. Signature verification
uses the native configured webhook secret; the wrapper reads no environment.

The finance workflow must persist its immutable capture plan before calling
Stripe, include that operation ID in capture metadata, send its exact validated
`amount_to_capture` with ordinary single-capture semantics and stable operation idempotency,
verify the resulting amount, and record the capture through Medusa's native step
with `is_captured: true`. This wrapper performs none of those mutations. The
journal must freeze ambiguous provider outcomes and own recovery and replay;
suppressed success webhooks intentionally cannot complete a failed operation.

Medusa's provider `CapturePaymentInput` has no amount. Its native payment module
passes only payment data and the generated capture ID to the Stripe provider,
whose capture method captures the full authorization. Therefore this wrapper
does not implement an amount override or consume client-supplied payment data.
Native final partial captures retain the original authorization and partial
collection accounting; the finance journal owns the final-settlement distinction.

This provider is not the complete financial implementation. The current local
flows are restricted to Stripe TEST and USD, and automatic financial jobs remain
disabled by default. General recovery, immutable commission history, monetary
rounding, settlement and reporting remain open in the
[development audit](../../../../../docs/develpment/development-completion-audit.md).
In particular, a suppressed webhook cannot recover an uncertain local operation;
the presence of fixture-specific QA recovery scripts does not close that gap.
