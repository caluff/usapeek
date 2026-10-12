"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { SearchInput } from "@/features/search/components/search-input"

function SearchFromUrl() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const query = pathname === "/search" ? (searchParams.get("q") ?? "") : ""
  return <SearchInput key={`${pathname}:${query}`} query={query} />
}

export function HeaderSearch() {
  return (
    <Suspense fallback={<SearchInput />}>
      <SearchFromUrl />
    </Suspense>
  )
}
