"use client";

import { useEffect, useState } from "react";
import { Autocomplete } from "./autocomplete";
import { Button } from "./button";
import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import { NativeSelect, NativeSelectOption } from "./native-select";
import { loadUsCities } from "./us-cities";
import { normalizeUsState, US_STATES } from "./us-states";

type UsAddressFieldsProps = {
  idPrefix: string;
  province: string;
  city: string;
  onChange: (value: { province: string; city: string }) => void;
  provinceName?: string;
  cityName?: string;
  disabled?: boolean;
  errors?: { province?: string; city?: string };
  autoCompletePrefix?: string;
  showAttribution?: boolean;
};

export function UsAddressFields({
  idPrefix,
  province,
  city,
  onChange,
  provinceName = "province",
  cityName = "city",
  disabled,
  errors,
  autoCompletePrefix = "shipping",
  showAttribution = true,
}: UsAddressFieldsProps) {
  const stateCode = normalizeUsState(province);
  return (
    <>
      <Field data-invalid={Boolean(errors?.province)}>
        <FieldLabel htmlFor={`${idPrefix}-province`}>Estado</FieldLabel>
        <NativeSelect
          id={`${idPrefix}-province`}
          name={provinceName}
          value={stateCode}
          onChange={(event) =>
            onChange({ province: event.target.value, city: "" })
          }
          disabled={disabled}
          required
          autoComplete={`${autoCompletePrefix} address-level1`.trim()}
          aria-invalid={Boolean(errors?.province)}
          aria-describedby={
            errors?.province ? `${idPrefix}-province-error` : undefined
          }
          className="min-h-11"
        >
          <NativeSelectOption value="" disabled>
            Selecciona un estado
          </NativeSelectOption>
          {US_STATES.map((state) => (
            <NativeSelectOption key={state.value} value={state.value}>
              {state.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldError id={`${idPrefix}-province-error`}>
          {errors?.province}
        </FieldError>
      </Field>
      <CityField
        key={stateCode}
        id={`${idPrefix}-city`}
        name={cityName}
        province={stateCode}
        value={city}
        onChange={(value) => onChange({ province: stateCode, city: value })}
        disabled={disabled}
        error={errors?.city}
        showAttribution={showAttribution}
      />
    </>
  );
}

function CityField({
  id,
  name,
  province,
  value,
  onChange,
  disabled,
  error,
  showAttribution,
}: {
  id: string;
  name: string;
  province: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  showAttribution: boolean;
}) {
  const [cities, setCities] = useState<readonly string[] | null>(null);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Keep an existing postal locality editable even if it is absent from the catalog.
  const [savedCity] = useState(value);
  useEffect(() => {
    if (!province) return;
    let cancelled = false;
    loadUsCities(province)
      .then((result) => {
        if (!cancelled) setCities(result);
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [province, attempt]);

  const options =
    cities && savedCity && !cities.includes(savedCity)
      ? [savedCity, ...cities]
      : (cities ?? []);
  const status = !province
    ? "Selecciona primero un estado."
    : hasError
      ? "No se pudieron cargar las ciudades."
      : !cities
        ? "Cargando ciudades…"
        : "";
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>Ciudad</FieldLabel>
      <Autocomplete
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        options={options}
        required
        disabled={disabled || !province}
        maxLength={100}
        autoComplete="off"
        placeholder={
          province ? "Busca una ciudad" : "Selecciona primero un estado"
        }
        listLabel="Ciudades del estado seleccionado"
        emptyMessage="No hay ciudades que coincidan con la búsqueda."
        invalidMessage="Selecciona una ciudad de la lista para este estado."
        blockedMessage={province && !cities ? status : undefined}
        aria-busy={Boolean(province && !cities && !hasError)}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-status${error ? ` ${id}-error` : ""}`}
      />
      <FieldDescription id={`${id}-status`} role="status">
        {status}
      </FieldDescription>
      {showAttribution ? (
        <p className="text-xs text-muted-foreground">
          Localidades de{" "}
          <a
            href="https://www.geonames.org/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            GeoNames
          </a>
          .
        </p>
      ) : null}
      {hasError ? (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            setHasError(false);
            setAttempt((current) => current + 1);
          }}
        >
          Reintentar
        </Button>
      ) : null}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}
