"use client";

import { useRef, useState, useTransition, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, MoreHorizontal, Pencil, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminRefreshBlocker } from "@/features/realtime/auto-refresh";
import { notifyFeedback } from "@/lib/feedback";
import { changeProductVisibilityAction } from "../management-actions";
import type { ProductVisibilityAction } from "../management";

export function ProductActionsMenu({
  productId,
  title,
  status,
  updatedAt,
  hasPendingChange,
  triggerRef: externalTriggerRef,
  showDetailLink = true,
}: {
  productId: string;
  title: string;
  status: string;
  updatedAt: string;
  hasPendingChange: boolean;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  showDetailLink?: boolean;
}) {
  const router = useRouter();
  const localTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerRef = externalTriggerRef ?? localTriggerRef;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [requested, setRequested] = useState<ProductVisibilityAction | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  useAdminRefreshBlocker(isMenuOpen || requested !== null || isPending);
  const detailHref = `/dashboard/product-review/${encodeURIComponent(productId)}`;
  const isWithdrawing = requested === "withdraw";

  return (
    <>
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            static
            className="size-10"
            aria-label={`Acciones de ${title}`}
            disabled={isPending}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-60 max-w-[calc(100vw-2rem)]"
        >
          {showDetailLink && (
            <DropdownMenuItem asChild className="min-h-10">
              <Link href={detailHref}>
                <Eye aria-hidden="true" />
                {hasPendingChange || status === "proposed"
                  ? "Revisar producto"
                  : "Ver detalle"}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            asChild
            disabled={hasPendingChange}
            className="min-h-10"
          >
            <Link href={`${detailHref}/edit`}>
              <Pencil aria-hidden="true" />
              Editar producto
            </Link>
          </DropdownMenuItem>
          {status === "published" || status === "draft" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={hasPendingChange || !updatedAt}
                className="min-h-10"
                onSelect={() =>
                  setRequested(status === "published" ? "withdraw" : "publish")
                }
              >
                {status === "published" ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Store aria-hidden="true" />
                )}
                {status === "published"
                  ? "Retirar de la tienda"
                  : "Publicar en la tienda"}
              </DropdownMenuItem>
            </>
          ) : null}
          {hasPendingChange ? (
            <DropdownMenuLabel className="max-w-56 text-xs font-normal text-muted-foreground">
              Resuelve primero los cambios pendientes.
            </DropdownMenuLabel>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmationDialog
        open={requested !== null}
        onOpenChange={(open) => {
          if (!open) setRequested(null);
        }}
        title={
          isWithdrawing
            ? "¿Retirar este producto de la tienda?"
            : "¿Publicar este producto en la tienda?"
        }
        description={
          isWithdrawing
            ? `«${title}» dejará de aparecer al cliente en todas las tiendas que lo ofrecen. Quedará como borrador y podrás volver a publicarlo.`
            : `«${title}» aparecerá en el catálogo. Para comprarlo seguirá necesitando una oferta, existencias y envíos disponibles.`
        }
        confirmLabel={isWithdrawing ? "Retirar producto" : "Publicar producto"}
        pendingLabel={isWithdrawing ? "Retirando…" : "Publicando…"}
        isPending={isPending}
        returnFocusRef={triggerRef}
        onConfirm={() => {
          if (!requested || isPending) return;
          const action = requested;
          startTransition(async () => {
            try {
              const result = await changeProductVisibilityAction(
                productId,
                updatedAt,
                action,
              );
              notifyFeedback(result);
            } catch {
              notifyFeedback({
                status: "error",
                message:
                  "No se pudo confirmar el cambio. Actualiza el catálogo antes de reintentar.",
              });
            } finally {
              setRequested(null);
              router.refresh();
            }
          });
        }}
      />
    </>
  );
}
