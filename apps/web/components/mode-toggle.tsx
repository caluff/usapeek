"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const subscribe = () => () => {}

export function ModeToggle({ className }: { className?: string }) {
  const mounted = React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
  const { setTheme, resolvedTheme } = useTheme()
  const label =
    mounted && resolvedTheme === "dark"
      ? "Cambiar a modo claro"
      : "Cambiar a modo oscuro"

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={!mounted}
      className={cn("size-11", className)}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label={label}
      title={label}
    >
      <Sun
        className="hidden size-5 dark:block"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <Moon className="size-5 dark:hidden" strokeWidth={1.75} aria-hidden="true" />
    </Button>
  )
}
