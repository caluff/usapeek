"use client"

import React from "react"
import { Label as LabelPrimitive } from "radix-ui"
import type { ComponentProps } from "react"

import { cn } from "./utils";

function FieldSet({ className, ...props }: ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn("flex min-w-0 flex-col gap-6", className)}
      {...props}
    />
  )
}

function FieldLegend({ className, ...props }: ComponentProps<"legend">) {
  return (
    <legend
      data-slot="field-legend"
      className={cn("mb-4 text-base font-semibold", className)}
      {...props}
    />
  )
}

function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "@container/field-group flex w-full flex-col gap-6",
        className,
      )}
      {...props}
    />
  )
}

function Field({
  className,
  orientation = "vertical",
  ...props
}: ComponentProps<"div"> & { orientation?: "vertical" | "horizontal" }) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(
        "group/field flex w-full gap-2 data-[invalid=true]:text-destructive",
        orientation === "horizontal"
          ? "flex-row items-start gap-3"
          : "flex-col",
        className,
      )}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn("flex flex-1 flex-col gap-1.5", className)}
      {...props}
    />
  )
}

function FieldLabel({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="field-label"
      className={cn(
        "flex w-fit items-center gap-2 text-sm font-semibold leading-5 group-data-[disabled=true]/field:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-sm leading-6 text-muted-foreground", className)}
      {...props}
    />
  )
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>
}) {
  const messages = [
    ...new Set(errors?.map((error) => error?.message).filter(Boolean)),
  ]
  const content =
    children ||
    (messages.length === 1 ? (
      messages[0]
    ) : messages.length ? (
      <ul className="ml-4 list-disc space-y-1">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    ) : null)

  if (!content) return null

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-sm leading-5 text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  )
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
}
