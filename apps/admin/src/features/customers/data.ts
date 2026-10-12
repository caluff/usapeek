import { FetchError } from "@medusajs/js-sdk";
import { unstable_rethrow } from "next/navigation";
import { requireAdminReadSdk } from "@/lib/admin-read-sdk";
import { customerListErrorMessage, parseCustomerPagination } from "./helpers";
import { listPurchasingCustomers } from "./operations";

export async function getPurchasingCustomers(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
) {
  const pagination = parseCustomerPagination(await searchParams);
  try {
    const sdk = await requireAdminReadSdk();
    const result = await listPurchasingCustomers(sdk.client, pagination);
    return { status: "success" as const, result, pagination };
  } catch (error) {
    unstable_rethrow(error);
    const status = error instanceof FetchError ? error.status : undefined;
    return {
      status: "error" as const,
      message: customerListErrorMessage(status),
      isDenied: status === 403,
      isExpired: status === 401,
      pagination,
    };
  }
}
