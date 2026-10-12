import { FetchError } from "@medusajs/js-sdk";
import { unstable_rethrow } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdminSdk } from "@/lib/auth-sdk";
import {
  readReleaseSettings,
  releaseSettingsErrorMessage,
} from "../release-settings";
import { ReleaseSettingsForm } from "./release-settings-form";
import { CommissionRefresh } from "./commission-form";

export function ReleaseSettingsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Cargando modo de liberación"
      aria-busy="true"
    >
      <Skeleton className="h-16 w-full" aria-hidden="true" />
      <span className="sr-only">Cargando modo de liberación…</span>
    </div>
  );
}

export async function ReleaseSettingsPanel() {
  let response;
  try {
    const sdk = await requireAdminSdk();
    response = await readReleaseSettings(sdk.client);
  } catch (error) {
    unstable_rethrow(error);
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-destructive">
          {error instanceof FetchError &&
          (error.status === 401 || error.status === 403)
            ? releaseSettingsErrorMessage(error.status)
            : "No se pudo consultar el modo de liberación. Reintenta para ver la configuración vigente."}
        </p>
        <CommissionRefresh />
      </div>
    );
  }
  return (
    <ReleaseSettingsForm
      settings={response.settings}
      automaticAvailable={response.automatic_available}
    />
  );
}
