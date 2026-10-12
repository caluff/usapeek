import type { ReactNode } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { VendorHeader } from "./vendor-header";
import { VendorSidebar, type VendorIdentity } from "./vendor-sidebar";
import { UnsavedChangesProvider } from "@/features/workspace/unsaved-changes";
import { SellerNotificationsProvider } from "@/features/workspace/seller-notifications";

export function VendorShell({
  children,
  identity,
  canSwitchSeller,
  storeSetup,
  defaultOpen = true,
}: {
  children: ReactNode;
  identity: VendorIdentity;
  canSwitchSeller: boolean;
  storeSetup: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <SellerNotificationsProvider sellerId={identity.sellerId}>
      <UnsavedChangesProvider>
        <SidebarProvider
          cookieName="vendor_sidebar_state"
          defaultOpen={defaultOpen}
        >
          <a
            href="#vendor-content"
            className="fixed left-4 top-3 z-[70] -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-transform focus:translate-y-0"
          >
            Saltar al contenido
          </a>
          <VendorSidebar
            identity={identity}
            canSwitchSeller={canSwitchSeller}
            storeSetup={storeSetup}
          />
          <SidebarInset>
            <VendorHeader sellerName={identity.sellerName} />
            <div
              id="vendor-content"
              tabIndex={-1}
              className="vendor-canvas flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
            >
              <div className="mx-auto max-w-[1440px]">{children}</div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </UnsavedChangesProvider>
    </SellerNotificationsProvider>
  );
}
