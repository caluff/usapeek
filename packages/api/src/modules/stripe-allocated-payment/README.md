# Allocated Stripe payment provider

This wraps the installed Medusa 2.21.2 Stripe provider module. Configure it in place
of `@medusajs/medusa/payment-stripe`, with the same provider configuration ID
`stripe` and existing options. Its native service identifier remains `stripe`,
preserving `pp_stripe_stripe`. TEST retains the other native Stripe variants;
LIVE registers only the canonical provider covered by the manual allocation
workflow.

The wrapper suppresses a signature-verified `payment_intent.succeeded`
webhook when both the event and intent match the configured Stripe mode, the
intent has succeeded, and its `marketplace_final_capture_operation_id` metadata
is a nonempty string. Other matching events use native handling. The native
webhook secret verifies the signature; mismatched or missing payment-intent
modes are rejected. TEST remains the default. LIVE requires explicit mode,
enablement and platform-account configuration, and monetary provider operations
verify the platform identity before delegating to native handling.

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

The historical financial readiness evidence covers Stripe TEST and USD. LIVE
preparation uses simulated provider responses and does not certify a real payment
or bank payout. Automatic financial jobs remain TEST-only. See the
[main activation runbook](../../../../../docs/operations/stripe-live-main.md) for
the disabled preparation state and the separate activation requirements.
