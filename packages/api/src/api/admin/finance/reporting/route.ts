import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type {
  FinanceReportingQuery,
  AdminFinanceReportingResponse,
} from "../../../../lib/order-finance/contracts";
import { readAdminFinanceReporting } from "../../../../lib/order-finance/admin-reporting-read";

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, FinanceReportingQuery>,
  res: MedusaResponse<AdminFinanceReportingResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  const controller = new AbortController();
  const disconnected = () => controller.abort();
  req.once("aborted", disconnected);
  res.once("close", disconnected);
  if (req.aborted || res.destroyed) controller.abort();
  try {
    const report = await readAdminFinanceReporting(
      req.scope,
      {
        actor_id: req.auth_context.actor_id,
        query: req.validatedQuery,
      },
      controller.signal,
    );
    if (!controller.signal.aborted) res.json(report);
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    req.off("aborted", disconnected);
    res.off("close", disconnected);
  }
}
