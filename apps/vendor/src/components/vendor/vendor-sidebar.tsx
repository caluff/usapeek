"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  Boxes,
  LayoutDashboard,
  PackageSearch,
  Settings2,
  ShoppingBag,
  Wallet,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { vendorRoutes, type VendorRouteId } from "@/lib/vendor-routes";
import { LogoMark } from "@/components/brand/logo";
import { VendorUserMenu } from "./vendor-user-menu";
import { PendingOrderIndicator } from "@/features/orders/pending-order-indicator";

export type VendorIdentity = {
  sellerId: string;
  memberName: string;
  memberEmail: string;
  sellerName: string;
  roleId: string;
};

const ROLE_LABELS: Record<string, string> = {
  role_seller_administration: "Administración",
  role_seller_inventory_management: "Inventario",
  role_seller_order_management: "Pedidos",
  role_seller_accounting: "Contabilidad",
  role_seller_support: "Soporte",
};

const ROUTE_ICONS = {
  dashboard: LayoutDashboard,
  catalog: PackageSearch,
  orders: ShoppingBag,
  settlements: Wallet,
  inventory: Boxes,
  settings: Settings2,
} satisfies Record<VendorRouteId, typeof LayoutDashboard>;

const NAVIGATION_GROUPS: {
  label?: string;
  routes: VendorRouteId[];
}[] = [
  { routes: ["dashboard"] },
  { label: "Operación", routes: ["catalog", "orders", "inventory"] },
  { label: "Gestión", routes: ["settlements", "settings"] },
];

export function VendorSidebar({
  identity,
  canSwitchSeller,
  storeSetup,
}: {
  identity: VendorIdentity;
  canSwitchSeller: boolean;
  storeSetup: ReactNode;
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon" expandOnHover>
      <SidebarHeader
        className="h-(--app-header-height) justify-center border-b border-sidebar-border py-0"
        data-testid="vendor-sidebar-brand"
      >
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip={identity.sellerName}
              className="h-11"
            >
              <Link href="/seller" onNavigate={() => setOpenMobile(false)}>
                <span className="grid size-8 shrink-0 place-items-center">
                  <LogoMark width={28} tone="dark" aria-hidden="true" />
                </span>
                <span className="min-w-0 group-data-[collapsible=icon]:sr-only">
                  <span className="block truncate font-display text-base font-semibold">
                    {identity.sellerName}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Navegación del vendedor" className="space-y-2 py-2">
          {NAVIGATION_GROUPS.map((group) => (
            <SidebarGroup key={group.label ?? "Inicio"}>
              {group.label ? (
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              ) : null}
              <SidebarGroupContent>
                <SidebarMenu>
                  {vendorRoutes
                    .filter((route) => group.routes.includes(route.id))
                    .map((route) => {
                      const Icon = ROUTE_ICONS[route.id];
                      const children =
                        "children" in route ? route.children : undefined;
                      const isCurrent =
                        pathname === route.href ||
                        (route.href !== "/seller" &&
                          pathname.startsWith(`${route.href}/`));

                      return (
                        <SidebarMenuItem key={route.href}>
                          <SidebarMenuButton
                            asChild
                            isActive={isCurrent && !children}
                            tooltip={route.label}
                            className="relative h-11 md:h-9"
                          >
                            <Link
                              href={route.href}
                              aria-current={
                                isCurrent && !children ? "page" : undefined
                              }
                              onNavigate={() => setOpenMobile(false)}
                            >
                              <Icon aria-hidden="true" />
                              <span>{route.label}</span>
                              {route.id === "orders" ? (
                                <PendingOrderIndicator
                                  key={identity.sellerId}
                                  sellerId={identity.sellerId}
                                />
                              ) : null}
                            </Link>
                          </SidebarMenuButton>
                          {children ? (
                            <SidebarMenuSub>
                              {children.map((child) => {
                                const isChildCurrent = pathname === child.href;

                                return (
                                  <SidebarMenuSubItem key={child.href}>
                                    <SidebarMenuSubButton
                                      asChild
                                      isActive={isChildCurrent}
                                      className="h-11 md:h-9"
                                    >
                                      <Link
                                        href={child.href}
                                        aria-current={
                                          isChildCurrent ? "page" : undefined
                                        }
                                        onNavigate={() => setOpenMobile(false)}
                                      >
                                        {child.label}
                                      </Link>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                );
                              })}
                            </SidebarMenuSub>
                          ) : null}
                        </SidebarMenuItem>
                      );
                    })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
        <div className="mt-auto shrink-0 group-data-[collapsible=icon]:hidden">
          {storeSetup}
        </div>
      </SidebarContent>
      <SidebarFooter className="h-(--app-header-height) shrink-0 justify-center border-t border-sidebar-border py-0">
        <VendorUserMenu
          {...identity}
          roleLabel={ROLE_LABELS[identity.roleId] ?? identity.roleId}
          canSwitchSeller={canSwitchSeller}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
