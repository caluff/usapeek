const MAX_SEARCH_PRICE = 1_000_000_000

export type PriceSliderBounds = {
  min: number
  max: number
}

type SearchPriceRange = {
  min: number
  max: number
} | null

function isValidPrice(value: number | undefined): value is number {
  return Number.isFinite(value) && value !== undefined && value >= 0
}

export function getPriceSliderBounds(
  priceRange: SearchPriceRange,
  selectedMin?: number,
  selectedMax?: number,
): PriceSliderBounds | null {
  const candidates = [priceRange?.min, priceRange?.max, selectedMin, selectedMax]
    .filter(isValidPrice)
    .map((value) => Math.min(value, MAX_SEARCH_PRICE))

  if (candidates.length < 2) return null

  // A catalog with one price still needs a usable, stable price control.
  if (priceRange && isValidPrice(priceRange.min) && priceRange.min === priceRange.max) {
    candidates.push(0)
  }

  const min = Math.floor(Math.min(...candidates))
  const max = Math.ceil(Math.max(...candidates))

  return max > min ? { min, max } : null
}

function parsePriceInput(
  input: string,
  fallback: number,
  bounds: PriceSliderBounds,
) {
  if (!input.trim()) return fallback

  const value = Number(input)
  if (!isValidPrice(value)) return fallback

  return Math.min(bounds.max, Math.max(bounds.min, value))
}

export function getPriceSliderValue(
  minimumInput: string,
  maximumInput: string,
  bounds: PriceSliderBounds,
): [number, number] {
  const minimum = parsePriceInput(minimumInput, bounds.min, bounds)
  const maximum = parsePriceInput(maximumInput, bounds.max, bounds)

  return minimum <= maximum ? [minimum, maximum] : [maximum, minimum]
}
