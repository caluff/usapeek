"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import type { CommissionRateDTO } from "@mercurjs/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SettingsOption } from "@/components/ui/settings-option";
import { withFeedbackToast } from "@/lib/feedback";
import { updateCommissionAction } from "../actions";
import { parseCommissionPercentage, type CommissionState } from "../helpers";

export function CommissionRefresh() {
  const router = useRouter();
  return (
    <Button type="button" variant="outline" onClick={() => router.refresh()}>
      Reintentar
    </Button>
  );
}

export function CommissionForm({
  rate,
  baseDescription,
}: {
  rate: Pick<CommissionRateDTO, "id" | "value" | "is_enabled">;
  baseDescription: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isSavingRef = useRef(false);
  return (
    <SettingsOption
      label="Porcentaje"
      labelContent={<CommissionExplanation baseDescription={baseDescription} />}
      value={
        <span className="inline-flex flex-wrap items-center justify-end gap-3">
          <span className="tabular-nums">{rate.value} %</span>
          <Badge variant={rate.is_enabled ? "success" : "secondary"}>
            {rate.is_enabled ? "Activa" : "Inactiva"}
          </Badge>
        </span>
      }
      description="Los cambios pueden recalcular la comisión de pedidos existentes."
      open={isOpen}
      onOpenChange={(open) => {
        if (!isSavingRef.current) setIsOpen(open);
      }}
    >
      <CommissionPercentageForm
        key={`${rate.id}:${rate.value}`}
        rate={rate}
        onSaved={() => setIsOpen(false)}
        onSavingChange={(isSaving) => {
          isSavingRef.current = isSaving;
        }}
      />
    </SettingsOption>
  );
}

export function CommissionExplanation({
  baseDescription,
}: {
  baseDescription: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="link"
          static
          className="min-h-11 px-0 text-sm font-medium text-foreground underline decoration-muted-foreground/50 decoration-dotted underline-offset-4"
          aria-label="Porcentaje: cómo se calcula la comisión"
        >
          Porcentaje
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Cómo se calcula la comisión</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            Se aplica cuando no hay una comisión más específica.{" "}
            {baseDescription}
          </p>
          <p>
            Si un pedido cambia después, su comisión puede recalcularse con el
            porcentaje vigente, incluso para pedidos existentes.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CommissionPercentageForm({
  rate,
  onSaved,
  onSavingChange,
}: {
  rate: Pick<CommissionRateDTO, "id" | "value">;
  onSaved: () => void;
  onSavingChange: (isSaving: boolean) => void;
}) {
  const [percentage, setPercentage] = useState(String(rate.value));
  const [state, action, isPending] = useActionState(
    withFeedbackToast(async (previous: CommissionState, formData: FormData) => {
      onSavingChange(true);
      try {
        const result = await updateCommissionAction(previous, formData);
        if (result.status === "success") onSaved();
        return result;
      } finally {
        onSavingChange(false);
      }
    }),
    { status: "idle" },
  );
  const hasChanges = parseCommissionPercentage(percentage) !== rate.value;
  return (
    <form action={action} className="space-y-4" aria-busy={isPending}>
      <input type="hidden" name="rate_id" value={rate.id} />
      <input type="hidden" name="expected_value" value={rate.value} />
      <Field>
        <FieldLabel htmlFor="commission-percentage">Porcentaje (%)</FieldLabel>
        <Input
          id="commission-percentage"
          name="percentage"
          type="number"
          min="0"
          max="100"
          step="any"
          required
          value={percentage}
          onChange={(event) => setPercentage(event.target.value)}
          disabled={isPending}
          aria-describedby="commission-percentage-help"
          className="max-w-48 tabular-nums"
        />
        <FieldDescription id="commission-percentage-help">
          Entre 0 y 100 %.
        </FieldDescription>
      </Field>
      <Button type="submit" disabled={isPending || !hasChanges}>
        {isPending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : null}
        {isPending ? "Guardando…" : "Guardar cambios"}
      </Button>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {state.message}
        </p>
      ) : null}
      {state.status === "error" && !isPending ? <CommissionRefresh /> : null}
    </form>
  );
}
