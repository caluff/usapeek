import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Adapted from shadcn/ui Attachment to the existing dashboard tokens.
export function Attachment({
  className,
  state = "done",
  ...props
}: ComponentProps<"div"> & { state?: "idle" | "uploading" | "done" }) {
  return (
    <div
      data-slot="attachment"
      data-state={state}
      className={cn(
        "relative flex w-36 shrink-0 flex-col gap-2 rounded-lg border bg-card p-2 focus-within:ring-2 focus-within:ring-ring data-[state=idle]:border-dashed",
        className,
      )}
      {...props}
    />
  );
}
export function AttachmentMedia({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="attachment-media"
      className={cn(
        "relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted",
        className,
      )}
      {...props}
    />
  );
}
export function AttachmentContent(props: ComponentProps<"div">) {
  return (
    <div data-slot="attachment-content" className="min-w-0 px-1" {...props} />
  );
}
export function AttachmentTitle(props: ComponentProps<"span">) {
  return (
    <span
      data-slot="attachment-title"
      className="block truncate text-sm font-medium"
      {...props}
    />
  );
}
export function AttachmentDescription(props: ComponentProps<"span">) {
  return (
    <span
      data-slot="attachment-description"
      className="mt-0.5 block truncate text-xs text-muted-foreground"
      {...props}
    />
  );
}
export function AttachmentActions(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="attachment-actions"
      className="absolute right-3 top-3 z-20"
      {...props}
    />
  );
}
export function AttachmentAction(props: ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="attachment-action"
      type="button"
      variant="secondary"
      size="icon"
      className="size-7"
      {...props}
    />
  );
}
export function AttachmentTrigger(props: ComponentProps<"button">) {
  return (
    <button
      data-slot="attachment-trigger"
      type="button"
      className="absolute inset-0 z-10 outline-none disabled:cursor-not-allowed"
      {...props}
    />
  );
}
export function AttachmentGroup(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="attachment-group"
      className="flex flex-wrap gap-3"
      {...props}
    />
  );
}
