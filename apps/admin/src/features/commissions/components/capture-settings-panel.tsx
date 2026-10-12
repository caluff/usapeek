import { FetchError } from "@medusajs/js-sdk";
import { unstable_rethrow } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdminSdk } from "@/lib/auth-sdk";
import {
  readCaptureSettings,
  captureSettingsErrorMessage,
} from "../capture-settings";
import { CaptureSettingsForm } from "./capture-settings-form";
import { CommissionRefresh } from "./commission-form";

export function CaptureSettingsSkeleton() {
  return (
    <div role="status" aria-label="Cargando modo de cobro" aria-busy="true">
      <Skeleton className="h-16 w-full" aria-hidden="true" />
      <span className="sr-only">Cargando modo de cobro…</span>
    </div>
  );
}

export async function CaptureSettingsPanel() {
  let response;
  try {
    const sdk = await requireAdminSdk();
    response = await readCaptureSettings(sdk.client);
  } catch (error) {
    unstable_rethrow(error);
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-destructive">
          {captureSettingsErrorMessage(
            error instanceof FetchError ? error.status : undefined,
          )}
        </p>
        <CommissionRefresh />
      </div>
    );
  }
  return <CaptureSettingsForm settings={response.settings} />;
}
