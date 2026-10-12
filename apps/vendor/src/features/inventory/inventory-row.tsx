"use client";

import { useActionState, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { TableCell, TableRow } from "@/components/ui/table";
import { notifyFeedback } from "@/lib/feedback";
import { updateStockAction } from "../workspace/actions";
import type { MutationState } from "../workspace/presentation";

export function InventoryRow({
  identity,
  name,
  itemId,
  locationId,
  stocked,
  reserved,
  available,
}: {
  identity: ReactNode;
  name: string;
  itemId: string;
  locationId: string;
  stocked: number;
  reserved: number;
  available: number;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [quantity, setQuantity] = useState(String(stocked));
  const [expectedQuantity, setExpectedQuantity] = useState(stocked);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [state, action, isPending] = useActionState(
    async (previous: MutationState, form: FormData) => {
      setHasSubmitted(true);
      const result = await updateStockAction(previous, form);
      notifyFeedback(result);
      if (result.status === "success") {
        setIsEditing(false);
        triggerRef.current?.focus();
      }
      return result;
    },
    { status: "idle" },
  );
  const nextQuantity = Number(quantity);
  const isValid =
    /^\d+$/.test(quantity) &&
    Number.isSafeInteger(nextQuantity) &&
    nextQuantity >= reserved;

  function closeEditor() {
    setIsEditing(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <TableRow>
        <TableCell className="min-w-64">{identity}</TableCell>
        <TableCell className="text-right tabular-nums">{stocked}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {reserved}
        </TableCell>
        <TableCell className="text-right font-semibold tabular-nums">
          {available}
        </TableCell>
        <TableCell className="text-right">
          <Button
            ref={triggerRef}
            variant="outline"
            size="sm"
            aria-label={`Ajustar existencias de ${name}`}
            aria-expanded={isEditing}
            aria-controls={isEditing ? id : undefined}
            aria-disabled={isPending}
            onClick={() => {
              if (isPending) return;
              if (isEditing) return closeEditor();
              setQuantity(String(stocked));
              setExpectedQuantity(stocked);
              setHasSubmitted(false);
              setIsEditing(true);
            }}
          >
            Ajustar
          </Button>
        </TableCell>
      </TableRow>
      {isEditing ? (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={5} className="px-4 py-5 sm:px-6">
            <form
              id={id}
              action={action}
              aria-busy={isPending}
              className="space-y-3"
              onKeyDown={(event) => {
                if (event.key === "Escape" && !isPending) {
                  event.preventDefault();
                  closeEditor();
                }
              }}
            >
              <input type="hidden" name="id" value={itemId} />
              <input type="hidden" name="location_id" value={locationId} />
              <input
                type="hidden"
                name="expected_quantity"
                value={expectedQuantity}
              />
              <fieldset
                disabled={isPending}
                className="flex flex-wrap items-end gap-3"
              >
                <Field className="w-full max-w-xs">
                  <FieldLabel htmlFor={`${id}-quantity`}>
                    Unidades totales en el almacén
                  </FieldLabel>
                  <Input
                    id={`${id}-quantity`}
                    name="stocked_quantity"
                    type="number"
                    step={1}
                    min={reserved}
                    required
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    autoFocus
                    aria-describedby={`${id}-help`}
                  />
                </Field>
                <Button
                  type="submit"
                  disabled={!isValid || nextQuantity === expectedQuantity}
                >
                  {isPending ? "Guardando…" : "Guardar cantidad"}
                </Button>
                <Button variant="ghost" onClick={closeEditor}>
                  Cancelar
                </Button>
              </fieldset>
              <FieldDescription id={`${id}-help`}>
                Incluye las unidades reservadas para pedidos.
                {reserved > 0 ? ` El mínimo es ${reserved}.` : ""}
              </FieldDescription>
              {isValid ? (
                <p role="status" className="text-sm">
                  Quedarán{" "}
                  <strong className="tabular-nums">
                    {nextQuantity - reserved}
                  </strong>{" "}
                  disponibles para vender.
                </p>
              ) : null}
              {hasSubmitted && state.status === "error" ? (
                <p role="alert" className="text-sm text-destructive">
                  {state.message}
                </p>
              ) : null}
            </form>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
