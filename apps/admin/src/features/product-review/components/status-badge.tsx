import type { ComponentProps } from "react";
import {
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleX,
  Clock3,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PRODUCT_STATUS_LABELS } from "../helpers";

const PRESENTATIONS: Record<
  string,
  {
    variant: ComponentProps<typeof Badge>["variant"];
    icon: LucideIcon;
    description: string;
  }
> = {
  proposed: {
    variant: "warning",
    icon: Clock3,
    description: "El producto está pendiente de revisión antes de publicarse.",
  },
  draft: {
    variant: "neutral",
    icon: CircleDashed,
    description:
      "El producto está guardado como borrador y no aparece en la tienda.",
  },
  published: {
    variant: "success",
    icon: CircleCheck,
    description:
      "El producto está publicado. Para comprarlo necesita una oferta, existencias y envíos disponibles.",
  },
  rejected: {
    variant: "destructive",
    icon: CircleX,
    description: "La publicación del producto fue rechazada en la revisión.",
  },
};

export function productStatusTabClassName(status: string) {
  const presentation = Object.hasOwn(PRESENTATIONS, status)
    ? PRESENTATIONS[status]
    : undefined;
  switch (presentation?.variant) {
    case "warning":
      return "border-warning-foreground text-warning-foreground";
    case "success":
      return "border-success-foreground text-success-foreground";
    case "destructive":
      return "border-destructive text-destructive";
    case "neutral":
      return "border-muted-foreground text-muted-foreground";
    default:
      return "border-primary text-foreground";
  }
}

export function ProductStatusBadge({ status }: { status: string }) {
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
          {Object.hasOwn(PRODUCT_STATUS_LABELS, status)
            ? PRODUCT_STATUS_LABELS[
                status as keyof typeof PRODUCT_STATUS_LABELS
              ]
            : status}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-[min(20rem,calc(100vw-2rem))]">
        {presentation?.description ??
          "No hay suficiente información para identificar este estado."}
      </TooltipContent>
    </Tooltip>
  );
}
