"use client";

import type { SetupCheck } from "@usapeek/vendor-onboarding-contracts";
import { AlertCircle, Check } from "lucide-react";
import Link from "next/link";

import { useSidebar } from "@/components/ui/sidebar";

const SETUP_STEPS = {
  profile: { label: "Perfil de la tienda", href: "/seller/settings" },
  location: {
    label: "Ubicación de inventario",
    href: "/seller/inventory/locations",
  },
  first_product: { label: "Primer producto", href: "/seller/catalog" },
  inventory: { label: "Inventario configurado", href: "/seller/inventory" },
} satisfies Record<SetupCheck["key"], { label: string; href: string }>;

export function StoreSetupTimeline({ checks }: { checks: SetupCheck[] }) {
  const { setOpenMobile } = useSidebar();
  const completedCount = checks.filter(
    (check) => check.status === "complete",
  ).length;

  if (checks.length === 0 || completedCount === checks.length) return null;

  return (
    <nav
      aria-label="Preparación de la tienda"
      className="border-t border-sidebar-border px-2 py-4"
    >
      <div className="flex items-start justify-between gap-2 px-2">
        <h2 className="text-xs font-semibold leading-5">
          Preparación de la tienda
        </h2>
        <span className="shrink-0 text-xs leading-5 tabular-nums text-sidebar-muted">
          {completedCount} de {checks.length}
        </span>
      </div>
      <ol className="mt-3">
        {checks.map((check, index) => {
          const step = SETUP_STEPS[check.key];
          const isComplete = check.status === "complete";
          const isBlocked = check.status === "blocked";

          return (
            <li key={check.key} className="relative">
              {index < checks.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute -bottom-2.5 left-[18px] top-7 w-px bg-sidebar-border"
                />
              ) : null}
              <Link
                href={step.href}
                onNavigate={() => setOpenMobile(false)}
                className="relative flex min-h-14 items-start gap-3 rounded-md px-2 py-2 text-sidebar-foreground outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring active:bg-sidebar-accent"
              >
                <span
                  aria-hidden="true"
                  className={`relative z-10 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold ${
                    isComplete
                      ? "border-sidebar-primary bg-sidebar-primary text-sidebar-primary-foreground"
                      : isBlocked
                        ? "border-warning bg-sidebar text-warning"
                        : "border-sidebar-border bg-sidebar text-sidebar-muted"
                  }`}
                >
                  {isComplete ? (
                    <Check className="size-3" />
                  ) : isBlocked ? (
                    <AlertCircle className="size-3" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium leading-5">
                    {step.label}
                  </span>
                  <span className="block text-xs leading-4 text-sidebar-muted">
                    {isBlocked
                      ? "Requiere configuración del operador"
                      : isComplete
                        ? "Completo"
                        : "Pendiente"}
                  </span>
                  {check.reason ? (
                    <span className="mt-1 block text-xs leading-4 text-sidebar-muted">
                      {check.reason === "inventory_not_configured"
                        ? "Vincula artículos y existencias a una ubicación de tu tienda."
                        : check.reason}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
