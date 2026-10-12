const money = new Intl.NumberFormat("es-UY", {
  style: "currency",
  currency: "USD",
});

export function formatReportMoney(value: number | null) {
  return value === null ? "—" : money.format(value);
}
