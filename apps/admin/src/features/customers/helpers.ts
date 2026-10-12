import type { AdminCustomerPurchasesResponse } from "@usapeek/api/customer-contracts";
import { money } from "../orders/helpers";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTableOffset,
} from "../../lib/pagination";

type Customer = AdminCustomerPurchasesResponse["customers"][number];

export function parseCustomerPagination(
  params: Record<string, string | string[] | undefined>,
) {
  return {
    offset: parseTableOffset(params.offset),
    limit: DEFAULT_TABLE_PAGE_SIZE,
  };
}

export function customerListHref(offset: number) {
  return `/dashboard/customers?offset=${Math.max(0, offset)}`;
}

export function customerName(customer: Customer) {
  if (customer.is_deleted) return "Cliente eliminado";
  return (
    [customer.first_name?.trim(), customer.last_name?.trim()]
      .filter(Boolean)
      .join(" ") ||
    customer.email ||
    "Sin nombre"
  );
}

export function customerAccountLabel(
  customer: Pick<Customer, "is_deleted" | "has_account">,
) {
  if (customer.is_deleted || customer.has_account === null)
    return "No disponible";
  return customer.has_account ? "Con cuenta" : "Invitado";
}

export function customerCountryName(code: string) {
  try {
    return (
      new Intl.DisplayNames(["es"], { type: "region" }).of(
        code.toUpperCase(),
      ) ?? code
    );
  } catch {
    return code;
  }
}

export function customerSpentAmounts(totals: Customer["spent_totals"]) {
  if (!Array.isArray(totals)) return ["Sin informar"];
  return totals.length
    ? totals.map(({ amount, currency_code }) => money(amount, currency_code))
    : ["Sin pagos"];
}

export function isCustomerId(id: string) {
  return /^cus_[a-zA-Z0-9_]{1,100}$/.test(id);
}

export function customerListErrorMessage(status?: number) {
  if (status === 401) return "Tu sesión venció. Vuelve a iniciar sesión.";
  if (status === 403)
    return "Tu cuenta no tiene permisos para consultar clientes y compras.";
  return "No se pudo cargar la lista de clientes. Inténtalo de nuevo.";
}
