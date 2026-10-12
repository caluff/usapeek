export type DashboardResult<T> = { data?: T; error?: string };
export type DashboardUpdate<T> = DashboardResult<T> & { clear?: boolean };

export function dashboardResult<T>(
  initial: DashboardResult<T>,
  update: DashboardUpdate<T> | null,
): DashboardResult<T> {
  if (update?.clear) return { error: update.error };
  return {
    data: update?.data ?? initial.data,
    error:
      update?.error ?? (update?.data !== undefined ? undefined : initial.error),
  };
}

export class DashboardReadError extends Error {
  constructor(public status: number) {
    super(
      [401, 403, 409].includes(status)
        ? "Tu sesión o el acceso a la tienda cambió. Vuelve a entrar al portal."
        : "No se pudo actualizar esta información. Se volverá a intentar automáticamente.",
    );
  }
  get isDenied() {
    return [401, 403, 409].includes(this.status);
  }
}

export async function readDashboardData<T>(
  url: string,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new DashboardReadError(response.status);
  return response.json();
}
