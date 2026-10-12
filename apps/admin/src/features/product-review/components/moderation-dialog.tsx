"use client";

import { useRef, useState, type RefObject } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAdminRefreshBlocker } from "@/features/realtime/auto-refresh";
import { ProductModerationForm } from "./review-form";

export function ProductModerationDialog({
  productId,
  updatedAt,
  changeId,
  canReview,
  returnFocusRef,
}: {
  productId: string;
  updatedAt: string;
  changeId?: string;
  canReview: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const pendingRef = useRef(false);
  const hasSavedRef = useRef(false);
  useAdminRefreshBlocker(isOpen || isPending);
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!pendingRef.current) {
          if (open) hasSavedRef.current = false;
          setIsOpen(open);
        }
      }}
    >
      {canReview && (
        <DialogTrigger asChild>
          <Button>
            <ClipboardCheck aria-hidden="true" />
            {changeId ? "Resolver cambios" : "Revisar publicación"}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        onEscapeKeyDown={(event) => {
          if (pendingRef.current) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (pendingRef.current) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (hasSavedRef.current) {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {changeId ? "Resolver cambios pendientes" : "Revisar publicación"}
          </DialogTitle>
          <DialogDescription>
            {changeId
              ? "Comprueba las operaciones propuestas antes de aplicarlas o descartarlas."
              : "Comprueba el contenido y las categorías antes de publicar."}
          </DialogDescription>
        </DialogHeader>
        {isOpen && (
          <ProductModerationForm
            productId={productId}
            updatedAt={updatedAt}
            changeId={changeId}
            onPendingChange={(pending) => {
              pendingRef.current = pending;
              setIsPending(pending);
            }}
            onSuccess={() => {
              hasSavedRef.current = true;
              setIsOpen(false);
            }}
            onCancel={() => setIsOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
