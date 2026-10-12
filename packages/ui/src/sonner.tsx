"use client";

import React from "react";
import {
  CircleCheck,
  CircleAlert,
  Info,
  LoaderCircle,
  TriangleAlert,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { cn } from "./utils";

export function Toaster({
  className,
  icons,
  toastOptions,
  ...props
}: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className={cn("toaster", className)}
      richColors
      closeButton
      position="bottom-right"
      containerAriaLabel="Notificaciones"
      {...props}
      icons={{
        success: <CircleCheck aria-hidden="true" className="size-5" />,
        error: <CircleAlert aria-hidden="true" className="size-5" />,
        warning: <TriangleAlert aria-hidden="true" className="size-5" />,
        info: <Info aria-hidden="true" className="size-5" />,
        loading: (
          <LoaderCircle
            aria-hidden="true"
            className="size-5 motion-safe:animate-spin"
          />
        ),
        close: <X aria-hidden="true" className="size-4" />,
        ...icons,
      }}
      toastOptions={{
        closeButtonAriaLabel: "Cerrar notificación",
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          toast: cn("marketplace-toast", toastOptions?.classNames?.toast),
        },
      }}
    />
  );
}
