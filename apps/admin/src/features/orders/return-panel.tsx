"use client";

import {
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SettingsOption } from "@/components/ui/settings-option";
import { notifyFeedback } from "@/lib/feedback";
import { orderReturnAction } from "./return-actions";
import {
  activeReturnChange,
  canCancelReturn,
  customerReturnDetails,
  availableReturnQuantity,
  returnActionLines,
  returnLabel,
  type ReturnActionState,
  type ReturnChange,
  type ReturnLine,
  type ReturnLocation,
  type ReturnRecord,
} from "./return-operations";

type EditorControls = {
  isBlocked: boolean;
  onPending: (pending: boolean) => void;
  onSaved: (focusRef?: RefObject<HTMLElement | null>) => void;
};

function ReturnEditorContent({
  children,
  controls,
}: {
  children: (controls: EditorControls) => ReactNode;
  controls: EditorControls;
}) {
  return children(controls);
}

function ReturnEditor({
  label,
  value,
  children,
}: {
  label: string;
  value: ReactNode;
  children: (controls: EditorControls) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const blockedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div ref={rootRef}>
      <SettingsOption
        label={label}
        value={value}
        open={isOpen}
        onOpenChange={(open) => {
          if (blockedRef.current) return;
          if (open)
            triggerRef.current =
              rootRef.current?.querySelector<HTMLButtonElement>(
                "[data-settings-option-trigger]",
              ) ?? null;
          setIsOpen(open);
        }}
      >
        {isOpen ? (
          <ReturnEditorContent
            controls={{
              isBlocked,
              onPending: (pending) => {
                blockedRef.current = pending;
                setIsBlocked(pending);
              },
              onSaved: (focusRef) => {
                if (focusRef) focusRef.current = triggerRef.current;
                setIsOpen(false);
              },
            }}
          >
            {children}
          </ReturnEditorContent>
        ) : null}
      </SettingsOption>
    </div>
  );
}

