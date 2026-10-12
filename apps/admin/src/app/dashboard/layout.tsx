import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { AdminHeader } from "@/components/admin/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentAdmin } from "@/lib/auth-sdk";
import {
  PendingApplicationsProvider,
  PendingApplicationsSeed,
} from "@/features/vendor-applications/components/pending-applications-provider";
import { getAdminNotificationStatus } from "@/features/realtime/status-read";
import { AdminNotificationsProvider } from "@/features/realtime/admin-notifications";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [user, cookieStore] = await Promise.all([getCurrentAdmin(), cookies()]);
  if (!user) redirect("/login?reason=expired&next=%2Fdashboard");

  return (
    <AdminNotificationsProvider key={user.id} accountId={user.id}>
      <PendingApplicationsProvider>
        <Suspense fallback={null}>
          <PendingStatus />
        </Suspense>
        <SidebarProvider
          cookieName="admin_sidebar_state"
          defaultOpen={
            cookieStore.get("admin_sidebar_state")?.value !== "false"
          }
        >
          <AdminSidebar user={user} />
          <SidebarInset className="min-w-0">
            <AdminHeader />
            <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </PendingApplicationsProvider>
    </AdminNotificationsProvider>
  );
}

async function PendingStatus() {
  return (
    <PendingApplicationsSeed status={await getAdminNotificationStatus()} />
  );
}
