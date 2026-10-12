import { toast } from "sonner";

export type Feedback = { status: string; message?: string };

export function notifyFeedback(feedback: Feedback) {
  if (!feedback.message || feedback.status === "idle") return;
  const notify =
    feedback.status === "success"
      ? toast.success
      : feedback.status === "error"
        ? toast.error
        : feedback.status === "warning" ||
            feedback.status === "conflict" ||
            feedback.status === "processing" ||
            feedback.status === "mfa_required"
          ? toast.warning
          : toast.info;
  return notify(feedback.message);
}

// Notify before revalidation can replace the form, once per completed attempt.
export function withFeedbackToast<Args extends unknown[], Result extends Feedback>(
  action: (...args: Args) => Promise<Result>,
) {
  return async (...args: Args): Promise<Result> => {
    const result = await action(...args);
    notifyFeedback(result);
    return result;
  };
}
