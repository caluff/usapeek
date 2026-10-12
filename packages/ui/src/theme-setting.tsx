"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "./button";
import { SettingsOption } from "./settings-option";

const subscribe = () => () => {};

export function ThemeSetting() {
  const { resolvedTheme, setTheme } = useTheme();
  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <SettingsOption
      label="Tema"
      value={
        isMounted
          ? resolvedTheme === "dark"
            ? "Oscuro"
            : "Claro"
          : "Cargando…"
      }
      description="Elige cómo quieres ver la aplicación."
    >
      <div
        className="flex flex-wrap gap-3"
        role="group"
        aria-label="Tema de la aplicación"
      >
        <Button
          type="button"
          variant={
            isMounted && resolvedTheme === "light" ? "default" : "outline"
          }
          aria-pressed={isMounted && resolvedTheme === "light"}
          onClick={() => setTheme("light")}
        >
          <Sun aria-hidden="true" />
          Claro
        </Button>
        <Button
          type="button"
          variant={
            isMounted && resolvedTheme === "dark" ? "default" : "outline"
          }
          aria-pressed={isMounted && resolvedTheme === "dark"}
          onClick={() => setTheme("dark")}
        >
          <Moon aria-hidden="true" />
          Oscuro
        </Button>
      </div>
    </SettingsOption>
  );
}
