# F10/F11 — verificación visual del 2026-09-22

Código: develop `aa88523`, que incluye `524c4de` (paginación nativa) y
`d4c2566` (desglose y redondeo). Se conservaron las modificaciones de UI
compartida del usuario. No se modificó código de aplicación durante esta prueba.

## Entorno y alcance

- Next.js real mediante `pnpm --dir apps/web exec next dev --hostname 127.0.0.1 --port 3108`.
- SDK configurado por variables de proceso hacia una API **simulada** en
  `127.0.0.1:9108`; clave publicable ficticia, Stripe deshabilitado.
- Fixture externo: `C:/Users/dcalu/.codex/tmp/marketplace-closure-20260919/f10-fixtures-root.mjs`.
  Los productos, carrito, pedidos y perfil de cuenta son ficticios. El perfil de
  cuenta usa una sesión simulada, por lo que esta prueba **no acredita autorización**.
- Navegador integrado mediante CUA; inspección de DOM, accesibilidad y capturas.
  Vista móvil de 390 × 844 y vista de escritorio. Se restauró el viewport.
- Sin escrituras PostgreSQL, operaciones de pago Stripe, correos ni cambios en
  `.env`. El componente cargó Stripe.js al mostrar checkout, pero no tenía
  proveedores de pago disponibles y no se inició ni confirmó un pago.

## Resultados comprobados

| Caso | Resultado visual |
| --- | --- |
| Categoría con 31 productos, todos sin oferta; búsqueda no disponible | Páginas 1, 2 y 3 muestran 1–12, 13–24 y 25–31. Producto 31 accesible y sin enlace siguiente al final. La categoría permanece en la URL. |
| Página 999 | Estado fuera de rango y enlace a página 3; navegación recuperada con la misma categoría. |
| Respuesta lenta de 5 segundos | En carga inicial, navegación, hero, título y pie visibles; solo grilla con «Cargando productos». Resuelve a 12 productos. |
| Error de catálogo 503 | Error local y botón Reintentar; tras restaurar fixture, conserva categoría y página 2, mostrando 13–24. |
| Categoría vacía | Estado vacío específico de categoría, sin paginación inventada. |
| Carrito, checkout, confirmación y detalle de cuenta | Productos 100, descuento neto 5, envío 0 e impuesto 9,50 suman 104,50. |
| Mismos cuatro resúmenes, importes fraccionarios | Filas visibles 9,09 − 0,95 + 0,81 + ajuste 0,01 = 8,96. Total de fixture conservado. |
| Móvil | Catálogo y comprobante visibles sin desbordamiento horizontal; comprobante: ancho de contenido 375 dentro de viewport 390. |
| Consola | Ningún error registrado. Advertencias de desarrollo sobre scroll suave y uso de Stripe.js sobre HTTP; no se confunden con pruebas de pago. |

Una espera automatizada para el producto durante la respuesta lenta agotó el
plazo del selector antes de los 5 segundos; se observó primero el estado de carga
y después su resolución. No fue un error de la aplicación.

## Límites

Esto verifica renderizado e interacción contra respuestas controladas, no el
circuito comercial de Medusa ni datos persistidos. Las pruebas web ejecutadas
en develop dieron 173 PASS, lint y tipos PASS antes de esta inspección. Las
pruebas de ownership reales pertenecen a F05 y la regresión de catálogo/checkout
con persistencia y Stripe TEST pertenece a F12. No se declara Financial Readiness
ni compra/pago real exitoso a partir de estas pantallas.
