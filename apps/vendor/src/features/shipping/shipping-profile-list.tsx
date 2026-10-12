import type { ShippingProfileDTO } from "@medusajs/types";
import { Package, Plus } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "../workspace/presentation";
import { shippingCoverageLabel } from "./coverage";
import {
  shippingOptionState,
  type ShippingOptionWithPrices,
} from "./operations";
import { isShippingProfileArchived, shippingProfileName } from "./presentation";
import { ShippingForm } from "./shipping-form";
import { ShippingProfileActions } from "./shipping-profile-actions";

export function ShippingProfileList({
  profiles,
  options,
  pickupEnabled,
}: {
  profiles: ShippingProfileDTO[];
  options: ShippingOptionWithPrices[];
  pickupEnabled: boolean;
}) {
  const sortedProfiles = [...profiles].sort(
    (first, second) =>
      Number(isShippingProfileArchived(first)) -
      Number(isShippingProfileArchived(second)),
  );
  const firstActiveProfile = sortedProfiles.find(
    (profile) => !isShippingProfileArchived(profile),
  );

  return (
    <Accordion
      type="multiple"
      defaultValue={firstActiveProfile ? [firstActiveProfile.id] : []}
      className="space-y-3"
    >
      {sortedProfiles.map((profile) => {
        const archived = isShippingProfileArchived(profile);
        const name = shippingProfileName(profile);
        const rates = options
          .filter(
            (option) =>
              option.shipping_profile_id === profile.id &&
              option.metadata?.marketplace_v2_pickup !== true,
          )
          .map((option) => ({ option, state: shippingOptionState(option) }));
        const title = (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
            <Package
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 basis-32 truncate font-semibold">
              {name}
            </span>
            {archived ? (
              <Badge variant="muted">Archivado</Badge>
            ) : (
              <>
                <Badge variant="outline">
                  {rates.length} {rates.length === 1 ? "tarifa" : "tarifas"}
                </Badge>
                {pickupEnabled ? <Badge variant="muted">Recogida</Badge> : null}
              </>
            )}
          </div>
        );
        return (
          <AccordionItem
            key={profile.id}
            value={profile.id}
            className="overflow-hidden rounded-xl border bg-card shadow-card last:border-b"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 px-4 sm:px-5">
              {archived ? (
                <h3 className="min-w-0 py-4 text-muted-foreground">{title}</h3>
              ) : (
                <AccordionTrigger className="py-4">{title}</AccordionTrigger>
              )}
              <ShippingProfileActions
                profileId={profile.id}
                name={name}
                archived={archived}
              />
            </div>
            {!archived ? (
              <AccordionContent className="border-t px-4 pt-4 pb-4 sm:px-5">
                <section aria-label={`Tarifas de ${name}`}>
                  <Accordion
                    type="single"
                    collapsible
                    className="overflow-hidden rounded-lg border"
                  >
                    {!rates.length ? (
                      <p className="border-b px-4 py-4 text-sm text-muted-foreground">
                        {pickupEnabled
                          ? "Solo recogida en tienda."
                          : "Sin tarifas."}
                      </p>
                    ) : null}
                    {rates.map(({ option, state }) => {
                      const description = option.type?.description ?? "";
                      const price = state.editable
                        ? Number(state.amount) === 0
                          ? "Gratis"
                          : formatMoney(state.amount, "USD")
                        : "Configuración avanzada";
                      return (
                        <AccordionItem key={option.id} value={option.id}>
                          <AccordionTrigger className="px-4 py-4 hover:bg-muted/35">
                            <div className="grid min-w-0 flex-1 gap-2 pr-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                              <div className="min-w-0">
                                <span className="block truncate font-semibold">
                                  {option.name}
                                </span>
                                <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">
                                  {state.editable
                                    ? shippingCoverageLabel(state.states)
                                    : "Cobertura avanzada"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 sm:justify-end">
                                <span className="text-sm font-semibold">
                                  {price}
                                </span>
                                <Badge
                                  variant={state.enabled ? "success" : "muted"}
                                >
                                  {state.enabled ? "Activa" : "Inactiva"}
                                </Badge>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="border-t bg-muted/20 px-4 pt-4">
                            {state.editable ? (
                              <ShippingForm
                                key={`${option.id}-${option.name}-${state.amount}-${state.enabled}-${description}-${state.states?.join(",") ?? "all"}`}
                                isOption
                                optionId={option.id}
                                name={option.name}
                                description={description}
                                amount={state.amount}
                                enabled={state.enabled}
                                states={state.states}
                              />
                            ) : (
                              <p className="text-sm leading-6 text-muted-foreground">
                                Esta tarifa usa una configuración avanzada y no
                                se puede editar desde esta vista. Puedes crear
                                una tarifa fija nueva para este perfil.
                              </p>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                    <AccordionItem value={`${profile.id}-new-rate`}>
                      <AccordionTrigger className="px-4 py-4 text-primary hover:bg-muted/35">
                        <span className="flex items-center gap-2 font-semibold">
                          <Plus className="size-4" aria-hidden="true" />
                          Añadir tarifa
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="border-t bg-muted/20 px-4 pt-4">
                        <ShippingForm isOption profileId={profile.id} />
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </section>
              </AccordionContent>
            ) : null}
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
