"use client";

import { useId, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

export type SettingsOptionProps = {
  label: string;
  labelContent?: ReactNode;
  value?: ReactNode;
  children: ReactNode;
  description?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
};

export function SettingsOption({
  label,
  labelContent,
  value,
  children,
  description,
  open,
  onOpenChange,
  defaultOpen,
}: SettingsOptionProps) {
  const valueId = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
      <div className="flex min-h-16 w-full items-center justify-between gap-4 py-2">
        <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
          {labelContent ?? label}
        </span>
        <div
          data-slot="settings-option-control"
          className="flex min-w-0 max-w-[70%] items-center gap-3"
        >
          {value != null ? (
            <span
              id={valueId}
              data-slot="settings-option-value"
              className="min-w-0 text-right text-sm font-normal text-muted-foreground [overflow-wrap:anywhere]"
            >
              {value}
            </span>
          ) : null}
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              static
              className="size-11"
              data-settings-option-trigger=""
              aria-label={`Abrir ${label.toLowerCase()}`}
              aria-describedby={value != null ? valueId : undefined}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </DialogTrigger>
        </div>
      </div>
      <DialogContent
        {...(!description ? { "aria-describedby": undefined } : {})}
      >
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
