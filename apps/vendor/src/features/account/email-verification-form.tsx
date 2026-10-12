"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsOption } from "@/components/ui/settings-option";
import type { AccountEmailVerificationResponse } from "@usapeek/api/auth-contracts";
import { INITIAL_VENDOR_AUTH_STATE } from "@/lib/auth-utils";
import {
  confirmAccountEmailAction,
  requestAccountEmailAction,
} from "./actions";

export function EmailVerificationForm({
  verification,
  hasCode,
}: {
  verification: AccountEmailVerificationResponse;
  hasCode: boolean;
}) {
  const [feedbackSource, setFeedbackSource] = useState<"request" | "confirm">(
    "request",
  );
  const [requestState, requestAction, isRequesting] = useActionState(
    requestAccountEmailAction,
    INITIAL_VENDOR_AUTH_STATE,
  );
  const [confirmState, confirmAction, isConfirming] = useActionState(
    confirmAccountEmailAction,
    INITIAL_VENDOR_AUTH_STATE,
  );
  const isVerified =
    verification.status === "verified" || confirmState.status === "success";
  const isPending = isRequesting || isConfirming;
  const feedback = feedbackSource === "confirm" ? confirmState : requestState;

  return (
    <SettingsOption
      label="Correo electrónico"
      description="Verificación del correo de tu cuenta."
      defaultOpen={hasCode && !isVerified}
      value={
        <span className="flex flex-wrap items-center justify-end gap-2">
          <span className="break-all">{verification.email}</span>
          <Badge variant={isVerified ? "success" : "warning"}>
            {isVerified ? "Verificado" : "Sin verificar"}
          </Badge>
        </span>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 break-all text-sm font-medium">
            {verification.email}
          </p>
          <Badge variant={isVerified ? "success" : "warning"}>
            {isVerified ? "Verificado" : "Sin verificar"}
          </Badge>
        </div>
        {isVerified ? (
          verification.source === "google" ? (
            <p className="text-sm text-muted-foreground">
              Cuenta de Google verificada
            </p>
          ) : null
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {hasCode
                ? "Confirma el enlace para verificar el correo de tu cuenta."
                : "Te enviaremos un enlace para verificar este correo."}
            </p>
            <div className="flex flex-wrap gap-3">
              {hasCode ? (
                <form
                  action={confirmAction}
                  onSubmit={() => setFeedbackSource("confirm")}
                >
                  <Button type="submit" disabled={isPending}>
                    {isConfirming ? "Verificando…" : "Confirmar correo"}
                  </Button>
                </form>
              ) : null}
              <form
                action={requestAction}
                onSubmit={() => setFeedbackSource("request")}
              >
                <Button
                  type="submit"
                  variant={hasCode ? "outline" : "default"}
                  disabled={isPending}
                >
                  {isRequesting
                    ? "Solicitando…"
                    : requestState.status === "success" || hasCode
                      ? "Solicitar otro enlace"
                      : "Verificar correo"}
                </Button>
              </form>
            </div>
          </div>
        )}
        {!isPending && feedback.message ? (
          <p
            role={feedback.status === "error" ? "alert" : "status"}
            className={
              feedback.status === "error"
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {feedback.message}
          </p>
        ) : null}
      </div>
    </SettingsOption>
  );
}
