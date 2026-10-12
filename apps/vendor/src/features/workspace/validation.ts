export function textField(
  form: FormData,
  key: string,
  required = false,
  max = 500,
) {
  const entry = form.get(key);
  if (entry !== null && typeof entry !== "string")
    throw new Error("El formulario contiene un archivo no permitido.");
  const value = (entry ?? "").trim();
  if ((required && !value) || value.length > max)
    throw new Error(`Revisa el campo ${key}.`);
  return value;
}

export function resourceId(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw new Error("El identificador no es válido.");
  return value;
}

export function stockQuantity(value: string) {
  if (!/^\d+$/.test(value))
    throw new Error("Indica una cantidad entera igual o mayor a cero.");
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity))
    throw new Error("La cantidad es demasiado grande.");
  return quantity;
}

export function emailField(form: FormData) {
  const email = textField(form, "email", true, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Ingresa un correo válido.");
  return email;
}

export function websiteField(form: FormData) {
  const value = textField(form, "website_url");
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error();
    return url.toString();
  } catch {
    throw new Error("Ingresa una dirección web http o https válida.");
  }
}
