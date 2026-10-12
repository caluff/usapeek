export type VendorSessionIssueResponse = { code: string };
export type VendorSessionConsumeResponse =
  | { status: "authenticated"; token: string }
  | { status: "verification_required"; token: string; email: string };
