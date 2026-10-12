import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";

export function ProductPriceField({
  value,
  onChange,
  name,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  compact?: boolean;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel className={compact ? "sr-only" : undefined} htmlFor={id}>
        Precio de venta (USD) *
      </FieldLabel>
      <Input
        id={id}
        name={name}
        required
        type="number"
        inputMode="decimal"
        min={0}
        max={999999999.99}
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-28"
      />
    </Field>
  );
}

export function ProductStockField({
  value,
  onChange,
  name,
  minimum = 0,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  minimum?: number;
  compact?: boolean;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel className={compact ? "sr-only" : undefined} htmlFor={id}>
        Existencias *
      </FieldLabel>
      <Input
        id={id}
        name={name}
        required
        type="number"
        inputMode="numeric"
        min={minimum}
        max={Number.MAX_SAFE_INTEGER}
        step={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-24"
      />
    </Field>
  );
}
