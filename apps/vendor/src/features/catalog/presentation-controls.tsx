"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useConfirmDiscardWithin } from "../workspace/unsaved-changes";
import { PresentationEditorProvider } from "./presentation-editor";

export function PresentationControls({
  children,
  hasPending,
}: {
  children: ReactNode;
  hasPending: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const confirmDiscard = useConfirmDiscardWithin();
  const panelId = useId();
  function requestClose() {
    if (!isBusy) confirmDiscard(() => setIsOpen(false), region.current);
  }
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (next) setIsOpen(true);
        else requestClose();
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label="Crear variante"
          title={
            hasPending
              ? "Hay una solicitud pendiente de revisión."
              : "Crear variante"
          }
          disabled={hasPending}
        >
          <Plus aria-hidden="true" />
          Crear
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>Nueva variante</DialogTitle>
        </DialogHeader>
        <PresentationEditorProvider
          value={{
            close: () => setIsOpen(false),
            setBusy,
            open: () => setIsOpen(true),
            canEdit: !hasPending,
            panelId,
          }}
        >
          <div ref={region} id={panelId}>
            {children}
          </div>
        </PresentationEditorProvider>
      </DialogContent>
    </Dialog>
  );
}
