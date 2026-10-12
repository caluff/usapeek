import { SidebarTrigger } from "@/components/ui/sidebar";

export function AdminHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-(--app-header-height) items-center border-b border-border/80 bg-background/92 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger
          className="size-11"
          data-testid="mobile-navigation-open"
          aria-label="Alternar navegación"
        />
        <div className="hidden min-w-0 items-center gap-2 text-xs sm:flex">
          <span className="text-muted-foreground">usapeek</span>
          <span className="text-border">/</span>
          <span className="truncate font-semibold text-foreground">
            Administración
          </span>
        </div>
      </div>
    </header>
  );
}
