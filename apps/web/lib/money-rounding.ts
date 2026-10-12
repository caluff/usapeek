export function getMoneyRoundingAdjustment({
  amounts,
  total,
  currency,
}: {
  amounts: readonly number[]
  total: number
  currency: string
}) {
  if (![...amounts, total].every(Number.isFinite)) return 0

  let formatter: Intl.NumberFormat
  try {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      useGrouping: false,
    })
  } catch {
    return 0
  }

  // Use the same currency precision and decimal rounding as the visible amounts.
  const toMinorUnits = (amount: number) => {
    const parts = formatter.formatToParts(amount)
    const digits = parts
      .filter(({ type }) => type === "integer" || type === "fraction")
      .map(({ value }) => value)
      .join("")
    return Number(digits) * (amount < 0 ? -1 : 1)
  }
  const roundedTotal = toMinorUnits(total)
  const unroundedSum = amounts.reduce((sum, amount) => sum + amount, 0)
  // A missing charge or credit is not a rounding adjustment.
  if (toMinorUnits(unroundedSum) !== roundedTotal) return 0

  const roundedAmounts = amounts.map(toMinorUnits)
  if (![...roundedAmounts, roundedTotal].every(Number.isSafeInteger)) return 0
  const roundedSum = roundedAmounts.reduce((sum, amount) => sum + amount, 0)
  if (!Number.isSafeInteger(roundedSum)) return 0
  const adjustment = roundedTotal - roundedSum
  const precision = formatter.resolvedOptions().maximumFractionDigits
  if (precision === undefined) return 0
  return adjustment === 0 ? 0 : adjustment / 10 ** precision
}
