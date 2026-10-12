import type { ApplicationStatus } from "@usapeek/vendor-onboarding-contracts";

import { Badge } from "@/components/ui/badge";
import { APPLICATION_STATUS_LABELS } from "../helpers";

export function ApplicationStatusBadge({
  status,
}: {
  status: ApplicationStatus;
}) {
  return (
    <Badge
      variant={
        status === "approved"
          ? "success"
          : status === "submitted" || status === "changes_requested"
            ? "warning"
            : "neutral"
      }
      className={
        status === "rejected"
          ? "border-destructive/25 bg-destructive/10 text-destructive"
          : undefined
      }
    >
      {APPLICATION_STATUS_LABELS[status]}
    </Badge>
  );
}
