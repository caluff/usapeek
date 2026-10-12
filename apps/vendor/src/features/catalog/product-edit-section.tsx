"use client";

import { useRef, useState, type ReactNode } from "react";
import type { ProductDTO } from "@mercurjs/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Ellipsis, Pencil } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProductDetailActions } from "./product-detail-actions";
import { useConfirmDiscardWithin } from "../workspace/unsaved-changes";
import type { MutationState } from "../workspace/presentation";
import { ProductForm, type ProductEditSectionName } from "./product-form";

export function ProductEditSection({
  title,
  product,
  section,
  action,
  children,
  categories,
  organization,
  disabled = false,
  history,
  status,
  historyOpen,
}: {
  title: string;
  product: ProductDTO;
  section: ProductEditSectionName;
  action: (previous: MutationState, form: FormData) => Promise<MutationState>;
  children: ReactNode;
  categories?: ReactNode;
  organization?: ReactNode;
  disabled?: boolean;
  history?: ReactNode;
  status?: ReactNode;
  historyOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirmDiscard = useConfirmDiscardWithin();
  function close() {
    if (!isBusy) confirmDiscard(() => setOpen(false), region.current);
  }
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className={section === "details" ? "text-xl" : undefined}>
          {title}
        </CardTitle>
        <div className="flex shrink-0 items-center gap-2">
          {status}
          {section === "details" ? (
            <ProductDetailActions
              product={product}
              trigger={trigger}
              editDisabled={disabled}
              isEditing={open}
              onEdit={() => setOpen(true)}
              history={history}
              historyOpen={historyOpen}
            />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  ref={trigger}
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Acciones de ${title.toLowerCase()}`}
                >
                  <Ellipsis aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onCloseAutoFocus={(event) => {
                  if (open) event.preventDefault();
                }}
              >
                <DropdownMenuItem
                  disabled={disabled}
                  onSelect={() => setOpen(true)}
                >
                  <Pencil aria-hidden="true" />
                  Editar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (next) setOpen(true);
            else close();
          }}
        >
          <DialogContent
            className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              trigger.current?.focus();
            }}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              close();
            }}
            onInteractOutside={(event) => {
              event.preventDefault();
              close();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                Editar{" "}
                {section === "details"
                  ? "detalles del producto"
                  : title.toLowerCase()}
              </DialogTitle>
            </DialogHeader>
            <div ref={region}>
              <ProductForm
                product={product}
                section={section}
                action={action}
                categories={categories}
                organization={organization}
                onSaved={() => setOpen(false)}
                onBusyChange={setBusy}
                onCancel={close}
              />
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
