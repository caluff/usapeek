"use client";

import type { HttpTypes } from "@medusajs/types";
import { ChevronsUpDown, LogOut, Moon, Settings2 } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useRef } from "react";
import { logoutAdminAction } from "@/app/auth-actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function AdminUserMenu({ user }: { user: HttpTypes.AdminUser }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { isMobile, setOpenMobile } = useSidebar();
  const formRef = useRef<HTMLFormElement>(null);
  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || "Operador";
  const initials =
    `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}` ||
    user.email[0]?.toUpperCase() ||
    "OP";
  return (
    <>
      <form ref={formRef} action={logoutAdminAction} />
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                tooltip={name}
                className="h-11 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                aria-label={`Menú del usuario: ${name}`}
              >
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="bg-sidebar-accent text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:sr-only">
                  <span className="block truncate text-xs font-semibold">
                    {name}
                  </span>
                  <span className="block truncate text-[11px] font-normal text-sidebar-muted">
                    {user.email}
                  </span>
                </span>
                <ChevronsUpDown
                  className="size-4 shrink-0 text-sidebar-muted group-data-[collapsible=icon]:hidden"
                  aria-hidden="true"
                />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={isMobile ? "top" : "right"}
              align="end"
              sideOffset={8}
              className="w-60 max-w-[calc(100vw-2rem)]"
            >
              <DropdownMenuLabel className="truncate">
                {name}
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {user.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings" onNavigate={() => setOpenMobile(false)}>
                  <Settings2 aria-hidden="true" />
                  Configuración
                </Link>
              </DropdownMenuItem>
              <DropdownMenuCheckboxItem
                checked={resolvedTheme === "dark"}
                onCheckedChange={(isDark) =>
                  setTheme(isDark ? "dark" : "light")
                }
                onSelect={(event) => event.preventDefault()}
                className="min-h-11 gap-2 pl-2 [&>span:first-child]:hidden"
              >
                <Moon aria-hidden="true" />
                <span>Theme</span>
                <span
                  aria-hidden="true"
                  className="ml-auto inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-input p-0.5 ring-1 ring-inset ring-input transition-colors [[data-state=checked]_&]:ring-primary [[data-state=checked]_&]:bg-primary"
                >
                  <span className="size-4 rounded-full bg-background shadow-sm transition-transform [[data-state=checked]_&]:translate-x-4 motion-reduce:transition-none" />
                </span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => formRef.current?.requestSubmit()}
              >
                <LogOut aria-hidden="true" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
}
