"use client";

import { useEffect, useRef, useState } from "react";
import PhoneInput, {
  isValidPhoneNumber,
  parsePhoneNumber,
} from "react-phone-number-input/input";
import { FieldError } from "./field";
import { Input } from "./input";

type UsPhoneInputProps = {
  id: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  describedBy?: string;
};

export function UsPhoneInput({
  id,
  name = "phone",
  value,
  defaultValue = "",
  onChange,
  required = false,
  disabled = false,
  error,
  describedBy,
}: UsPhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [hasBlurred, setHasBlurred] = useState(false);
  const phoneValue = value ?? internalValue;
  const validationError =
    !phoneValue && required
      ? "Ingresa un teléfono de contacto."
      : phoneValue &&
          (!isValidPhoneNumber(phoneValue) ||
            parsePhoneNumber(phoneValue)?.country !== "US")
        ? "Ingresa un teléfono válido de Estados Unidos (+1)."
        : undefined;
  const message = error || (hasBlurred ? validationError : undefined);

  useEffect(() => {
    inputRef.current?.setCustomValidity(validationError ?? "");
  }, [validationError]);

  return (
    <>
      <input type="hidden" name={name} value={phoneValue} disabled={disabled} />
      <div className="relative">
        <span
          id={`${id}-country`}
          className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-sm text-muted-foreground"
        >
          <span className="sr-only">Estados Unidos, código de país </span>+1
        </span>
        <PhoneInput
          ref={inputRef}
          inputComponent={Input}
          id={id}
          country="US"
          international={false}
          value={phoneValue || undefined}
          onChange={(nextValue) => {
            const nextPhone = nextValue ?? "";
            if (value === undefined) setInternalValue(nextPhone);
            onChange?.(nextPhone);
          }}
          onBlur={() => setHasBlurred(true)}
          onInvalid={() => setHasBlurred(true)}
          autoComplete="tel-national"
          inputMode="tel"
          placeholder="(212) 555-0123"
          maxLength={14}
          required={required}
          disabled={disabled}
          className="h-11 pl-12"
          aria-invalid={Boolean(message)}
          aria-describedby={[
            `${id}-country`,
            describedBy,
            message ? `${id}-error` : undefined,
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </div>
      <FieldError id={`${id}-error`}>{message}</FieldError>
    </>
  );
}
