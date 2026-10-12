import {
  requireAdminReadSdk,
  adminReadErrorResponse,
} from "@/lib/admin-read-sdk";
import { financeReportQuery } from "@/features/finance-reporting/parameters";
import { readFinanceReport } from "@/features/finance-reporting/read-report";

export async function GET(request: Request) {
  try {
    const sdk = await requireAdminReadSdk();
    const search = new URL(request.url).searchParams;
    const report = await readFinanceReport(
      sdk,
      financeReportQuery(search.get("period")),
      request.signal,
    );
    return Response.json(report, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return adminReadErrorResponse(error);
  }
}
