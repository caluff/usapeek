export function usdAmount(value: string) {
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(value))
    throw new Error("Introduce un precio USD válido con hasta dos decimales.");
  return Number(value);
}
