"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RetryRead({
  onRetry,
  isRetrying = false,
}: {
  onRetry?: () => void;
  isRetrying?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const busy = isPending || isRetrying;
  return (
    <Button
      type="button"
      variant="outline"
      disabled={busy}
      onClick={() => startTransition(onRetry ?? (() => router.refresh()))}
    >
      <RefreshCw
        className={busy ? "animate-spin" : undefined}
        aria-hidden="true"
      />
      {busy ? "Reintentando…" : "Reintentar"}
    </Button>
  );
}
