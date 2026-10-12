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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SettingsOption } from "@/components/ui/settings-option";
import { withFeedbackToast } from "@/lib/feedback";
import type { CommissionState } from "../helpers";
import { updateReleaseSettingsAction } from "../release-actions";
import { parseReleaseDelayDays, releaseDelayLabel } from "../release-settings";
import { CommissionRefresh } from "./commission-form";

type Settings = PaymentReleaseSettingsResponse["settings"];

export function ReleaseDelaySettingsForm({
  settings,
  automaticAvailable,
}: {
  settings: Settings;
  automaticAvailable: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isSavingRef = useRef(false);
  return (
    <SettingsOption
      label="Tiempo de espera"
      labelContent={<ReleaseDelayExplanation />}
      value={releaseDelayLabel(settings.delay_days)}
      description="Se aplica a los pedidos que se completen después de guardar."
      open={isOpen}
      onOpenChange={(open) => {
        if (!isSavingRef.current) setIsOpen(open);
      }}
    >
      {isOpen && (
        <ReleaseDelayEditor
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
  );
}

function ReleaseDelayExplanation() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="link"
          static
          className="min-h-11 px-0 text-sm font-medium text-foreground underline decoration-muted-foreground/50 decoration-dotted underline-offset-4"
          aria-label="Tiempo de espera: cómo se calcula el plazo"
        >
          Tiempo de espera
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Cómo se calcula el plazo</DialogTitle>
        </DialogHeader>
        <ReleaseDelayHelp delayDays={null} isInformation />
      </DialogContent>
    </Dialog>
  );
}

export function ReleaseDelayField({
  value,
  onChange,
  isPending,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  isPending: boolean;
  id: string;
}) {
  return (
    <Field>
      <FieldLabel id={`${id}-label`}>Tiempo de espera</FieldLabel>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-labelledby={`${id}-label`}
      >
        {[0, 3, 7].map((days) => (
          <Button
            key={days}
            type="button"
            variant={
              parseReleaseDelayDays(value) === days ? "secondary" : "outline"
            }
            size="sm"
            className="min-h-11"
            disabled={isPending}
            aria-pressed={parseReleaseDelayDays(value) === days}
            onClick={() => onChange(String(days))}
          >
            {releaseDelayLabel(days)}
          </Button>
        ))}
        <div className="flex items-center gap-3">
          <Separator orientation="vertical" className="h-6" />
          <Input
            id={id}
            name="delay_days"
            type="number"
            min="0"
            max="365"
            step="1"
            required
            aria-label="Cantidad de días"
            placeholder="Días"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={isPending}
            className="h-11 w-24 tabular-nums"
          />
        </div>
      </div>
    </Field>
  );
}

export function ReleaseDelayHelp({
  delayDays,
  isInformation = false,
}: {
  delayDays: number | null;
  isInformation?: boolean;
}) {
  if (!isInformation)
    return (
      <div className="space-y-3 text-sm leading-6 text-muted-foreground">
        <p>
          Días de 24 horas, incluidos fines de semana y feriados. El nuevo plazo
          solo aplica a pedidos que se completen después de guardar.
        </p>
        {delayDays === 0 && (
          <p>
            El pedido queda elegible al completarse; la liberación ocurre en el
            siguiente ciclo automático.
          </p>
        )}
        <p>
          El dinero pasa al saldo de Stripe de la tienda; el retiro al banco
          sigue su configuración.
        </p>
      </div>
    );
  return (
    <div className="space-y-3 text-sm leading-6 text-muted-foreground">
      <p>
        El plazo empieza con la finalización verificada del pedido. Cada día
        equivale a 24 horas; se incluyen fines de semana y feriados.
      </p>
      {delayDays === null || delayDays === 0 ? (
        <p>
          Con «Inmediato», el pedido queda elegible al completarse y se procesa
          en el siguiente ciclo automático. Los pedidos retenidos quedan
          excluidos.
        </p>
      ) : null}
      <p>
        El nuevo plazo solo aplica a pedidos que se completen después de
        guardar. Los pedidos ya completados conservan su fecha de liberación.
      </p>
      <p>
        El dinero pasa al saldo de Stripe de la tienda. Su retiro al banco sigue
        la configuración de Stripe.
      </p>
    </div>
  );
}

function ReleaseDelayEditor({
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
      <input type="hidden" name="mode" value={settings.mode} />
      <input type="hidden" name="expected_revision" value={settings.revision} />
      <ReleaseDelayField
        value={delayDays}
        onChange={setDelayDays}
        isPending={isPending}
        id="payment-release-delay-days"
      />
      {!automaticAvailable && (
        <p className="text-sm leading-6 text-muted-foreground">
          Para guardar el plazo automático se necesita una configuración de
          Stripe compatible.
        </p>
      )}
      <ReleaseDelayHelp delayDays={parsedDelayDays} />
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
            !automaticAvailable ||
            parsedDelayDays === null ||
            parsedDelayDays === settings.delay_days
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
