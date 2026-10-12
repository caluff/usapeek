import { Suspense, type ReactNode } from "react";
import { SettingsNavigation } from "@/features/workspace/settings-navigation";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
      <aside className="min-w-0 border-b pb-3 lg:border-b-0 lg:border-r lg:pr-5">
        <h2 className="mb-3 px-3 text-lg font-bold">Ajustes</h2>
        <Suspense
          fallback={
            <div className="h-14 lg:h-64" aria-label="Cargando navegación" />
          }
        >
          <SettingsNavigation />
        </Suspense>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
