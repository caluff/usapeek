import type { ComponentProps } from "react";
import { MoreHorizontal } from "lucide-react";

import { Button } from "./button";
import { cn } from "./utils";

function Pagination({ className, ...props }: ComponentProps<"nav">) {
  return (
    <nav
      data-slot="pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        className,
      )}
      {...props}
    />
  );
}

function PaginationLink({
  isActive = false,
  className,
  ...props
}: ComponentProps<typeof Button> & { isActive?: boolean }) {
  return (
    <Button
      aria-current={isActive ? "page" : undefined}
      variant={isActive ? "outline" : "ghost"}
      size="sm"
      static
      className={cn("min-w-8 tabular-nums", className)}
      {...props}
    />
  );
}

function PaginationEllipsis() {
  return (
    <span className="flex size-8 items-center justify-center text-muted-foreground">
      <MoreHorizontal className="size-4" aria-hidden="true" />
      <span className="sr-only">Más páginas</span>
    </span>
  );
}

export { Pagination, PaginationLink, PaginationEllipsis };
