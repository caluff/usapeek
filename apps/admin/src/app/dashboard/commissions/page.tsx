import type { Metadata } from "next";
import { Suspense } from "react";
import {
  CommissionPanel,
  CommissionSkeleton,
} from "@/features/commissions/components/commission-panel";
import {
  CaptureSettingsPanel,
  CaptureSettingsSkeleton,
} from "@/features/commissions/components/capture-settings-panel";
import {
  ReleaseSettingsPanel,
  ReleaseSettingsSkeleton,
} from "@/features/commissions/components/release-settings-panel";

export const metadata: Metadata = {
  title: "Pagos",
  description:
    "Configura la comisión global, los cobros y las liberaciones del marketplace en USAPEEK Admin.",
};

export default function CommissionsPage() {
  return (
    <div className="max-w-4xl space-y-10">
      <header>
        <h1 className="font-display text-2xl font-semibold">Pagos</h1>
      </header>
      <section aria-labelledby="global-commission-title" className="space-y-4">
        <h2
          id="global-commission-title"
          className="font-display text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]"
        >
          Comisión global
        </h2>
        <Suspense fallback={<CommissionSkeleton />}>
          <CommissionPanel />
        </Suspense>
      </section>
      <section aria-labelledby="payment-capture-title" className="space-y-4">
        <h2
          id="payment-capture-title"
          className="font-display text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]"
        >
          Cobros
        </h2>
        <Suspense fallback={<CaptureSettingsSkeleton />}>
          <CaptureSettingsPanel />
        </Suspense>
      </section>
      <section aria-labelledby="payment-release-title" className="space-y-4">
        <h2
          id="payment-release-title"
          className="font-display text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]"
        >
          Liberaciones
        </h2>
        <Suspense fallback={<ReleaseSettingsSkeleton />}>
          <ReleaseSettingsPanel />
        </Suspense>
      </section>
    </div>
  );
}
