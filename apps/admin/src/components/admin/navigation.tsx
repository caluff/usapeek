"use client";

import type { LucideIcon } from "lucide-react";
import {
  CreditCard,
  ClipboardCheck,
  FolderTree,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { PendingApplicationsIndicator } from "@/features/vendor-applications/components/pending-applications-provider";

type NavigationItem = {
  label: string;
  icon: LucideIcon;
  href: string;
  current?: boolean;
};

const navigationGroups: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<NavigationItem>;
}> = [
  {
    label: "Resumen",
    items: [
      {
        label: "Resumen",
        icon: LayoutDashboard,
        href: "/dashboard",
      },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { label: "Catálogo", icon: Package, href: "/dashboard/product-review" },
      { label: "Categorías", icon: FolderTree, href: "/dashboard/categories" },
    ],
  },
  {
    label: "Ventas",
    items: [
      { label: "Pedidos", icon: ShoppingCart, href: "/dashboard/orders" },
      { label: "Clientes", icon: Users, href: "/dashboard/customers" },
      {
        label: "Pagos",
        icon: CreditCard,
        href: "/dashboard/commissions",
      },
    ],
  },
  {
    label: "Tiendas",
    items: [
      {
        label: "Solicitudes",
        icon: ClipboardCheck,
        href: "/dashboard/vendor-applications",
      },
      { label: "Tiendas", icon: Store, href: "/dashboard/stores" },
    ],
  },
];

function NavigationLink({ item }: { item: NavigationItem }) {
  const { setOpenMobile } = useSidebar();
  const Icon = item.icon;

  return (
    <SidebarMenuButton
      asChild
      isActive={item.current}
      tooltip={item.label}
      className="h-11 text-sidebar-muted data-[active=true]:text-sidebar-accent-foreground md:h-9"
    >
      <Link
        href={item.href}
        aria-current={item.current ? "page" : undefined}
        data-testid={`admin-nav-${item.label.toLowerCase()}`}
        onNavigate={() => setOpenMobile(false)}
      >
        <Icon
          className={cn(item.current && "text-sidebar-primary-text")}
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <span className="group-data-[collapsible=icon]:sr-only">
          {item.label}
        </span>
        {item.href === "/dashboard/vendor-applications" ||
        item.href === "/dashboard/product-review" ? (
          <span className="ml-auto group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:top-1">
            <PendingApplicationsIndicator
              topic={
                item.href === "/dashboard/vendor-applications"
                  ? "applications"
                  : "catalog"
              }
            />
          </span>
        ) : null}
      </Link>
    </SidebarMenuButton>
  );
}

export function NavigationContent() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegación principal" className="flex-1">
      {navigationGroups.map((group) => (
        <SidebarGroup key={group.label}>
          {group.label !== "Resumen" ? (
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted">
              {group.label}
            </SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <NavigationLink
                    item={{
                      ...item,
                      current:
                        item.href === "/dashboard"
                          ? pathname === "/dashboard"
                          : Boolean(
                              item.href &&
                              !item.href.includes("#") &&
                              (pathname === item.href ||
                                pathname.startsWith(`${item.href}/`)),
                            ),
                    }}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  );
}
