import { Suspense, type ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { VendorShell } from "@/components/vendor/vendor-shell";
import {
  StoreSetup,
  StoreSetupSkeleton,
} from "@/features/workspace/store-setup";
import { getVendorContext } from "@/lib/auth-sdk";

export default async function VendorWorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [context, cookieStore] = await Promise.all([
    getVendorContext(),
    cookies(),
  ]);

  if (context.status === "seller_unavailable") redirect("/seller/status");

  if (context.status === "unauthenticated") {
    redirect("/seller/login?reason=expired&next=%2Fseller");
  }
  if (context.status === "seller_missing") {
    redirect("/seller/select-seller?next=%2Fseller");
  }
  if (context.status === "member_inactive") {
    redirect("/seller/no-access?reason=inactive");
  }
  if (context.status === "forbidden") {
    redirect("/seller/no-access?reason=forbidden");
  }
  if (context.status === "configuration_missing") {
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-5 text-center">
        <div className="max-w-md rounded-xl border border-warning/50 bg-card p-6 shadow-card">
          <h1 className="font-display text-3xl">Configuración pendiente</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Define NEXT_PUBLIC_MEDUSA_BACKEND_URL para habilitar el portal.
          </p>
        </div>
      </main>
    );
  }

  if (context.status !== "authenticated") {
    redirect("/seller/login?reason=expired&next=%2Fseller");
  }

  const { membership } = context;
  const memberName =
    [membership.member.first_name, membership.member.last_name]
      .filter(Boolean)
      .join(" ") || membership.member.email;

  return (
    <VendorShell
      defaultOpen={cookieStore.get("vendor_sidebar_state")?.value !== "false"}
      identity={{
        sellerId: membership.seller.id,
        memberName,
        memberEmail: membership.member.email,
        sellerName: membership.seller.name,
        roleId: membership.role_id,
      }}
      canSwitchSeller={context.membershipCount > 1}
      storeSetup={
        <Suspense fallback={<StoreSetupSkeleton />}>
          <StoreSetup />
        </Suspense>
      }
    >
      {children}
    </VendorShell>
  );
}
