# Flujo de pedidos

Guía vigente actualizada el 2026-10-06. La [auditoría de cierre](develpment/development-completion-audit.md) conserva los requisitos originales; el [progreso](develpment/development-progress.md) y su matriz final registran F01–F12 cerrados para Stripe TEST/USD/manual. Esta actualización documental no ejecuta pedidos ni repite pruebas de navegador.

## Número de pedido

La tienda y los paneles de operador y vendedor muestran la misma referencia pública: `PED-` seguido del `display_id` nativo, con un mínimo de nueve dígitos (`196762` → `PED-000196762`). Si el pedido ya tiene `custom_display_id`, se conserva esa referencia. El formato se comparte en `packages/order-reference` y no depende de la dirección de envío ni renumera pedidos existentes.

Las búsquedas de los paneles aceptan la referencia visible o el número original. Los reportes financieros incluyen los campos de referencia del pedido sin modificar los cálculos; el vendedor recibe únicamente referencias de sus pedidos. Si falta el número público, la interfaz muestra «Sin número». El ID técnico `order_…` se conserva para enlaces, autorización y operaciones.

## Comprador

- `/account/orders`: tarjetas con productos reales, estado de pago, entrega y paginación.
- `/account/orders/:id`: productos, tienda, dirección, importes y seguimiento basado en el pedido y sus preparaciones nativas.
- `/account/orders/:id/invoice`: comprobante imprimible o guardable como PDF desde el navegador. No es una factura fiscal.

Las lecturas del detalle y comprobante usan el listado autenticado de pedidos con filtro por ID: el backend restringe el resultado al comprador. No se usa la recuperación pública de un pedido para autorizar estas páginas.

Las etapas sólo se completan cuando todos los artículos alcanzan el estado correspondiente. Cancelar una preparación no cancela el pedido. Las líneas de preparación pueden representar componentes de inventario de un kit; no se muestran sus cantidades como unidades compradas.

## Vendedor

El listado muestra únicamente Todos, Pendientes, Preparados, Enviados, Completados y Cancelados. Son grupos de presentación sobre los datos nativos; no se guardan estados nuevos:

| Grupo       | Datos nativos                                                                      |
| ----------- | ---------------------------------------------------------------------------------- |
| Pendientes  | Pedido pendiente sin preparaciones activas marcadas como preparadas o enviadas     |
| Preparados  | Pedido pendiente con alguna preparación activa (`packed_at`) y ningún envío activo |
| Enviados    | Pedido pendiente con algún envío o entrega activos (`shipped_at` o `delivered_at`) |
| Completados | `order.status = completed`                                                         |
| Cancelados  | `order.status = canceled`                                                          |

Las preparaciones canceladas no determinan el grupo. Los parciales permanecen dentro del grupo correspondiente y sus cantidades se consultan en el detalle. Los enlaces antiguos a pestañas parciales se traducen al grupo actual.

`GET /vendor/orders` admite el filtro adicional `fulfillment_stage=pending|prepared|shipped`, combinado con `status=pending`. Mercur 2.3.3 declara un filtro `fulfillment_status`, pero Medusa 2.18 calcula ese valor después de consultar los pedidos: no es una columna filtrable. La extensión consulta únicamente identificadores y relaciones nativas de preparaciones de la tienda, aplica el grupo a los IDs autorizados y conserva la búsqueda, la paginación y el recuento del listado nativo. No filtra una página ya descargada ni crea una nueva máquina de estados.

Las acciones vuelven a consultar el pedido dentro de la sesión del vendedor antes de ejecutar el flujo nativo:

| Acción                                | Endpoint POST bajo `/vendor/orders/:id`                      |
| ------------------------------------- | ------------------------------------------------------------ |
| Preparar cantidades pendientes        | `/fulfillments`                                              |
| Registrar envío y seguimiento         | `/fulfillments/:fulfillmentId/shipments`                     |
| Marcar entregado                      | `/fulfillments/:fulfillmentId/mark-as-delivered`             |
| Cancelar preparación no enviada       | `/fulfillments/:fulfillmentId/cancel`                        |
| Cancelar pedido elegible / reembolsar | `/finance` (flujo financiero local con validaciones backend) |
| Finalizar pedido elegible              | `/complete`                                                  |

