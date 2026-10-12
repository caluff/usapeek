"use client";

import type { StoreSearchProductsResponse } from "@usapeek/api/search-contracts";
import { ChevronDown, LoaderCircle, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useId,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import {
  clearSearchFilters,
  parseSearchParameters,
  SEARCH_SORT_OPTIONS,
  searchHref,
  type SearchParameters,
} from "../parameters";
import { getPriceSliderBounds, getPriceSliderValue } from "../price-range";

type FilterProps = {
  parameters: SearchParameters;
  facets: StoreSearchProductsResponse["facets"];
  priceRange: StoreSearchProductsResponse["price_range"];
};

const PRICE_FORMATTER = new Intl.NumberFormat("es-UY", {
  maximumFractionDigits: 2,
});

function usePriceSliderRange({ parameters, priceRange }: FilterProps) {
  const scope = JSON.stringify([
    parameters.q,
    parameters.categoryIds,
    parameters.sellerIds,
  ]);
  const [cached, setCached] = useState({ scope, priceRange });
  const hasPriceFilter =
    parameters.minPrice !== undefined || parameters.maxPrice !== undefined;
  if (
    cached.scope !== scope ||
    (!hasPriceFilter &&
      (cached.priceRange?.min !== priceRange?.min ||
        cached.priceRange?.max !== priceRange?.max))
  ) {
    setCached({ scope, priceRange });
    return priceRange;
  }
  // Applying a price must leave enough slider range to widen it again.
  return cached.priceRange;
}

function PriceRangeFields({
  id,
  parameters,
  priceRange,
  onCommit,
}: Pick<FilterProps, "parameters" | "priceRange"> & {
  id: string;
  onCommit: (minimum: string, maximum: string) => void;
}) {
  const priceKey = JSON.stringify([parameters.minPrice, parameters.maxPrice]);
  const [inputs, setInputs] = useState({
    priceKey,
    minimumPrice: parameters.minPrice?.toString() ?? "",
    maximumPrice: parameters.maxPrice?.toString() ?? "",
  });
  if (inputs.priceKey !== priceKey) {
    setInputs({
      priceKey,
      minimumPrice: parameters.minPrice?.toString() ?? "",
      maximumPrice: parameters.maxPrice?.toString() ?? "",
    });
  }
  const { minimumPrice, maximumPrice } = inputs;
  const bounds = getPriceSliderBounds(
    priceRange,
    parameters.minPrice,
    parameters.maxPrice,
  );
  const sliderValue = bounds
    ? getPriceSliderValue(minimumPrice, maximumPrice, bounds)
    : null;

  function pricesFromSlider(values: number[]) {
    if (values.length < 2 || !bounds) return;
    return [
      values[0] <= bounds.min ? "" : Number(values[0].toFixed(2)).toString(),
      values[1] >= bounds.max ? "" : Number(values[1].toFixed(2)).toString(),
    ] as const;
  }

  function updateFromSlider(values: number[]) {
    const prices = pricesFromSlider(values);
    if (!prices) return;
    setInputs({ priceKey, minimumPrice: prices[0], maximumPrice: prices[1] });
  }

  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <>
      {bounds && sliderValue ? (
        <div className="clear-both mb-4 space-y-2">
          <output
            className="block text-center text-xs tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {PRICE_FORMATTER.format(sliderValue[0])} –{" "}
            {PRICE_FORMATTER.format(sliderValue[1])} USD
          </output>
          <Slider
            value={sliderValue}
            min={bounds.min}
            max={bounds.max}
            step={0.01}
            minStepsBetweenThumbs={0}
            onValueChange={updateFromSlider}
            onValueCommit={(values) => {
              const prices = pricesFromSlider(values);
              if (prices) onCommit(...prices);
            }}
            thumbLabels={["Precio mínimo", "Precio máximo"]}
            className="min-h-11 lg:min-h-8"
          />
        </div>
      ) : null}
      <div className="clear-both grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label
            htmlFor={`${id}-min`}
            className="text-xs text-muted-foreground lg:text-[0.68rem]"
          >
            Desde
          </label>
          <Input
            id={`${id}-min`}
            name="min_price"
            type="number"
            min="0"
            max="1000000000"
            step="0.01"
            inputMode="decimal"
            placeholder="Mínimo"
            value={minimumPrice}
            onChange={(event) =>
              setInputs({ ...inputs, minimumPrice: event.target.value })
            }
            onKeyDown={submitOnEnter}
            onBlur={(event) => {
              if (event.currentTarget.form?.checkValidity())
                onCommit(minimumPrice, maximumPrice);
            }}
            className="h-11 px-3 text-sm lg:h-9"
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor={`${id}-max`}
            className="text-xs text-muted-foreground lg:text-[0.68rem]"
          >
            Hasta
          </label>
          <Input
            id={`${id}-max`}
            name="max_price"
            type="number"
            min="0"
            max="1000000000"
            step="0.01"
            inputMode="decimal"
            placeholder="Máximo"
            value={maximumPrice}
            onChange={(event) =>
              setInputs({ ...inputs, maximumPrice: event.target.value })
            }
            onKeyDown={submitOnEnter}
            onBlur={(event) => {
              if (event.currentTarget.form?.checkValidity())
                onCommit(minimumPrice, maximumPrice);
            }}
            className="h-11 px-3 text-sm lg:h-9"
          />
        </div>
      </div>
    </>
  );
}

