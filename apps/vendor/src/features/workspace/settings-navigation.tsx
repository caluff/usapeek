"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Building2, CreditCard, MapPin, Store, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const sections = [
  {
    label: "Perfil público",
    href: "/seller/settings",
    key: "profile",
    icon: Store,
  },
  {
    label: "Dirección comercial",
    href: "/seller/settings?section=address",
    key: "address",
    icon: MapPin,
  },
  {
    label: "Envíos",
    href: "/seller/settings/shipping",
    key: "shipping",
    icon: Truck,
  },
  {
    label: "Cobros y Stripe Connect",
    href: "/seller/settings/payments",
    key: "payments",
    icon: CreditCard,
  },
  {
    label: "Información de la empresa",
    href: "/seller/settings?section=company",
    key: "company",
    icon: Building2,
  },
];

export function SettingsNavigation() {
  const pathname = usePathname();
  const params = useSearchParams();
  const section = params.get("section");
  const active = pathname.endsWith("/shipping")
    ? "shipping"
    : pathname.endsWith("/payments")
      ? "payments"
      : section === "address" || section === "company"
        ? section
        : "profile";
  return (
    <nav
      aria-label="Secciones de ajustes"
      className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
    >
      {sections.map(({ label, href, key, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={active === key ? "page" : undefined}
          className={cn(
            "flex shrink-0 items-center gap-3 rounded-md px-3 py-3 text-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring lg:shrink",
            active === key
              ? "bg-accent text-foreground"
              : "text-muted-foreground",
          )}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap lg:whitespace-normal">
            {label}
          </span>
        </Link>
      ))}
    </nav>
  );
}
