"use client"

import { Menu } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { catalogHref } from "@/features/catalog/catalog-navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Keep the trigger and its slotted child in the same client boundary.
export function CatalogMenu({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Abrir catálogo y categorías"
          title="Catálogo y categorías"
        >
          <Menu aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={12}
        className="w-72 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuItem asChild className="min-h-11 px-3">
          <Link href="/">Inicio</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-11 px-3">
          <Link href={catalogHref({})}>Todo el catálogo</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-3 text-xs text-muted-foreground">
          Categorías
        </DropdownMenuLabel>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
