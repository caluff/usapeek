import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div
      role="status"
      aria-label="Cargando sección de ajustes"
      className="max-w-4xl space-y-6"
    >
      <Skeleton className="h-12 w-56" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
