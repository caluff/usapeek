import { randomUUID } from "node:crypto";

export function createMasterSku(reference: string) {
  const prefix = reference
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `${prefix || "VARIANTE"}-${randomUUID().slice(0, 8).toUpperCase()}`;
}
