"use client";

import { useActionState, useId } from "react";
import { UsPhoneInput } from "@usapeek/ui/us-phone-input";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { MutationState } from "./presentation";
import { notifyFeedback } from "@/lib/feedback";

export type FormField = {
  name: string;
  label: string;
  value?: string;
  required?: boolean;
  type?: "text" | "email" | "url" | "number" | "textarea" | "tel";
  maxLength?: number;
  min?: number;
  help?: string;
};

export function MutationForm({
  action,
  fields,
  hidden,
  submit,
  disableAfterSuccess = false,
}: {
  action: (previous: MutationState, form: FormData) => Promise<MutationState>;
  fields: FormField[];
  hidden?: Record<string, string>;
  submit: string;
  disableAfterSuccess?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(async (previous: MutationState, form: FormData) => {
    const result = await action(previous, form);
    notifyFeedback(result);
    return result;
  }, {
    status: "idle",
  });
  const prefix = useId();
  return (
    <form action={formAction} className="space-y-5">
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <fieldset disabled={isPending} className="grid gap-5 sm:grid-cols-2">
        {fields.map((field) => (
          <Field
            key={field.name}
            className={field.type === "textarea" ? "sm:col-span-2" : undefined}
          >
            <FieldLabel htmlFor={`${prefix}-${field.name}`}>
              {field.label}
              {field.required ? " *" : ""}
            </FieldLabel>
            {field.type === "textarea" ? (
              <Textarea
                id={`${prefix}-${field.name}`}
                name={field.name}
                defaultValue={field.value ?? ""}
                required={field.required}
                maxLength={field.maxLength ?? 5000}
                rows={5}
                aria-describedby={
                  field.help ? `${prefix}-${field.name}-help` : undefined
                }
              />
            ) : field.type === "tel" ? (
              <UsPhoneInput
                id={`${prefix}-${field.name}`}
                name={field.name}
                defaultValue={field.value ?? ""}
                required={field.required}
                disabled={isPending}
                describedBy={
                  field.help ? `${prefix}-${field.name}-help` : undefined
                }
              />
            ) : (
              <Input
                id={`${prefix}-${field.name}`}
                name={field.name}
                type={field.type ?? "text"}
                defaultValue={field.value ?? ""}
                required={field.required}
                maxLength={field.maxLength ?? 500}
                min={field.min}
                step={field.type === "number" ? 1 : undefined}
                className="h-11"
                aria-describedby={
                  field.help ? `${prefix}-${field.name}-help` : undefined
                }
              />
            )}
            {field.help ? (
              <FieldDescription id={`${prefix}-${field.name}-help`}>
                {field.help}
              </FieldDescription>
            ) : null}
          </Field>
        ))}
      </fieldset>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`rounded-lg border p-3 text-sm leading-6 ${state.status === "error" ? "border-destructive/40 text-destructive" : "border-primary/30 bg-primary/5"}`}
        >
          {state.message}
          {state.href ? (
            <>
              {" "}
              <Link href={state.href} className="font-semibold underline">
                Ver producto
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={
          isPending || (disableAfterSuccess && state.status === "success")
        }
        className="h-11"
      >
        {isPending ? "Guardando…" : submit}
      </Button>
    </form>
  );
}
