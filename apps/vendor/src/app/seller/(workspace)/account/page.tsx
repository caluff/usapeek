import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmailVerification } from "@/features/account/email-verification";
import { AccountProfile } from "@/features/account/profile";
import { AccountAppearance } from "@/features/account/appearance";
import type { ProfileSearchParams } from "@/features/account/profile-completion";

export const metadata: Metadata = {
  title: "Configuración de cuenta",
  description: "Administra tu perfil de vendedor, la verificación de correo y tus preferencias de apariencia.",
};

export default function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<ProfileSearchParams>;
}) {
  return (
    <div className="max-w-4xl space-y-10">
      <h1 className="font-display text-2xl font-semibold">Configuración</h1>
      <section aria-labelledby="account-settings-title" className="space-y-4">
        <h2
          id="account-settings-title"
          className="font-display text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]"
        >
          Cuenta
        </h2>
        <Suspense
          fallback={
            <Skeleton className="h-16 w-full" aria-label="Cargando perfil" />
          }
        >
          <AccountProfile searchParams={searchParams} />
        </Suspense>
        <Suspense
          fallback={
            <Skeleton
              className="h-16 w-full"
              aria-label="Cargando verificación del correo"
            />
          }
        >
          <EmailVerification />
        </Suspense>
      </section>
      <section
        aria-labelledby="preferences-settings-title"
        className="space-y-4"
      >
        <h2
          id="preferences-settings-title"
          className="font-display text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]"
        >
          Preferencias
        </h2>
        <AccountAppearance />
      </section>
    </div>
  );
}