function FacetFields({
  title,
  name,
  values,
  selected,
  onChange,
}: {
  title: string;
  name: string;
  values: StoreSearchProductsResponse["facets"]["categories"];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const options = [
    ...values,
    ...selected
      .filter((id) => !values.some((value) => value.id === id))
      .map((id) => ({ id, label: id, count: 0 })),
  ];
  if (!options.length) return null;
  return (
    <details open className="group border-b border-border py-3 last:border-b-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold lg:min-h-8 lg:text-xs [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          aria-hidden="true"
          className="size-4 transition-transform group-open:rotate-180"
        />
      </summary>
      <fieldset className="mt-1 max-h-52 space-y-0.5 overflow-y-auto">
        <legend className="sr-only">{title}</legend>
        {options.map((value) => (
          <label
            key={value.id}
            className="flex min-h-11 cursor-pointer items-center gap-2 text-sm lg:min-h-8 lg:text-xs"
          >
            <input
              type="checkbox"
              name={name}
              value={value.id}
              checked={selected.includes(value.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, value.id]
                    : selected.filter((id) => id !== value.id),
                )
              }
              className="size-4 shrink-0 accent-brand-accent lg:size-3.5"
            />
            <span className="min-w-0 flex-1 break-words">{value.label}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {value.count}
            </span>
          </label>
        ))}
      </fieldset>
    </details>
  );
}

