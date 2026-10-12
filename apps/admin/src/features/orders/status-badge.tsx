import type { ComponentProps } from "react";
import type { HttpTypes } from "@medusajs/types";
import {
  Archive,
  BadgeCheck,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleX,
  Clock3,
  CreditCard,
  PackageCheck,
  PackageOpen,
  ShieldCheck,
  TriangleAlert,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { statusLabel } from "./helpers";
import { logisticsStatus } from "./logistics-status";

type StatusPresentation = {
  variant: ComponentProps<typeof Badge>["variant"];
  icon: LucideIcon;
  className?: string;
  description: string;
};

const INFO_COLOR = "border-info/25 bg-info/10 text-info";
const SHIPPING_COLOR =
  "border-brand-accent/25 bg-brand-accent/10 text-[color-mix(in_oklch,var(--brand-accent)_70%,var(--foreground))]";

const STATUS_PRESENTATIONS: Record<string, StatusPresentation> = {
  pending: {
    variant: "warning",
    icon: Clock3,
    description:
      "El pedido sigue abierto para gestionar su preparación y entrega.",
  },
  completed: {
    variant: "success",
    icon: CircleCheck,
    description:
      "La gestión del pedido ha finalizado y se cerró como completado.",
  },
  canceled: {
    variant: "destructive",
    icon: CircleX,
    description:
      "El pedido, pago o envío correspondiente fue cancelado.",
  },
  archived: {
    variant: "neutral",
    icon: Archive,
    description: "El pedido fue archivado y se conserva para consulta.",
  },
  requires_action: {
    variant: "warning",
    icon: TriangleAlert,
    description:
      "Hace falta revisar o completar una acción para continuar con el pedido o el pago.",
  },
  not_paid: {
    variant: "warning",
    icon: CreditCard,
    description: "No se registra un cobro de la compra.",
  },
  awaiting: {
    variant: "warning",
    icon: Clock3,
    description: "El pago está en espera de confirmación.",
  },
  authorized: {
    variant: "outline",
    className: INFO_COLOR,
    icon: ShieldCheck,
    description:
      "El pago está autorizado, pero el importe aún no se ha cobrado.",
  },
  partially_authorized: {
    variant: "outline",
    className: INFO_COLOR,
    icon: CircleDashed,
    description:
      "Solo parte del importe está autorizada; falta completar la autorización.",
  },
  captured: {
    variant: "success",
    icon: BadgeCheck,
    description: "El importe de la compra se cobró.",
  },
  partially_captured: {
    variant: "warning",
    icon: CircleDashed,
    description: "Solo se ha cobrado una parte del importe de la compra.",
  },
  refunded: {
    variant: "outline",
    className: INFO_COLOR,
    icon: Undo2,
    description: "El importe cobrado fue reembolsado.",
  },
  partially_refunded: {
    variant: "warning",
    icon: Undo2,
    description:
      "Se devolvió parte del importe cobrado; el reembolso no es total.",
  },
  not_fulfilled: {
    variant: "warning",
    icon: Clock3,
    description:
      "Aún no se ha registrado la preparación completa de todos los artículos.",
  },
  partially_fulfilled: {
    variant: "outline",
    className: INFO_COLOR,
    icon: PackageOpen,
    description: "Solo parte de los artículos se ha preparado.",
  },
  fulfilled: {
    variant: "outline",
    className: INFO_COLOR,
    icon: PackageCheck,
    description:
      "La preparación está completa; todavía no se ha registrado el envío completo.",
  },
  partially_shipped: {
    variant: "outline",
    className: SHIPPING_COLOR,
    icon: Truck,
    description: "Solo parte de los artículos se ha enviado.",
  },
  shipped: {
    variant: "outline",
    className: SHIPPING_COLOR,
    icon: Truck,
    description:
      "Se registró el envío; la entrega completa aún no está confirmada.",
  },
  partially_delivered: {
    variant: "success",
    icon: CircleDashed,
    description:
      "Se confirmó la entrega de parte de los artículos; quedan artículos por entregar.",
  },
  delivered: {
    variant: "success",
    icon: CircleCheck,
    description: "La entrega se registró como completa.",
  },
};

export function orderStatusTabClassName(status: string) {
  const variant = Object.hasOwn(STATUS_PRESENTATIONS, status)
    ? STATUS_PRESENTATIONS[status]?.variant
    : undefined;
  switch (variant) {
    case "warning":
      return "border-warning-foreground text-warning-foreground";
    case "success":
      return "border-success-foreground text-success-foreground";
    case "destructive":
      return "border-destructive text-destructive";
    default:
      return "border-primary text-foreground";
  }
}

export function OrderStatusBadge({
  status,
  label,
}: {
  status: string | null | undefined;
  label?: string;
}) {
  const presentation =
    status && Object.hasOwn(STATUS_PRESENTATIONS, status)
      ? STATUS_PRESENTATIONS[status]
      : undefined;
  const Icon = presentation?.icon ?? CircleHelp;
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <Badge
          variant={presentation?.variant ?? "neutral"}
          tabIndex={0}
          className={`relative z-10 cursor-help whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${presentation?.className ?? ""}`}
        >
          <Icon aria-hidden="true" strokeWidth={2} />
          {label ?? statusLabel(status ?? undefined)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-[min(20rem,calc(100vw-2rem))]">
        {presentation?.description ??
          "No hay suficiente información para identificar este estado."}
      </TooltipContent>
    </Tooltip>
  );
}

export function OrderLogisticsBadge({
  order,
}: {
  order: HttpTypes.AdminOrder;
}) {
  const status = logisticsStatus(order);
  return (
    <OrderStatusBadge
      status={status}
      label={
        status === "not_fulfilled" ? "Pendiente de preparación" : undefined
      }
    />
  );
}
