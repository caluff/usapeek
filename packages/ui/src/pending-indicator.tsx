import type { ComponentProps } from "react";
import { cn } from "./utils";

export function PendingIndicator({
  label,
  className,
  ...props
}: Omit<ComponentProps<"span">, "children"> & { label: string }) {
  return (
    <span
      {...props}
      title={label}
      className={cn(
        "pointer-events-none relative flex size-3 shrink-0 items-center justify-center overflow-visible!",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute size-3 rounded-full bg-destructive/35 motion-safe:animate-[pulse_calc(var(--motion-slow)*8)_var(--ease-in-out)_infinite]"
      />
      <span
        aria-hidden="true"
        className="relative size-2 rounded-full bg-destructive"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