function FilterForm({ parameters, facets, priceRange }: FilterProps) {
  const id = useId();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const parameterKey = searchHref(parameters);
  const [selection, setSelection] = useState({
    parameterKey,
    value: parameters,
  });
  if (selection.parameterKey !== parameterKey) {
    setSelection({ parameterKey, value: parameters });
  }
  const selectedParameters = selection.value;

  function apply(next: SearchParameters) {
    const normalized = { ...next, page: 1 };
    if (searchHref(normalized) === searchHref(selectedParameters)) return;
    setSelection({ parameterKey, value: normalized });
    startTransition(() => {
      router.push(searchHref(normalized), { scroll: false });
    });
  }

  function applyPrices(minimum: string, maximum: string) {
    const prices = parseSearchParameters({
      min_price: minimum,
      max_price: maximum,
    });
    apply({
      ...selectedParameters,
      minPrice: prices.minPrice,
      maxPrice: prices.maxPrice,
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    applyPrices(
      String(form.get("min_price") ?? ""),
      String(form.get("max_price") ?? ""),
    );
  }
  return (
    <form onSubmit={submit} aria-busy={isPending}>
      <ActiveSearchFilters
        parameters={selectedParameters}
        facets={facets}
        onChange={apply}
      />
      {isPending ? (
        <p
          role="status"
          className="flex items-center gap-2 py-2 text-xs text-muted-foreground"
        >
          <LoaderCircle
            className="size-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          Actualizando productos…
        </p>
      ) : null}
      <fieldset className="border-b border-border py-3">
        <legend className="float-left mb-3 w-full text-sm font-semibold lg:text-xs">
          Precio (USD)
        </legend>
        <PriceRangeFields
          id={id}
          parameters={selectedParameters}
          priceRange={priceRange}
          onCommit={applyPrices}
        />
      </fieldset>
      <FacetFields
        title="Categorías"
        name="category_id"
        values={facets.categories}
        selected={selectedParameters.categoryIds}
        onChange={(categoryIds) =>
          apply({ ...selectedParameters, categoryIds })
        }
      />
      <FacetFields
        title="Tiendas"
        name="seller_id"
        values={facets.sellers}
        selected={selectedParameters.sellerIds}
        onChange={(sellerIds) => apply({ ...selectedParameters, sellerIds })}
      />
    </form>
  );
}

export function SearchFilters(props: FilterProps) {
  const priceRange = usePriceSliderRange(props);
  return (
    <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:border lg:border-border lg:bg-muted/15 lg:p-3">
      <div className="flex min-h-8 items-center gap-2 border-b border-border pb-2">
        <SlidersHorizontal className="size-3.5" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Filtros</h2>
      </div>
      <FilterForm {...props} priceRange={priceRange} />
    </aside>
  );
}

export function MobileSearchFilters(props: FilterProps) {
  const priceRange = usePriceSliderRange(props);
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="lg:hidden">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filtros
        </Button>
      </DialogTrigger>
      <DialogContent
        className="top-0 left-0 h-dvh max-h-dvh w-[min(24rem,100vw)] max-w-none translate-x-0 translate-y-0 content-start gap-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        aria-describedby={undefined}
      >
        <DialogTitle>Filtrar productos</DialogTitle>
        <FilterForm {...props} priceRange={priceRange} />
      </DialogContent>
    </Dialog>
  );
}

export function SearchSortSelect({
  parameters,
}: Pick<FilterProps, "parameters">) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      {isPending ? (
        <LoaderCircle
          className="size-4 animate-spin"
          aria-label="Ordenando productos"
        />
      ) : null}
      <NativeSelect
        aria-label="Ordenar productos"
        value={parameters.sort}
        disabled={isPending}
        onChange={(event) => {
          const sort =
            SEARCH_SORT_OPTIONS.find(
              (option) => option.value === event.target.value,
            )?.value ?? "relevance";
          startTransition(() =>
            router.push(searchHref({ ...parameters, sort, page: 1 }), {
              scroll: false,
            }),
          );
        }}
      >
        {SEARCH_SORT_OPTIONS.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

function ActiveSearchFilters({
  parameters,
  facets,
  onChange,
}: Pick<FilterProps, "parameters" | "facets"> & {
  onChange: (parameters: SearchParameters) => void;
}) {
  const chips = [
    ...parameters.categoryIds.map((id) => ({
      key: `category-${id}`,
      label: facets.categories.find((facet) => facet.id === id)?.label ?? id,
      parameters: {
        ...parameters,
        categoryIds: parameters.categoryIds.filter((value) => value !== id),
        page: 1,
      },
    })),
    ...parameters.sellerIds.map((id) => ({
      key: `seller-${id}`,
      label: facets.sellers.find((facet) => facet.id === id)?.label ?? id,
      parameters: {
        ...parameters,
        sellerIds: parameters.sellerIds.filter((value) => value !== id),
        page: 1,
      },
    })),
    ...(parameters.minPrice !== undefined || parameters.maxPrice !== undefined
      ? [
          {
            key: "price",
            label:
              parameters.minPrice !== undefined &&
              parameters.maxPrice !== undefined
                ? `${PRICE_FORMATTER.format(parameters.minPrice)} – ${PRICE_FORMATTER.format(parameters.maxPrice)} USD`
                : parameters.minPrice !== undefined
                  ? `Desde ${PRICE_FORMATTER.format(parameters.minPrice)} USD`
                  : `Hasta ${PRICE_FORMATTER.format(parameters.maxPrice!)} USD`,
            parameters: {
              ...parameters,
              minPrice: undefined,
              maxPrice: undefined,
              page: 1,
            },
          },
        ]
      : []),
  ];
  if (!chips.length) return null;
  return (
    <section
      aria-label="Filtros activos"
      className="border-b border-border py-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">Filtros activos</h3>
        <button
          type="button"
          onClick={() => onChange(clearSearchFilters(parameters))}
          className="min-h-11 text-xs text-brand-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring lg:min-h-8"
        >
          Quitar todos
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => onChange(chip.parameters)}
            className="inline-flex min-h-11 max-w-full items-center gap-2 border border-border bg-muted/40 px-2 py-1 text-left text-xs transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-ring lg:min-h-8"
            aria-label={`Quitar filtro: ${chip.label}`}
          >
            <span className="min-w-0 break-words">{chip.label}</span>
            <X className="size-3.5 shrink-0" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
