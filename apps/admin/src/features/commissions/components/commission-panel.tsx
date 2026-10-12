import { FetchError } from "@medusajs/js-sdk";
import { unstable_rethrow } from "next/navigation";
import { FeedbackToast } from "@/components/feedback-toast";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdminSdk } from "@/lib/auth-sdk";
import {
  canEditCommission,
  commissionBaseDescription,
  commissionErrorMessage,
} from "../helpers";
import { readDefaultCommission } from "../operations";
import {
  CommissionExplanation,
  CommissionForm,
  CommissionRefresh,
} from "./commission-form";

export function CommissionSkeleton() {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-label="Cargando comisión global"
      aria-busy="true"
    >
      <Skeleton className="h-16 w-full" aria-hidden="true" />
      <span className="sr-only">Cargando comisión global…</span>
    </div>
  );
}

export async function CommissionPanel() {
  let rate;
  try {
    const sdk = await requireAdminSdk();
    rate = await readDefaultCommission(sdk.client);
  } catch (error) {
    unstable_rethrow(error);
    const message = commissionErrorMessage(
      error instanceof FetchError ? error.status : undefined,
    );
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comisión no disponible</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FeedbackToast status="error" message={message} />
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
          <CommissionRefresh />
        </CardContent>
      </Card>
    );
  }
  if (!rate)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin comisión global configurada</CardTitle>
          <CardDescription>
            No hay una comisión predeterminada disponible para editar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CommissionRefresh />
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-4">
      {canEditCommission(rate) ? (
        <CommissionForm
          key={rate.id}
          rate={{ id: rate.id, value: rate.value, is_enabled: rate.is_enabled }}
          baseDescription={commissionBaseDescription(rate)}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex min-h-16 items-center justify-between gap-4 py-2 pr-14">
            <CommissionExplanation
              baseDescription={commissionBaseDescription(rate)}
            />
            <Badge variant={rate.is_enabled ? "success" : "secondary"}>
              {rate.is_enabled ? "Activa" : "Inactiva"}
            </Badge>
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            Esta comisión está inactiva o tiene condiciones específicas y no se
            puede editar aquí.
          </p>
        </div>
      )}
    </div>
  );
}
