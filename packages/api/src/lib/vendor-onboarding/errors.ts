import { MedusaError } from "@medusajs/framework/utils";

export class OnboardingError extends MedusaError {
  readonly status: number;
  constructor(code: string, status = 409, message = code) {
    super(status === 403 ? MedusaError.Types.NOT_ALLOWED : status === 404 ? MedusaError.Types.NOT_FOUND : status === 400 ? MedusaError.Types.INVALID_DATA : MedusaError.Types.CONFLICT, message, code);
    this.status = status;
  }
}
