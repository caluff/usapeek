import { FetchError } from "@medusajs/js-sdk";
import {
  adminReadErrorResponse,
  requireAdminReadSdk,
} from "@/lib/admin-read-sdk";
import {
  isCustomerId,
  parseCustomerPagination,
} from "@/features/customers/helpers";
import { retrieveCustomerPurchases } from "@/features/customers/operations";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const search = new URL(request.url).searchParams;
  if (
    !isCustomerId(id) ||
    search.getAll("offset").length > 1 ||
    [...search.keys()].some((key) => key !== "offset")
  ) {
    return Response.json(
      { message: "La consulta del cliente no es válida." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const { offset } = parseCustomerPagination({
    offset: search.get("offset") ?? undefined,
  });
  try {
    const sdk = await requireAdminReadSdk();
    const result = await retrieveCustomerPurchases(
      sdk.client,
      id,
      offset,
      AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
    );
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) {
      return Response.json(
        { message: "El cliente ya no está disponible." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return adminReadErrorResponse(error);
  }
}
