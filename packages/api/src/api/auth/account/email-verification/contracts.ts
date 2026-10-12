export type AccountEmailVerificationResponse = {
  email: string;
  status: "verified" | "unverified";
  source: "email" | "google" | null;
};
export type { RequestAccountEmailVerificationInput, ConfirmAccountEmailVerificationInput } from "./validators";

export type RequestAccountEmailVerificationResponse = { status: "requested" };

