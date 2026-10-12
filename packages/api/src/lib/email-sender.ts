type EmailSenderEnvironment = {
  RESEND_FROM_EMAIL?: string;
  AUTH_EMAIL_FROM?: string;
};

export function getEmailSender(environment: EmailSenderEnvironment = process.env) {
  return (environment.RESEND_FROM_EMAIL ?? environment.AUTH_EMAIL_FROM)?.trim();
}
