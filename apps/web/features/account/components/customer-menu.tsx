"use client"

import type { HttpTypes } from "@medusajs/types"
import {
  Heart,
  LoaderCircle,
  LogOut,
  MapPin,
  Package,
  Store,
} from "lucide-react"
import Link from "next/link"
import { useActionState, useRef } from "react"

import { logoutCustomerAction } from "@/app/auth-actions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { getCustomerIdentity } from "@/features/account/customer-identity"
import type { ApplicationNavigation } from "@/features/vendor-onboarding/presentation"
import type { GoogleCustomerProfile } from "@/lib/google-customer-profile"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const links = [
  { href: "/account/orders", label: "Mis órdenes", icon: Package },
  { href: "/account/addresses", label: "Mis direcciones", icon: MapPin },
  { href: "/account/favorites", label: "Favoritos", icon: Heart },
]

export function CustomerMenu({
  first_name,
  last_name,
  email,
  googleProfile,
  vendorApplication,
}: Pick<HttpTypes.StoreCustomer, "first_name" | "last_name" | "email"> & {
  vendorApplication?: ApplicationNavigation
  googleProfile?: GoogleCustomerProfile | null
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [, action, pending] = useActionState(logoutCustomerAction, undefined)
  const { name, initials } = getCustomerIdentity(
    {
      first_name,
      last_name,
      email,
    },
    googleProfile?.name,
  )

  return (
    <form ref={formRef} action={action} aria-busy={pending} className="h-11">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="relative h-11 gap-2 px-2"
            aria-label={
              vendorApplication?.unreadCount
                ? `Abrir menú de usuario de ${name}, ${vendorApplication.unreadCount} novedades de tu solicitud`
                : `Abrir menú de usuario de ${name}`
            }
            disabled={pending}
          >
            {googleProfile ? (
              <Avatar className="size-7" aria-hidden="true">
                {googleProfile.picture ? (
                  <AvatarImage
                    src={googleProfile.picture}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : null}
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            ) : null}
            <span className="max-w-20 truncate sm:max-w-32 lg:max-w-40">
              {name}
            </span>
            {Boolean(vendorApplication?.unreadCount) ? (
              <span
                className="absolute top-1 right-1 size-2.5 rounded-full border border-background bg-brand-accent"
                aria-hidden="true"
              />
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-64 max-w-[calc(100vw-2rem)]"
        >
          <DropdownMenuItem
            asChild
            disabled={pending}
            className="gap-3 px-3 py-3"
          >
            <Link href="/account" aria-label={`Mi cuenta: ${name}, ${email}`}>
              <Avatar
                className="size-10 border border-border"
                aria-hidden="true"
              >
                {googleProfile?.picture ? (
                  <AvatarImage
                    src={googleProfile.picture}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : null}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{name}</span>
                <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">
                  {email}
                </span>
              </span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {[
              ...links,
              {
                href: "/account/sell",
                label: vendorApplication?.label ?? "Vender en usapeek",
                icon: Store,
              },
            ].map(({ href, label, icon: Icon }) => (
              <DropdownMenuItem
                key={href}
                asChild
                disabled={pending}
                className="min-h-11 gap-3 px-3"
              >
                <Link href={href}>
                  <Icon aria-hidden="true" />
                  {label}
                  {href === "/account/sell" &&
                  Boolean(vendorApplication?.unreadCount) ? (
                    <span
                      className="ml-auto text-xs"
                      aria-label={`${vendorApplication?.unreadCount} novedades sin leer`}
                    >
                      {vendorApplication?.unreadCount}
                    </span>
                  ) : null}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={pending}
            className="min-h-11 gap-3 px-3"
            onSelect={(event) => {
              event.preventDefault()
              formRef.current?.requestSubmit()
            }}
          >
            {pending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <LogOut aria-hidden="true" />
            )}
            {pending ? "Cerrando sesión…" : "Cerrar sesión"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </form>
  )
}
