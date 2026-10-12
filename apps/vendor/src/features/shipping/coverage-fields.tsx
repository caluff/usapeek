"use client";

import { useState } from "react";
import { US_STATES } from "@usapeek/ui/us-states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field";

export function CoverageFields({
  id,
  states,
  onChange,
  disabled,
}: {
  id: string;
  states: string[] | null;
  onChange: (states: string[] | null) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const visibleStates = US_STATES.filter((state) =>
    `${state.label} ${state.value}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-3 border-t pt-4 sm:col-span-2"
    >
      <legend className="px-1 text-sm font-semibold">
        Cobertura de la tarifa
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { value: "all", label: "Todos los estados" },
          { value: "states", label: "Estados seleccionados" },
        ].map((mode) => (
          <label
            key={mode.value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input bg-background px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-2 has-focus-visible:ring-ring has-disabled:cursor-not-allowed has-disabled:opacity-50"
          >
            <input
              type="radio"
              name="coverage_mode"
              value={mode.value}
              checked={mode.value === (states === null ? "all" : "states")}
              onChange={() =>
                onChange(
                  mode.value === "all"
                    ? null
                    : US_STATES.map((state) => state.value),
                )
              }
              className="size-4 accent-primary"
            />
            {mode.label}
          </label>
        ))}
      </div>
      {states !== null ? (
        <div className="space-y-3 rounded-md border border-input bg-background p-3">
          {states.map((state) => (
            <input
              key={state}
              type="hidden"
              name="coverage_state"
              value={state}
            />
          ))}
          <div className="space-y-2">
            <FieldLabel htmlFor={`${id}-state-search`}>
              Buscar estado
            </FieldLabel>
            <Input
              id={`${id}-state-search`}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre o abreviatura"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-xs text-muted-foreground">
              {states.length} de {US_STATES.length} seleccionados
            </p>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(US_STATES.map((state) => state.value))}
              >
                Seleccionar todos
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange([])}
              >
                Limpiar
              </Button>
            </div>
          </div>
          <div
            className="grid max-h-60 gap-x-3 overflow-y-auto overscroll-contain sm:grid-cols-2"
            aria-label="Estados con cobertura"
          >
            {visibleStates.map((state) => (
              <label
                key={state.value}
                htmlFor={`${id}-state-${state.value}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2 text-sm hover:bg-muted/50"
              >
                <Checkbox
                  id={`${id}-state-${state.value}`}
                  checked={states.includes(state.value)}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked === true
                        ? [...states, state.value]
                        : states.filter((value) => value !== state.value),
                    )
                  }
                />
                <span>{state.label}</span>
                <span className="ml-auto text-xs uppercase text-muted-foreground">
                  {state.value}
                </span>
              </label>
            ))}
          </div>
          {!visibleStates.length ? (
            <p role="status" className="text-sm text-muted-foreground">
              No hay estados que coincidan con la búsqueda.
            </p>
          ) : null}
          {!states.length ? (
            <p role="alert" className="text-sm text-destructive">
              Selecciona al menos un estado.
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs leading-5 text-muted-foreground">
        El comprador verá esta tarifa cuando su dirección de envío esté dentro
        de la cobertura.
      </p>
    </fieldset>
  );
}
