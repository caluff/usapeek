// Explicit opt-in also supports deployed test environments using NODE_ENV=production.
export function isTestEmailVerificationEnabled() {
  return process.env.VENDOR_ONBOARDING_TEST_VERIFICATION === "true";
}
