"use client";

import { usePathname } from "next/navigation";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { vendorRoutes } from "@/lib/vendor-routes";

export function VendorHeader({ sellerName }: { sellerName: string }) {
  const pathname = usePathname();
  const currentRoute = vendorRoutes.find(
    (route) =>
      pathname === route.href ||
      (route.href !== "/seller" && pathname.startsWith(`${route.href}/`)),
  );

  return (
    <header className="sticky top-0 z-30 flex h-(--app-header-height) shrink-0 items-center gap-2 border-b border-border/75 bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <SidebarTrigger className="size-11 md:size-8" />
      <nav
        aria-label="Ubicación actual"
        className="flex min-w-0 flex-1 items-center gap-2 text-xs"
      >
        <span className="truncate text-muted-foreground">{sellerName}</span>
        <span aria-hidden="true" className="shrink-0 text-border">
          /
        </span>
        <span
          aria-current="page"
          className="shrink-0 font-semibold text-foreground"
        >
          {pathname === "/seller/account"
            ? "Configuración"
            : currentRoute?.label ?? "Portal vendedor"}
        </span>
      </nav>
    </header>
  );
}
