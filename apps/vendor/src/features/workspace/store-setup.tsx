import type { VendorOnboardingResponse } from "@usapeek/vendor-onboarding-contracts";

import { resultOf, workspace } from "./data";
import { StoreSetupTimeline } from "./store-setup-timeline";

export async function StoreSetup() {
  const { client } = await workspace();
  const setup = await resultOf(
    client.get<VendorOnboardingResponse>("/vendor/onboarding"),
  );

  if (!setup.data) {
    return (
      <div className="border-t border-sidebar-border px-4 py-4">
        <p className="text-xs font-semibold">Preparación de la tienda</p>
        <p role="alert" className="mt-2 text-xs text-sidebar-muted">
          {setup.error}
        </p>
      </div>
    );
  }

  return <StoreSetupTimeline checks={setup.data.checks} />;
}

export function StoreSetupSkeleton() {
  return (
    <div
      role="status"
      aria-label="Cargando preparación de la tienda"
      className="border-t border-sidebar-border px-4 py-4"
    >
      <div className="h-4 w-40 rounded bg-sidebar-accent motion-safe:animate-pulse" />
      <div className="mt-3 space-y-1" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex h-14 items-center gap-3">
            <div className="size-5 rounded-full bg-sidebar-accent motion-safe:animate-pulse" />
            <div className="h-8 flex-1 rounded bg-sidebar-accent motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