function ReturnActionForm({
  orderId,
  returnId,
  operation,
  label,
  description,
  destructive = false,
  controls,
  children,
}: {
  orderId: string;
  returnId?: string;
  operation: string;
  label: string;
  description?: string;
  destructive?: boolean;
  controls: EditorControls;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<ReturnActionState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();
  const [isConfirming, setIsConfirming] = useState(false);
  const pendingRef = useRef(false);
  const formRef = useRef<FormData | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  function submit(form: FormData) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    controls.onPending(true);
    startTransition(async () => {
      try {
        const result = await orderReturnAction(form);
        setState(result);
        notifyFeedback(result);
        if (result.status === "success") {
          controls.onSaved(returnFocusRef);
        }
      } catch {
        const result: ReturnActionState = {
          status: "error",
          message:
            "No se pudo confirmar el resultado. Actualiza el pedido y revisa el borrador antes de reintentar.",
        };
        setState(result);
        notifyFeedback(result);
      } finally {
        pendingRef.current = false;
        formRef.current = null;
        controls.onPending(false);
        setIsConfirming(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            pendingRef.current ||
            controls.isBlocked ||
            state.status === "success"
          )
            return;
          const form = new FormData(event.currentTarget);
          if (description) {
            formRef.current = form;
            returnFocusRef.current = buttonRef.current;
            controls.onPending(true);
            setIsConfirming(true);
          } else submit(form);
        }}
      >
        <input type="hidden" name="order_id" value={orderId} />
        <input type="hidden" name="operation" value={operation} />
        {returnId ? (
          <input type="hidden" name="return_id" value={returnId} />
        ) : null}
        <fieldset
          disabled={
            isPending || controls.isBlocked || state.status === "success"
          }
          className="space-y-4"
        >
          {children}
          <Button
            ref={buttonRef}
            type="submit"
            className="min-h-11"
            variant={destructive ? "destructive" : "default"}
          >
            {isPending ? "Guardando…" : label}
          </Button>
        </fieldset>
        {state.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}
      </form>
      {description ? (
        <ConfirmationDialog
          open={isConfirming}
          onOpenChange={(open) => {
            if (pendingRef.current) return;
            setIsConfirming(open);
            controls.onPending(open);
            if (!open) formRef.current = null;
          }}
          title={label}
          description={description}
          confirmLabel={label}
          variant={destructive ? "destructive" : "default"}
          isPending={isPending}
          returnFocusRef={returnFocusRef}
          onConfirm={() => {
            if (!formRef.current || pendingRef.current) return;
            formRef.current.set("confirmed", "yes");
            submit(formRef.current);
          }}
        />
      ) : null}
    </>
  );
}

function QuantityFields({
  items,
  records,
}: {
  items: ReturnLine[];
  records: ReturnRecord[];
}) {
  return (
    <div className="space-y-4">
      {items
        .filter((item) => availableReturnQuantity(item, records) > 0)
        .map((item) => {
          const available = availableReturnQuantity(item, records);
          return (
            <label key={item.id} className="block space-y-2 text-sm">
              <span className="flex justify-between gap-3">
                <span>{item.title}</span>
                <span className="text-muted-foreground">
                  {available} disponibles
                </span>
              </span>
              <Input
                name={`quantity:${item.id}`}
                type="number"
                min={0}
                max={available}
                step={1}
                defaultValue={0}
                required
                className="h-11"
              />
            </label>
          );
        })}
    </div>
  );
}

function ReturnLocationField({
  locations,
  selectedId,
}: {
  locations: ReturnLocation[];
  selectedId?: string | null;
}) {
  const defaultId = locations.some((location) => location.id === selectedId)
    ? (selectedId ?? "")
    : locations.length === 1
      ? locations[0].id
      : "";
  return (
    <label className="block space-y-2 text-sm">
      <span>Almacén de recepción</span>
      <NativeSelect name="location_id" defaultValue={defaultId} required>
        <option value="" disabled>
          Selecciona un almacén
        </option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}

function CustomerReason({ record }: { record: ReturnRecord }) {
  const request = customerReturnDetails(record.metadata);
  if (!request) return null;
  const reason =
    request.reason === "damaged"
      ? "Artículo dañado"
      : request.reason === "wrong_item"
        ? "Artículo equivocado"
        : "Solicitud del cliente";
  const note = request.note;
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted-foreground">Solicitud del cliente</p>
      <p className="font-medium">{reason}</p>
      {note ? (
        <p className="whitespace-pre-wrap text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
}

export function OrderReturnsPanel({
  orderId,
  items,
  records,
  changes,
  locations,
  isCanceled,
}: {
  orderId: string;
  items: ReturnLine[];
  records: ReturnRecord[];
  changes: ReturnChange[];
  locations: ReturnLocation[];
  isCanceled: boolean;
}) {
  const hasActiveChange = changes.some(
    (change) => change.status === "pending" || change.status === "requested",
  );
  const canCreate =
    !isCanceled &&
    !hasActiveChange &&
    locations.length > 0 &&
    items.some((item) => availableReturnQuantity(item, records) > 0);
  return (
    <section className="space-y-3" aria-labelledby="order-returns-title">
      <h2
        id="order-returns-title"
        className="text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]"
      >
        Devoluciones
      </h2>
      {canCreate ? (
        <ReturnEditor
          label="Solicitar devolución"
          value="Seleccionar artículos"
        >
          {(controls) => (
            <ReturnActionForm
              orderId={orderId}
              operation="create"
              label="Guardar solicitud"
              controls={controls}
            >
              <QuantityFields items={items} records={records} />
              <ReturnLocationField locations={locations} />
              <label className="block space-y-2 text-sm">
                <span>Motivo (opcional)</span>
                <Input name="note" maxLength={1000} className="h-11" />
              </label>
            </ReturnActionForm>
          )}
        </ReturnEditor>
      ) : !isCanceled && !hasActiveChange && !locations.length ? (
        <p role="status" className="py-3 text-sm text-muted-foreground">
          No se pudo verificar un almacén para recibir devoluciones.
        </p>
      ) : null}
      {!records.length ? (
        <p className="py-3 text-sm text-muted-foreground">
          Sin devoluciones registradas.
        </p>
      ) : (
        records.map((record) => {
          const change = activeReturnChange(changes, record.id);
          const draftLines = returnActionLines(change);
          const isDraft = !record.requested_at && !record.canceled_at;
          const canReceive =
            !isCanceled &&
            record.requested_at &&
            !record.canceled_at &&
            record.status !== "received";
          return (
            <ReturnEditor
              key={record.id}
              label={`Devolución ${record.display_id}`}
              value={
                <Badge variant="secondary">{returnLabel(record, change)}</Badge>
              }
            >
              {(controls) => (
                <div className="space-y-5">
                  <CustomerReason record={record} />
                  <ul className="space-y-2 text-sm">
                    {(isDraft
                      ? draftLines.map((line) => ({
                          id: line.id,
                          itemId: line.itemId,
                          quantity: line.quantity,
                          received: undefined,
                          damaged: undefined,
                        }))
                      : (record.items ?? []).map((line) => ({
                          id: line.id,
                          itemId: line.item_id,
                          quantity: line.quantity,
                          received: line.received_quantity,
                          damaged: line.damaged_quantity,
                        }))
                    ).map((line) => (
                      <li key={line.id} className="flex justify-between gap-4">
                        <span>
                          {items.find((item) => item.id === line.itemId)
                            ?.title ?? "Artículo"}
                          <span className="block text-xs text-muted-foreground">
                            {line.received != null
                              ? `${line.received} recibidas · ${line.damaged ?? 0} dañadas`
                              : "Pendiente de aprobación"}
                          </span>
                        </span>
                        <span className="tabular-nums">
                          {line.quantity} unidades
                        </span>
                      </li>
                    ))}
                  </ul>
                  {isDraft && !isCanceled && change ? (
                    <>
                      {!draftLines.length ? (
                        <ReturnActionForm
                          orderId={orderId}
                          returnId={record.id}
                          operation="add_items"
                          label="Guardar artículos"
                          controls={controls}
                        >
                          <QuantityFields items={items} records={records} />
                        </ReturnActionForm>
                      ) : locations.length ? (
                        <ReturnActionForm
                          orderId={orderId}
                          returnId={record.id}
                          operation="confirm_request"
                          label="Aprobar devolución"
                          description="Se confirmarán los artículos solicitados. El reembolso se realiza desde Finanzas después de revisar la devolución."
                          controls={controls}
                        >
                          <ReturnLocationField
                            locations={locations}
                            selectedId={record.location_id}
                          />
                        </ReturnActionForm>
                      ) : (
                        <p
                          role="status"
                          className="text-sm text-muted-foreground"
                        >
                          No se pudo verificar un almacén para aprobar esta
                          devolución.
                        </p>
                      )}
                      <ReturnActionForm
                        orderId={orderId}
                        returnId={record.id}
                        operation="cancel_request"
                        label="Descartar solicitud"
                        description="Se descartará esta solicitud de devolución. No se modificará el pedido ni se devolverá dinero."
                        destructive
                        controls={controls}
                      />
                    </>
                  ) : null}
                  {canReceive && !change ? (
                    <ReturnActionForm
                      orderId={orderId}
                      returnId={record.id}
                      operation="begin_receive"
                      label="Iniciar recepción"
                      controls={controls}
                    />
                  ) : null}
                  {!isCanceled && canCancelReturn(record, hasActiveChange) ? (
                    <ReturnActionForm
                      orderId={orderId}
                      returnId={record.id}
                      operation="cancel_return"
                      label="Cancelar devolución"
                      description="Se cancelará esta devolución aprobada. Las unidades volverán a estar disponibles para otra solicitud; esta acción no registra una recepción ni realiza un reembolso."
                      destructive
                      controls={controls}
                    />
                  ) : null}
                  {canReceive && change ? (
                    <>
                      {!draftLines.length ? (
                        <ReturnActionForm
                          orderId={orderId}
                          returnId={record.id}
                          operation="stage_receive"
                          label="Guardar cantidades"
                          controls={controls}
                        >
                          <p className="text-sm text-muted-foreground">
                            Separa las unidades en buen estado de las dañadas.
                            Las dañadas no vuelven al stock disponible.
                          </p>
                          {(record.items ?? [])
                            .filter(
                              (line) =>
                                line.quantity >
                                Number(line.received_quantity ?? 0),
                            )
                            .map((line) => {
                              const remaining =
                                line.quantity -
                                Number(line.received_quantity ?? 0);
                              return (
                                <div key={line.id} className="space-y-3">
                                  <p className="text-sm font-medium">
                                    {items.find(
                                      (item) => item.id === line.item_id,
                                    )?.title ?? "Artículo"}{" "}
                                    <span className="font-normal text-muted-foreground">
                                      ({remaining} pendientes)
                                    </span>
                                  </p>
                                  <div className="grid grid-cols-2 gap-3">
                                    {[
                                      ["received", "Buen estado"],
                                      ["damaged", "Dañadas"],
                                    ].map(([field, label]) => (
                                      <label
                                        key={field}
                                        className="block space-y-2 text-sm"
                                      >
                                        <span>{label}</span>
                                        <Input
                                          name={`${field}:${line.item_id}`}
                                          type="number"
                                          min={0}
                                          max={remaining}
                                          step={1}
                                          defaultValue={0}
                                          required
                                          className="h-11"
                                        />
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                        </ReturnActionForm>
                      ) : (
                        <>
                          <ul className="space-y-2 text-sm">
                            {draftLines.map((line) => (
                              <li key={line.id}>
                                {items.find((item) => item.id === line.itemId)
                                  ?.title ?? "Artículo"}
                                : {line.quantity}{" "}
                                {line.damaged ? "dañadas" : "en buen estado"}
                              </li>
                            ))}
                          </ul>
                          <ReturnActionForm
                            orderId={orderId}
                            returnId={record.id}
                            operation="confirm_receive"
                            label="Confirmar recepción"
                            description="Se registrarán estas cantidades. Solo las unidades en buen estado volverán al inventario. Revisa las cantidades guardadas antes de continuar."
                            controls={controls}
                          />
                        </>
                      )}
                      <ReturnActionForm
                        orderId={orderId}
                        returnId={record.id}
                        operation="cancel_receive"
                        label="Descartar recepción"
                        description="Se descartarán las cantidades guardadas en este borrador. La devolución seguirá pendiente de recepción y el stock no cambiará."
                        destructive
                        controls={controls}
                      />
                    </>
                  ) : null}
                  {!isDraft && !record.canceled_at ? (
                    <a
                      href="#order-finance"
                      onClick={() => controls.onSaved()}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4"
                    >
                      Revisar reembolso en Finanzas
                    </a>
                  ) : null}
                </div>
              )}
            </ReturnEditor>
          );
        })
      )}
    </section>
  );
}
