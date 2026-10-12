import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AccountHeading } from "@/features/account/components/account-heading"
import { AddressManager } from "@/features/account/components/address-manager"
import { AccountPagination } from "@/features/account/components/pagination"
import {
  ACCOUNT_PAGE_SIZE,
  getAccount,
  getPageNumber,
} from "@/features/account/data"

export const metadata: Metadata = {
  title: "Mis direcciones",
  description:
    "Guarda y administra tus direcciones de entrega en Estados Unidos y elige la dirección predeterminada para tus compras en USAPEEK.",
}

export default async function AddressesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>
}) {
  const page = getPageNumber((await searchParams).page)
  const { customer, sdk } = await getAccount()
  const { addresses, count } = await sdk.store.customer.listAddress({
    limit: ACCOUNT_PAGE_SIZE,
    offset: (page - 1) * ACCOUNT_PAGE_SIZE,
  })
  const lastPage = Math.max(1, Math.ceil(count / ACCOUNT_PAGE_SIZE))
  if (page > lastPage) redirect(`/account/addresses?page=${lastPage}`)
  return (
    <>
      <AccountHeading
        title="Mis direcciones"
        description="Guarda tus direcciones en Estados Unidos y elige cuál usar por defecto. Cada una puede tener su propio teléfono."
      />
      <AddressManager customer={customer} addresses={addresses} />
      <AccountPagination
        page={page}
        count={count}
        pageSize={ACCOUNT_PAGE_SIZE}
        href="/account/addresses"
      />
    </>
  )
}
