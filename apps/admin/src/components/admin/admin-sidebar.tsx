import type { HttpTypes } from "@medusajs/types";

import { Brand } from "@/components/admin/brand";
import { NavigationContent } from "@/components/admin/navigation";
import { AdminUserMenu } from "@/components/admin/admin-user-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function AdminSidebar({ user }: { user: HttpTypes.AdminUser }) {
  return (
    <Sidebar collapsible="icon" expandOnHover>
      <SidebarHeader className="h-(--app-header-height) justify-center border-b border-sidebar-border py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <Brand />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavigationContent />
      </SidebarContent>
      <SidebarFooter className="h-(--app-header-height) shrink-0 justify-center border-t border-sidebar-border py-0">
        <AdminUserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
