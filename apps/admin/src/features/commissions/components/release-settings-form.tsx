"use client";

import { useActionState, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { PaymentReleaseSettingsResponse } from "@usapeek/api/finance-contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { SettingsOption } from "@/components/ui/settings-option";
import { withFeedbackToast } from "@/lib/feedback";
import { updateReleaseSettingsAction } from "../release-actions";
import { parseReleaseDelayDays, releaseDelayLabel } from "../release-settings";
import type { CommissionState } from "../helpers";
import { CommissionRefresh } from "./commission-form";
import {
  ReleaseDelayField,
  ReleaseDelayHelp,
  ReleaseDelaySettingsForm,
} from "./release-delay-settings-form";

type Settings = PaymentReleaseSettingsResponse["settings"];

export function ReleaseSettingsForm({
  settings,
  automaticAvailable,
}: {
  settings: Settings;
  automaticAvailable: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isSavingRef = useRef(false);
  return (
    <>
      <SettingsOption
        label="Modo de liberación"
        labelContent={<ReleaseExplanation />}
        value={settings.mode === "automatic" ? "Automático" : "Manual"}
        open={isOpen}
        onOpenChange={(open) => {
          if (!isSavingRef.current) setIsOpen(open);
        }}
      >
        {isOpen && (
          <ReleaseModeEditor
            key={`${settings.revision}:${automaticAvailable}`}
            settings={settings}
            automaticAvailable={automaticAvailable}
            onSaved={() => setIsOpen(false)}
            onCancel={() => setIsOpen(false)}
            onSavingChange={(pending) => {
              isSavingRef.current = pending;
            }}
          />
        )}
      </SettingsOption>
      {settings.mode === "automatic" && (
        <ReleaseDelaySettingsForm
          settings={settings}
          automaticAvailable={automaticAvailable}
        />
      )}
    </>
  );
}

function ReleaseExplanation() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="link"
          static
          className="min-h-11 px-0 text-sm font-medium text-foreground underline decoration-muted-foreground/50 decoration-dotted underline-offset-4"
          aria-label="Modo de liberación: cómo se libera el dinero"
        >
          Modo de liberación
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Cómo se libera el dinero</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            En automático, el importe neto se libera a la tienda al vencer el
            tiempo de espera desde la finalización verificada del pedido. En
            manual, el administrador inicia cada liberación.
          </p>
          <p>
            Activar el modo automático también incluye pedidos ya completados
            que tengan registrada su finalización. Los pedidos ya completados
            conservan su fecha de liberación; cambiar el tiempo de espera solo
            afecta a nuevas finalizaciones. Los pedidos retenidos quedan
            excluidos.
          </p>
          <p>
            El dinero pasa al saldo de Stripe de la tienda. El retiro a su banco
            sigue la configuración de Stripe.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseModeEditor({
  settings,
  automaticAvailable,
  onSaved,
  onCancel,
  onSavingChange,
}: {
  settings: Settings;
  automaticAvailable: boolean;
  onSaved: () => void;
  onCancel: () => void;
  onSavingChange: (pending: boolean) => void;
}) {
  const [mode, setMode] = useState(settings.mode);
  const [delayDays, setDelayDays] = useState(String(settings.delay_days));
  const parsedDelayDays = parseReleaseDelayDays(delayDays);
  const [state, action, isPending] = useActionState(
    withFeedbackToast(async (previous: CommissionState, formData: FormData) => {
      onSavingChange(true);
      try {
        const result = await updateReleaseSettingsAction(previous, formData);
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
      {mode === "manual" && (
        <input type="hidden" name="delay_days" value={settings.delay_days} />
      )}
      <Field>
        <FieldLabel htmlFor="payment-release-mode">
          Modo de liberación
        </FieldLabel>
        <NativeSelect
          id="payment-release-mode"
          name="mode"
          value={mode}
          disabled={isPending}
          aria-describedby="payment-release-mode-help"
          onChange={(event) => {
            if (
              event.target.value === "manual" ||
              (event.target.value === "automatic" && automaticAvailable)
            )
              setMode(event.target.value);
          }}
        >
          <NativeSelectOption value="manual">Manual</NativeSelectOption>
          <NativeSelectOption value="automatic" disabled={!automaticAvailable}>
            Automático
          </NativeSelectOption>
        </NativeSelect>
      </Field>
      {mode === "automatic" && (
        <ReleaseDelayField
          value={delayDays}
          onChange={setDelayDays}
          isPending={isPending}
          id="payment-release-mode-delay-days"
        />
      )}
      <div
        id="payment-release-mode-help"
        className="space-y-3 text-sm leading-6 text-muted-foreground"
      >
        {!automaticAvailable && (
          <p>
            Para activar la liberación automática se necesita una configuración
            de Stripe compatible.
          </p>
        )}
        {mode === "manual" && (
          <p>
            Cada liberación del importe neto a la tienda requiere una operación
            del administrador.
          </p>
        )}
        {mode === "manual" && (
          <p>
            El tiempo de espera guardado se conserva para volver al modo
            automático: {releaseDelayLabel(settings.delay_days)}.
          </p>
        )}
        {mode === "automatic" && (
          <p>
            Los pedidos anteriores conservan su fecha; si venció, el siguiente
            ciclo puede liberarlos.
          </p>
        )}
        {mode === "manual" && (
          <p>
            La liberación envía el dinero al saldo de Stripe de la tienda. El
            retiro al banco sigue la configuración de Stripe.
          </p>
        )}
      </div>
      {mode === "automatic" && <ReleaseDelayHelp delayDays={parsedDelayDays} />}
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={
            isPending ||
            (mode === settings.mode &&
              (mode === "manual" || parsedDelayDays === settings.delay_days)) ||
            (mode === "automatic" &&
              (!automaticAvailable || parsedDelayDays === null))
          }
        >
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
