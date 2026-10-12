import { parseOverviewMetricId, readOverviewCount } from "@/features/overview/metrics";
import { adminReadErrorResponse, requireAdminReadSdk } from "@/lib/admin-read-sdk";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const id = parseOverviewMetricId(search.get("metric"));
  if (!id || search.getAll("metric").length !== 1 || [...search.keys()].some((key) => key !== "metric")) {
    return Response.json({ message: "El indicador no es válido." }, { status: 400 });
  }
  try {
    const sdk = await requireAdminReadSdk();
    const count = await readOverviewCount(sdk, id, AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]));
    return Response.json({ count }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adminReadErrorResponse(error);
  }
}
