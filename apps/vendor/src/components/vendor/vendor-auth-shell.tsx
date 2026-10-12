import { Logo } from "@/components/brand/logo";
import Link from "next/link";
import type { ReactNode } from "react";

import { ModeToggle } from "@/components/mode-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function VendorAuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="relative grid min-h-screen bg-background lg:grid-cols-[minmax(0,0.9fr)_minmax(480px,1.1fr)]">
      <ModeToggle className="absolute right-4 top-4 z-10 bg-background" />
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_20%_20%,color-mix(in_oklab,var(--sidebar-primary)_28%,transparent),transparent_28rem)]" aria-hidden="true" />
        <Link href="/seller/login" aria-label="USAPEEK, portal vendedor" className="relative flex min-h-11 w-fit flex-col items-start gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"><Logo width={220} tone="dark" aria-hidden="true" className="h-auto" /><span className="block text-xs font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55">Portal vendedor</span></Link>
        <div className="relative max-w-xl"><p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-sidebar-primary-text">Operación segura</p><p className="font-display text-5xl leading-[1.08] tracking-tight">Menos ruido. Más claridad para operar tu tienda.</p><p className="mt-5 max-w-lg text-base leading-7 text-sidebar-foreground/65">Acceso para vendedores aprobados y miembros invitados a sus tiendas.</p></div>
        <p className="relative text-xs text-sidebar-muted">Autenticación y permisos administrados por Mercur</p>
      </section>
      <section className="flex items-center justify-center px-5 py-10 sm:px-10"><div className="w-full max-w-md"><Card><CardHeader className="pb-4"><Link href="/seller/login" aria-label="USAPEEK, portal vendedor" className="mb-2 w-fit rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"><Logo width={160} aria-hidden="true" className="h-auto" /></Link><CardTitle asChild className="pt-2 font-display text-3xl font-normal"><h1>{title}</h1></CardTitle><CardDescription className="leading-6">{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card></div></section>
    </main>
  );
}
