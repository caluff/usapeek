"use client";

import { useActionState, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { PaymentCaptureSettingsResponse } from "@usapeek/api/finance-contracts";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { SettingsOption } from "@/components/ui/settings-option";
import { withFeedbackToast } from "@/lib/feedback";
import { updateCaptureSettingsAction } from "../capture-actions";
import type { CommissionState } from "../helpers";
import { CommissionRefresh } from "./commission-form";

type Settings = PaymentCaptureSettingsResponse["settings"];

export function CaptureSettingsForm({ settings }: { settings: Settings }) {
  const [isOpen, setIsOpen] = useState(false);
  const isSavingRef = useRef(false);
  return (
    <SettingsOption
      label="Modo de cobro"
      value={settings.mode === "automatic" ? "Automático" : "Manual"}
      description="Elige cuándo confirmar el cobro de las compras."
      open={isOpen}
      onOpenChange={(open) => {
        if (!isSavingRef.current) setIsOpen(open);
      }}
    >
      {isOpen && (
        <CaptureModeEditor
          key={settings.revision}
          settings={settings}
          onSaved={() => setIsOpen(false)}
          onCancel={() => setIsOpen(false)}
          onSavingChange={(pending) => {
            isSavingRef.current = pending;
          }}
        />
      )}
    </SettingsOption>
  );
}

function CaptureModeEditor({
  settings,
  onSaved,
  onCancel,
  onSavingChange,
}: {
  settings: Settings;
  onSaved: () => void;
  onCancel: () => void;
  onSavingChange: (pending: boolean) => void;
}) {
  const [mode, setMode] = useState(settings.mode);
  const [state, action, isPending] = useActionState(
    withFeedbackToast(async (previous: CommissionState, formData: FormData) => {
      onSavingChange(true);
      try {
        const result = await updateCaptureSettingsAction(previous, formData);
        if (result.status === "success") onSaved();
        return result;
      } finally {
        onSavingChange(false);
      }
    }),
    { status: "idle" },
  );
  return (
    <form action={action} className="space-y-5" aria-busy={isPending}>
      <input type="hidden" name="expected_revision" value={settings.revision} />
      <Field>
        <FieldLabel htmlFor="payment-capture-mode">Modo de cobro</FieldLabel>
        <NativeSelect
          id="payment-capture-mode"
          name="mode"
          value={mode}
          disabled={isPending}
          aria-describedby="payment-capture-mode-help"
          onChange={(event) => {
            if (
              event.target.value === "manual" ||
              event.target.value === "automatic"
            )
              setMode(event.target.value);
          }}
        >
          <NativeSelectOption value="manual">Manual</NativeSelectOption>
          <NativeSelectOption value="automatic">Automático</NativeSelectOption>
        </NativeSelect>
      </Field>
      <div
        id="payment-capture-mode-help"
        className="space-y-3 text-sm leading-6 text-muted-foreground"
      >
        <p>
          {mode === "automatic"
            ? "El cobro se confirma automáticamente cuando todos los pedidos activos de la compra están completamente preparados. Los pedidos cancelados quedan excluidos."
            : "El administrador confirma el cobro con «Cobrar compra», cuando todos los pedidos activos están preparados."}
        </p>
        {mode === "automatic" && (
          <p>
            También se revisan las compras ya preparadas que estén pendientes de
            cobro.
          </p>
        )}
        <p>
          Al completar el checkout se reserva el importe en la tarjeta. Esta
          opción cambia cómo se confirma el cobro; la liquidación a las tiendas
          sigue su propio proceso.
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending || mode === settings.mode}>
          {isPending && (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          )}
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
      {state.message && (
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
      )}
      {state.status === "error" && !isPending && <CommissionRefresh />}
    </form>
  );
}
