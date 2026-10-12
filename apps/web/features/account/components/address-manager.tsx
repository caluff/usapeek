"use client"

import type { HttpTypes } from "@medusajs/types"
import { Check, LoaderCircle, MapPin, Pencil, Plus, Trash2 } from "lucide-react"
import { useActionState, useState, type ReactNode } from "react"
import { formatPhoneNumberIntl } from "react-phone-number-input/input"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  deleteAddressAction,
  setDefaultAddressAction,
} from "@/features/account/actions"
import { AddressForm } from "@/features/account/components/address-form"
import { FormStatus } from "@/features/account/components/form-status"
import {
  INITIAL_ACCOUNT_STATE,
  type AccountActionState,
} from "@/features/account/types"
import { cn } from "@/lib/utils"

export function AddressManager({
  customer,
  addresses,
}: {
  customer: HttpTypes.StoreCustomer
  addresses: HttpTypes.StoreCustomerAddress[]
}) {
  const [notice, setNotice] = useState<AccountActionState>(
    INITIAL_ACCOUNT_STATE,
  )
  const sortedAddresses = addresses.toSorted(
    (a, b) => Number(b.is_default_shipping) - Number(a.is_default_shipping),
  )

  return (
    <div className="space-y-6">
      <FormStatus state={notice} />
      <div className="grid gap-5 xl:grid-cols-2">
        {sortedAddresses.map((address) => (
          <Card
            key={address.id}
            className={cn(
              "gap-5",
              address.is_default_shipping && "border-brand-accent/45",
            )}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <MapPin
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <h2 className="min-w-0 text-base font-semibold break-words">
                  {address.address_name || "Dirección guardada"}
                </h2>
              </div>
              {address.is_default_shipping ? (
                <Badge
                  variant="outline"
                  className="shrink-0 border-brand-accent/30 bg-brand-accent/10 text-foreground"
                >
                  <Check aria-hidden="true" />
                  Predeterminada
                </Badge>
              ) : null}
            </CardHeader>
            <CardContent className="flex-1">
              <address className="space-y-1 text-sm leading-6 text-muted-foreground not-italic">
                <p className="font-medium text-foreground">
                  {[address.first_name, address.last_name]
                    .filter(Boolean)
                    .join(" ")}
                </p>
                <p>{address.address_1}</p>
                {address.address_2 ? <p>{address.address_2}</p> : null}
                <p>
                  {[
                    address.city,
                    address.province?.toUpperCase(),
                    address.postal_code,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <p>
                  {address.country_code?.toLowerCase() === "us"
                    ? "Estados Unidos"
                    : address.country_code?.toUpperCase()}
                </p>
                {address.phone ? (
                  <p className="pt-2">
                    {formatPhoneNumberIntl(address.phone) || address.phone}
                  </p>
                ) : null}
              </address>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2 border-t border-border pt-4">
              <AddressEditor
                customer={customer}
                address={address}
                isFirstAddress={false}
                onSuccess={setNotice}
              >
                <Button type="button" variant="outline" className="gap-2">
                  <Pencil className="size-4" aria-hidden="true" />
                  Editar
                </Button>
              </AddressEditor>
              <DeleteAddress address={address} onSuccess={setNotice} />
              {!address.is_default_shipping ? (
                <DefaultAddress address={address} onSuccess={setNotice} />
              ) : null}
            </CardFooter>
          </Card>
        ))}
        <AddressEditor
          customer={customer}
          isFirstAddress={addresses.length === 0}
          onSuccess={setNotice}
        >
          <Button
            type="button"
            variant="outline"
            className="group h-auto min-h-64 flex-col gap-4 border-dashed px-6 py-10 text-center whitespace-normal hover:border-brand-accent/60 hover:bg-brand-accent/5"
          >
            <span className="grid size-12 place-items-center border border-border bg-muted/40 transition-colors group-hover:border-brand-accent/40">
              <Plus className="size-6" aria-hidden="true" />
            </span>
            <span className="text-base">Agregar dirección</span>
            <span className="max-w-64 text-sm leading-6 font-normal text-muted-foreground">
              {addresses.length
                ? "Guarda otro lugar de entrega."
                : "Guarda tu primera dirección para tenerla siempre a mano."}
            </span>
          </Button>
        </AddressEditor>
      </div>
    </div>
  )
}

function AddressEditor({
  customer,
  address,
  isFirstAddress,
  onSuccess,
  children,
}: {
  customer: HttpTypes.StoreCustomer
  address?: HttpTypes.StoreCustomerAddress
  isFirstAddress: boolean
  onSuccess: (state: AccountActionState) => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) setOpen(nextOpen)
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className="max-w-2xl sm:p-8"
        showCloseButton={!pending}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (pending) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {address ? "Editar dirección" : "Nueva dirección"}
          </DialogTitle>
          <DialogDescription>
            Un lugar de entrega, con su propio teléfono de contacto.
          </DialogDescription>
        </DialogHeader>
        <AddressForm
          customer={customer}
          address={address}
          isFirstAddress={isFirstAddress}
          onPendingChange={setPending}
          onCancel={() => setOpen(false)}
          onSuccess={(state) => {
            setOpen(false)
            onSuccess(state)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function DeleteAddress({
  address,
  onSuccess,
}: {
  address: HttpTypes.StoreCustomerAddress
  onSuccess: (state: AccountActionState) => void
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(
    async (previous: AccountActionState, formData: FormData) => {
      const result = await deleteAddressAction(previous, formData)
      if (result.status === "success") {
        setOpen(false)
        onSuccess(result)
      }
      return result
    },
    INITIAL_ACCOUNT_STATE,
  )

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) setOpen(nextOpen)
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label={`Eliminar ${address.address_name || "dirección"}`}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          <span>Eliminar</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar esta dirección?</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará «{address.address_name || address.address_1}» de tus
            direcciones guardadas. Tus pedidos anteriores conservarán sus datos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action} className="space-y-6" aria-busy={pending}>
          <input type="hidden" name="id" value={address.id} />
          <FormStatus state={state} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <Button
              type="submit"
              disabled={pending}
              className="bg-destructive text-[var(--destructive-foreground)] hover:bg-destructive/90"
            >
              {pending ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {pending ? "Eliminando…" : "Eliminar dirección"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DefaultAddress({
  address,
  onSuccess,
}: {
  address: HttpTypes.StoreCustomerAddress
  onSuccess: (state: AccountActionState) => void
}) {
  const [state, action, pending] = useActionState(
    async (previous: AccountActionState, formData: FormData) => {
      const result = await setDefaultAddressAction(previous, formData)
      if (result.status === "success") onSuccess(result)
      return result
    },
    INITIAL_ACCOUNT_STATE,
  )

  return (
    <form
      action={action}
      className="w-full border-t border-border pt-3"
      aria-busy={pending}
    >
      <input type="hidden" name="id" value={address.id} />
      <Button
        type="submit"
        variant="ghost"
        disabled={pending}
        className="w-full justify-start px-0 text-sm"
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="size-4" aria-hidden="true" />
        )}
        {pending ? "Guardando…" : "Marcar como predeterminada"}
      </Button>
      {state.status === "error" ? <FormStatus state={state} /> : null}
    </form>
  )
}
