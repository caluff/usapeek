import { CircleCheck, PackageCheck, Truck, CircleX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PRESENTATIONS = {
  prepared: {
    label: "Preparada",
    icon: PackageCheck,
    className: "border-info/25 bg-info/10 text-info",
    description:
      "Los artículos están preparados; todavía no se registró un envío.",
  },
  shipped: {
    label: "Enviada",
    icon: Truck,
    className: "border-brand-accent/25 bg-brand-accent/10 text-brand-accent-text",
    description: "El envío se registró; la entrega aún no está confirmada.",
  },
  delivered: {
    label: "Entregada",
    icon: CircleCheck,
    className: "border-success/20 bg-success/10 text-success-foreground",
    description: "Se confirmó que el cliente recibió estos artículos.",
  },
  canceled: {
    label: "Cancelada",
    icon: CircleX,
    className: "border-destructive/25 bg-destructive/10 text-destructive",
    description:
      "La preparación se canceló y sus artículos no se enviarán desde ella.",
  },
} as const;

export function FulfillmentStatusBadge({
  status,
}: {
  status: keyof typeof PRESENTATIONS;
}) {
  const presentation = PRESENTATIONS[status];
  const Icon = presentation.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={`${presentation.className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          tabIndex={0}
        >
          <Icon aria-hidden="true" />
          {presentation.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{presentation.description}</TooltipContent>
    </Tooltip>
  );
}
