export function vendorSessionCallbackUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? "")
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null
    return new URL("/auth/storefront", url.origin).toString()
  } catch { return null }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!)
}

export function vendorSessionDocument(callback: string, code: string, nonce: string) {
  if (!/^[a-f0-9]{64}$/.test(code) || !/^[a-f0-9]{32}$/.test(nonce)) throw new Error("invalid_vendor_session")
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abriendo tu tienda</title></head><body><p>Abriendo tu tienda…</p><form method="post" action="${escapeHtml(callback)}"><input type="hidden" name="code" value="${code}"><noscript><button type="submit">Continuar a mi tienda</button></noscript></form><script nonce="${nonce}">document.forms[0].submit()</script></body></html>`
}
