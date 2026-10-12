"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

export function SiteHeaderVisibility({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return pathname === "/login" ? null : children
}
