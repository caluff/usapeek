"use client";

import { useRef } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ChevronsUpDown, LogOut, Moon, Repeat2, Settings2 } from "lucide-react";
import { logoutVendorAction } from "@/app/seller/auth-actions";
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

export function VendorUserMenu({
  memberName,
  memberEmail,
  sellerName,
  roleLabel,
  canSwitchSeller,
}: {
  memberName: string;
  memberEmail: string;
  sellerName: string;
  roleLabel: string;
  canSwitchSeller: boolean;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const { isMobile, setOpenMobile } = useSidebar();
  const formRef = useRef<HTMLFormElement>(null);
  const initials =
    memberName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "MV";
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <form ref={formRef} action={logoutVendorAction} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={memberName}
              className="h-11 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              aria-label={`Menú del usuario: ${memberName}`}
            >
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:sr-only">
                <span className="block truncate text-sm font-semibold">
                  {sellerName}
                </span>
                <span className="block truncate text-xs font-normal text-sidebar-foreground/55">
                  {memberName}
                </span>
              </span>
              <ChevronsUpDown
                className="ml-auto size-4 shrink-0 group-data-[collapsible=icon]:hidden"
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
            <DropdownMenuLabel>
              <span className="block truncate">{memberName}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {memberEmail}
              </span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                {roleLabel}
              </span>
            </DropdownMenuLabel>
            {canSwitchSeller ? (
              <DropdownMenuItem asChild>
                <Link
                  href="/seller/select-seller"
                  onNavigate={() => setOpenMobile(false)}
                >
                  <Repeat2 aria-hidden="true" />
                  Cambiar tienda
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/seller/account" onNavigate={() => setOpenMobile(false)}>
                <Settings2 aria-hidden="true" />
                Configuración
              </Link>
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem
              checked={resolvedTheme === "dark"}
              onCheckedChange={(isDark) => setTheme(isDark ? "dark" : "light")}
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
  );
}