Se permiten preparaciones parciales. Los artículos con y sin envío se preparan por separado. El backend valida que la ubicación de preparación pertenezca a la tienda. Las operaciones irreversibles exigen confirmación; el estado del servidor decide qué acciones siguen disponibles.

Para completar, todas las cantidades deben estar preparadas y las de envío físico entregadas. La recogida en tienda permite completar las cantidades preparadas sin exigir un botón previo de entrega; los artículos sin envío también requieren preparación. Marcar una preparación como entregada completa automáticamente el pedido si todas sus cantidades ya cumplen esas condiciones. Si quedan pendientes, conserva el pedido abierto. La opción Cancelar pedido se oculta cuando está completado.

El cobro puede ser compartido por varios pedidos de un carrito. La cancelación y los reembolsos ahora pasan por el [flujo financiero por tienda](order-finance.md): sin captura se cancela sin inventar un refund; con captura se devuelve el saldo elegible de ese pedido. La ruta nativa directa `/cancel` no es una alternativa para evitar esa asignación. El vendedor puede cancelar/reembolsar cuando el backend lo permite; solo el operador puede capturar la compra compartida. No se añade emisión fiscal.

## Operador y estados financieros

`/dashboard/orders/[id]` ofrece el detalle del pedido y su sección Finanzas, incluida la captura ajustada de la compra, cancelaciones e importes de reembolso. El listado y el detalle utilizan información real del backend. Completar la logística de un pedido no acredita que su pago esté capturado o su vendedor liquidado: consultar las asignaciones y movimientos financieros, no deducirlos de `order.status`.

Los dashboards admin/vendor y el desglose por venta de F09 están implementados,
con snapshots, movimientos conciliados y costes desconocidos explícitos. F04
incluye protección de `order-edits`; escritores nuevos o SQL externo requieren
revisión independiente. La extensión automática registra el reloj de finalización
observado por servidor y conserva el plazo configurado al finalizar: entre 0 y
365 días, con valor inicial de 3 días. Los relojes existentes no cambian al editar
la configuración. La transferencia vuelve a validar su elegibilidad al vencer.
Finalizar no captura por sí solo el pago ni asegura elegibilidad; consultar
[el flujo financiero](order-finance.md).

## Correo al enviar

El evento nativo `FulfillmentWorkflowEvents.SHIPMENT_CREATED` ejecuta `sendShipmentNotificationWorkflow`. Usa el correo del pedido, su enlace privado de seguimiento y los números de seguimiento existentes. El [seguimiento privado](order-tracking.md) permite consultar el estado sin iniciar sesión. No envía para preparaciones canceladas, no enviadas, sin envío físico o con notificaciones suprimidas.

Reutiliza la configuración existente: `AUTH_EMAIL_ENABLED=true`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (alternativamente `AUTH_EMAIL_FROM`) y `STOREFRONT_URL`. Los valores secretos permanecen fuera del repositorio. Cada preparación tiene una clave de idempotencia para evitar duplicados al reintentar. El worker y el proveedor de correo deben estar operativos.

## Verificación

Las verificaciones históricas cubrieron autorización, cantidades y estados inválidos, preparaciones parciales, seguimiento seguro, kits, cancelación, correo y filtros. Los tests unitarios se retiraron el 2026-10-03; las integraciones aisladas se conservan. El alcance y los límites de cierre están en la [matriz F01–F12](develpment/evidence/development-closure-20261003.md); se conserva también la [QA financiera](reports/qa-order-finance-2026-09-12.md).

F12 conserva su cierre histórico. La liberación inmediata pasó una [prueba integral aislada](develpment/evidence/immediate-release-e2e-20261006.md). El pedido original TEST #16 conserva su plazo de 72 horas reales y la comprobación posterior al vencimiento sigue pausada por el cambio de entorno. Esa prueba no se sustituye por la QA inmediata ni por relojes adelantados; consultar [Development Progress](develpment/development-progress.md) antes de retomarla.
