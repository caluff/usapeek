import type { ComponentProps } from "react";
import {
  Archive,
  CircleCheck,
  CircleHelp,
  CirclePause,
  Clock3,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { storeStatusLabel } from "./helpers";

const PRESENTATIONS: Record<
  string,
  {
    variant: ComponentProps<typeof Badge>["variant"];
    icon: LucideIcon;
    description: string;
  }
> = {
  open: {
    variant: "success",
    icon: CircleCheck,
    description: "La tienda está activa para operar en el marketplace.",
  },
  pending_approval: {
    variant: "warning",
    icon: Clock3,
    description: "La tienda está pendiente de aprobación del administrador.",
  },
  suspended: {
    variant: "destructive",
    icon: CirclePause,
    description: "La actividad de la tienda está suspendida.",
  },
  terminated: {
    variant: "neutral",
    icon: Archive,
    description:
      "La tienda está cerrada y sus datos se conservan para consulta.",
  },
};

export function storeStatusTabClassName(status: string) {
  const variant = Object.hasOwn(PRESENTATIONS, status)
    ? PRESENTATIONS[status]?.variant
    : undefined;
  switch (variant) {
    case "success":
      return "border-success-foreground text-success-foreground";
    case "warning":
      return "border-warning-foreground text-warning-foreground";
    case "destructive":
      return "border-destructive text-destructive";
    case "neutral":
      return "border-muted-foreground text-muted-foreground";
    default:
      return "border-primary text-foreground";
  }
}

export function StoreStatusBadge({ status }: { status: string }) {
  const presentation = Object.hasOwn(PRESENTATIONS, status)
    ? PRESENTATIONS[status]
    : undefined;
  const Icon = presentation?.icon ?? CircleHelp;
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <Badge
          variant={presentation?.variant ?? "neutral"}
          tabIndex={0}
          className="relative z-10 cursor-help whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Icon aria-hidden="true" strokeWidth={2} />
          {storeStatusLabel(status)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-[min(20rem,calc(100vw-2rem))]">
        {presentation?.description ??
          "No hay suficiente información para identificar este estado."}
      </TooltipContent>
    </Tooltip>
  );
}
