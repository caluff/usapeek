"use client";

import Link from "next/link";
import { LogoMark, LogoWordmark } from "@/components/brand/logo";

import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";

export function Brand() {
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenuButton size="lg" asChild tooltip="usapeek" className="h-11">
      <Link
        href="/dashboard"
        data-testid="admin-brand-link"
        aria-label="usapeek"
        onNavigate={() => setOpenMobile(false)}
      >
        <span className="hidden size-8 shrink-0 place-items-center group-data-[collapsible=icon]:grid">
          <LogoMark width={28} tone="dark" aria-hidden="true" />
        </span>
        <span className="min-w-0 group-data-[collapsible=icon]:hidden">
          <LogoWordmark width={116} tone="dark" aria-hidden="true" className="h-auto" />
        </span>
      </Link>
    </SidebarMenuButton>
  );
}
