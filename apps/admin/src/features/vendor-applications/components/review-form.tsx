"use client";

import type {
  AdminApplicationView,
  ReviewApplicationBody,
} from "@usapeek/vendor-onboarding-contracts";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { withFeedbackToast } from "@/lib/feedback";
import { reviewApplicationAction } from "../actions";
import { PENDING_APPLICATIONS_CHANGED } from "./pending-applications-provider";

const DECISIONS = {
  approve: {
    label: "Aprobar solicitud",
    description:
      "Se creará y habilitará la tienda en Mercur, conservando la cuenta de comprador del solicitante.",
  },
  request_changes: {
    label: "Solicitar cambios",
    description:
      "El solicitante podrá corregir los datos y enviar una nueva revisión. Explica exactamente qué debe cambiar.",
  },
  reject: {
    label: "Rechazar solicitud",
    description:
      "Esta decisión cierra la solicitud y no habilita acceso como vendedor. El motivo será visible para el solicitante.",
  },
};

export function ApplicationReviewForm({
  application,
  mutationId,
}: {
  application: Pick<
    AdminApplicationView,
    "id" | "version" | "status" | "approval_state"
  >;
  mutationId: string;
}) {
  const router = useRouter();
  const [decision, setDecision] =
    useState<ReviewApplicationBody["decision"]>("request_changes");
  const [reason, setReason] = useState("");
  const [requestId, setRequestId] = useState(mutationId);
  const [state, action, isPending] = useActionState(
    withFeedbackToast(reviewApplicationAction.bind(null, application.id)),
    { status: "idle" },
  );
  const isProcessing =
    application.approval_state === "processing" ||
    state.status === "processing";
  useEffect(() => {
    if (state.status === "success" || state.status === "processing")
      window.dispatchEvent(new Event(PENDING_APPLICATIONS_CHANGED));
  }, [state]);
  const canReview =
    application.status === "submitted" &&
    !isProcessing &&
    state.status !== "success";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revisión administrativa</CardTitle>
        <CardDescription>
          Las decisiones se aplican a la versión {application.version} y quedan
          registradas en el historial.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {application.approval_state === "failed" && (
          <p role="alert" className="text-sm text-destructive">
            La habilitación anterior no se completó. La cuenta no tiene acceso
            por esta solicitud. Revisa el estado técnico antes de reintentar.
          </p>
        )}
        {canReview ? (
          <form action={action} className="space-y-5" aria-busy={isPending}>
            <input type="hidden" name="mutation_id" value={requestId} />
            <input
              type="hidden"
              name="expected_version"
              value={application.version}
            />
            <Field data-invalid={Boolean(state.fieldErrors?.decision)}>
              <FieldLabel htmlFor="review-decision">Decisión</FieldLabel>
              <NativeSelect
                id="review-decision"
                name="decision"
                value={decision}
                disabled={isPending}
                aria-describedby="decision-description"
                onChange={(event) => {
                  const value = event.target.value;
                  if (
                    value === "approve" ||
                    value === "request_changes" ||
                    value === "reject"
                  ) {
                    setDecision(value);
                    setRequestId(crypto.randomUUID());
                  }
                }}
              >
                <NativeSelectOption value="request_changes">
                  Solicitar cambios
                </NativeSelectOption>
                <NativeSelectOption value="approve">
                  Aprobar solicitud
                </NativeSelectOption>
                <NativeSelectOption value="reject">
                  Rechazar solicitud
                </NativeSelectOption>
              </NativeSelect>
              <FieldDescription id="decision-description">
                {DECISIONS[decision].description}
              </FieldDescription>
              <FieldError>{state.fieldErrors?.decision}</FieldError>
            </Field>
            {decision !== "approve" && (
              <Field data-invalid={Boolean(state.fieldErrors?.reason)}>
                <FieldLabel htmlFor="review-reason">
                  Motivo para el solicitante
                </FieldLabel>
                <Textarea
                  id="review-reason"
                  name="reason"
                  required
                  minLength={10}
                  maxLength={2000}
                  value={reason}
                  disabled={isPending}
                  aria-invalid={Boolean(state.fieldErrors?.reason)}
                  aria-describedby="reason-hint reason-error"
                  onChange={(event) => {
                    setReason(event.target.value);
                    setRequestId(crypto.randomUUID());
                  }}
                />
                <FieldDescription id="reason-hint">
                  Entre 10 y 2000 caracteres. No incluyas notas internas ni
                  información sensible.
                </FieldDescription>
                <FieldError id="reason-error">
                  {state.fieldErrors?.reason}
                </FieldError>
              </Field>
            )}
            <Button
              type="submit"
              variant={decision === "reject" ? "destructive" : "default"}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              {isPending && (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {isPending ? "Guardando decisión…" : DECISIONS[decision].label}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isProcessing
              ? "Se está habilitando la tienda. No envíes una segunda decisión."
              : "Esta solicitud no admite una nueva decisión en su estado actual."}
          </p>
        )}
        {state.message && (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={`text-sm ${state.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {state.message}
          </p>
        )}
        <Button
          variant="outline"
          onClick={() => {
            window.dispatchEvent(new Event(PENDING_APPLICATIONS_CHANGED));
            router.refresh();
          }}
          disabled={isPending}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Actualizar estado
        </Button>
      </CardContent>
    </Card>
  );
}
