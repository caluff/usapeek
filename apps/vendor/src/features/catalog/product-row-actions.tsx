"use client";

import Link from "next/link";
import { useTransition } from "react";
import {
  MoreHorizontal,
  Pencil,
  Package,
  Pause,
  Play,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notifyFeedback } from "@/lib/feedback";
import { saleStatusAction } from "./sale-status-action";

export function ProductRowActions({
  productId,
  title,
  paused,
  configured,
}: {
  productId: string;
  title: string;
  paused?: boolean;
  configured?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  function toggleSale() {
    startTransition(async () => {
      const form = new FormData();
      form.set("product_id", productId);
      form.set("paused", String(!paused));
      notifyFeedback(await saleStatusAction({ status: "idle" }, form));
    });
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          aria-label={`Acciones de ${title}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/seller/catalog/${productId}`}>
            <Pencil aria-hidden="true" />
            Editar producto
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/seller/catalog/${productId}/stock`}>
            <Package aria-hidden="true" />
            Ver y ajustar stock
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/seller/catalog/${productId}?history=1`}>
            <History aria-hidden="true" />
            Ver historial de cambios
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={paused === undefined || !configured}
          onSelect={toggleSale}
        >
          {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          {paused ? "Reactivar venta" : "Pausar venta"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
