import { LogoWordmark } from "@/components/brand/logo"
import Link from "next/link"
import type { ReactNode } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  variant = "split",
}: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  variant?: "split" | "compact"
}) {
  return (
    <main className="relative grid flex-1 bg-background font-sans lg:grid-cols-[minmax(0,0.9fr)_minmax(480px,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-(--auth-sidebar) p-12 text-(--auth-sidebar-foreground) [--auth-sidebar:oklch(0.205_0_0)] [--auth-sidebar-foreground:oklch(0.985_0_0)] lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_20%_20%,color-mix(in_oklab,var(--brand-accent)_28%,transparent),transparent_28rem)]" aria-hidden="true" />
        <Link href="/" aria-label="USAPEEK, inicio" className="relative flex min-h-11 w-fit items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <LogoWordmark width={220} tone="dark" aria-hidden="true" className="h-auto" />
        </Link>
        <div className="relative my-auto max-w-xl">
          <p className="mb-5 text-xs font-bold tracking-[0.2em] uppercase text-(--auth-sidebar-foreground)/75">Tu espacio personal</p>
          <p className="text-5xl leading-[1.08] tracking-tight">Tu selección, guardada con criterio.</p>
          <p className="mt-5 max-w-lg text-base leading-7 text-(--auth-sidebar-foreground)/65">Accede a tu perfil sin interrumpir la exploración del catálogo. Comprar como invitado sigue estando disponible.</p>
        </div>
      </section>
      <section className="flex min-w-0 items-center justify-center px-5 pt-20 pb-10 sm:px-10 lg:py-20">
        {variant === "compact" ? (
          <div className="w-full max-w-sm space-y-8">
            <Link href="/" aria-label="USAPEEK, inicio" className="mx-auto flex min-h-11 w-fit items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden">
              <LogoWordmark width={140} aria-hidden="true" className="h-auto" />
            </Link>
            <div className="space-y-2 text-center">
              <p className="sr-only">{eyebrow}</p>
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              <p className="text-sm text-balance text-muted-foreground">{description}</p>
            </div>
            {children}
          </div>
        ) : (
        <Card className="w-full max-w-md gap-0 rounded-xl border-border/80 shadow-sm">
          <CardHeader className="gap-1.5 pt-5 pb-4">
            <Link href="/" aria-label="USAPEEK, inicio" className="mb-2 flex min-h-11 w-fit items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden">
              <LogoWordmark width={140} aria-hidden="true" className="h-auto" />
            </Link>
            <p className="sr-only">{eyebrow}</p>
            <CardTitle className="pt-2 text-3xl leading-normal font-normal tracking-tight">
              <h1>{title}</h1>
            </CardTitle>
            <CardDescription className="leading-6">{description}</CardDescription>
          </CardHeader>
          <CardContent className="pb-6">{children}</CardContent>
        </Card>
        )}
      </section>
    </main>
  )
}
