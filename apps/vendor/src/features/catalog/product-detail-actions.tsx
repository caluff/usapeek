"use client";

import { useState, useTransition, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import type { ProductDTO } from "@mercurjs/types";
import type { ProductLifecycleState } from "@usapeek/api/catalog-management-contracts";
import { Archive, Ellipsis, Eye, EyeOff, History, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notifyFeedback } from "@/lib/feedback";
import {
  getProductLifecycleState,
  productLifecycleAction,
} from "./product-lifecycle-action";

export function ProductDetailActions({
  product,
  trigger,
  editDisabled,
  isEditing,
  onEdit,
  history,
  historyOpen = false,
}: {
  product: Pick<ProductDTO, "id" | "title" | "status">;
  trigger: RefObject<HTMLButtonElement | null>;
  editDisabled: boolean;
  isEditing: boolean;
  onEdit: () => void;
  history: ReactNode;
  historyOpen?: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<
    "history" | "archive" | "deactivate" | "activate" | null
  >(historyOpen ? "history" : null);
  const [isPending, startTransition] = useTransition();
  const [lifecycle, setLifecycle] = useState<ProductLifecycleState | null>(
    null,
  );
  const [isChecking, setChecking] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const isPublished = (lifecycle?.status ?? product.status) === "published";
  const canManage =
    !editDisabled && !isChecking && lifecycle?.can_manage === true;
  async function loadLifecycle() {
    if (isChecking) return;
    setChecking(true);
    setLoadError(undefined);
    try {
      const result = await getProductLifecycleState(product.id);
      setLifecycle(result.data ?? null);
      setLoadError(
        result.error
          ? "No se pudieron cargar las acciones. Vuelve a abrir el menú para reintentar."
          : undefined,
      );
    } catch {
      setLifecycle(null);
      setLoadError(
        "No se pudieron cargar las acciones. Vuelve a abrir el menú para reintentar.",
      );
    } finally {
      setChecking(false);
    }
  }
  function mutate() {
    if (!dialog || dialog === "history" || isPending) return;
    const operation = dialog;
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("product_id", product.id);
        form.set("operation", operation);
        const result = await productLifecycleAction({ status: "idle" }, form);
        notifyFeedback(result);
        if (result.status === "success") {
          setDialog(null);
          setLifecycle(null);
          if (operation === "archive" && result.lifecycle?.applied)
            router.replace("/seller/catalog");
          else router.refresh();
        }
      } catch {
        notifyFeedback({
          status: "error",
          message:
            "No se pudo guardar el cambio. Revisa el estado del producto antes de reintentar.",
        });
      }
    });
  }
  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) void loadLifecycle();
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            type="button"
            variant="ghost"
            size="icon"
            disabled={isPending}
            aria-label={`Acciones de ${product.title}`}
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            if (isEditing || dialog) event.preventDefault();
          }}
        >
          <DropdownMenuItem disabled={editDisabled} onSelect={onEdit}>
            <Pencil aria-hidden="true" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("history")}>
            <History aria-hidden="true" />
            Historial de cambios
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!canManage || (!isPublished && !lifecycle?.can_activate)}
            onSelect={() => setDialog(isPublished ? "deactivate" : "activate")}
          >
            {isPublished ? (
              <EyeOff aria-hidden="true" />
            ) : (
              <Eye aria-hidden="true" />
            )}
            {isPublished ? "Quitar de la tienda" : "Publicar en la tienda"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canManage}
            variant="destructive"
            onSelect={() => setDialog("archive")}
          >
            <Archive aria-hidden="true" />
            Archivar
          </DropdownMenuItem>
          {isChecking || loadError || lifecycle?.reason ? (
            <p
              role={loadError ? "alert" : "status"}
              className="max-w-64 px-2 py-2 text-xs text-muted-foreground"
            >
              {isChecking
                ? "Cargando acciones…"
                : loadError || lifecycle?.reason}
            </p>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={dialog === "history"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent
          className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Historial de cambios</DialogTitle>
          </DialogHeader>
          {history}
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={dialog === "archive"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title="Archivar producto"
        description={
          <>
            ¿Quieres archivar «{product.title}»? Se retirará de tu catálogo y de
            la tienda.
            {lifecycle?.requires_review
              ? " La solicitud se aplicará cuando el operador la apruebe."
              : ""}
          </>
        }
        confirmLabel="Archivar"
        pendingLabel="Archivando…"
        variant="destructive"
        isPending={isPending}
        returnFocusRef={trigger}
        onConfirm={mutate}
      />
      <ConfirmationDialog
        open={dialog === "deactivate" || dialog === "activate"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={
          dialog === "deactivate"
            ? "Quitar producto de la tienda"
            : "Publicar producto en la tienda"
        }
        description={
          <>
            {dialog === "deactivate" ? (
              <>
                «{product.title}» dejará de aparecer en la tienda. Conservarás
                sus datos para editarlo y volver a publicarlo.
              </>
            ) : (
              <>¿Quieres volver a publicar «{product.title}» en la tienda?</>
            )}
            {lifecycle?.requires_review
              ? " La solicitud se aplicará cuando el operador la apruebe."
              : ""}
          </>
        }
        confirmLabel={
          dialog === "deactivate" ? "Quitar de la tienda" : "Publicar"
        }
        pendingLabel="Guardando…"
        isPending={isPending}
        returnFocusRef={trigger}
        onConfirm={mutate}
      />
    </>
  );
}
