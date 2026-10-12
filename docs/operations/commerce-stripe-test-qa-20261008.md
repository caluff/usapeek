# QA de comercio con Stripe TEST — 2026-10-08

La verificación recorrió compras reales de prueba, cancelaciones, logística, devoluciones y reembolsos sobre Mercur 2.3.3 / Medusa 2.18.0. Se crearon **13 pedidos, 7 PaymentIntents TEST y 3 productos con 12 variantes en 3 tiendas**. Los **34 controles HTTP negativos** pasaron; las **12 variantes** cuadraron en stock y reservas con los movimientos nativos comprobados.

Run: `2b3a3ced0d7e4a12a744ad1579b00b8f` (`qa-0810`). Importes en USD. Esta evidencia corresponde al desarrollo local y a datos QA identificados; no certifica pagos LIVE ni producción.

## Entorno y método

- Base existente `marketplace_local`, PostgreSQL `localhost:5432` y Redis `localhost:6379/1`. Esta ejecución no utilizó una base desechable ni reinició los datos compartidos.
- Storefront [localhost:3000](http://localhost:3000), admin [localhost:7000](http://localhost:7000/dashboard/orders), vendor [localhost:7001](http://localhost:7001). API `localhost:9000`.
- Autenticación nativa de comprador, administrador y miembro vendedor QA. Compras por navegador y por SDK nativo: carrito, ofertas, envío, colección/sesión de pago, confirmación Stripe TEST y finalización de carrito. No se fabricaron pedidos mediante escrituras directas.
- TIENDA DE PRUEBA, Estilo Urbano y Nova Hogar: un producto QA por tienda y cuatro variantes, con stock inicial `40 / 2 / 40 / 0`. El primer producto se creó y publicó desde la interfaz de vendor; los otros dos mediante el flujo nativo.
- La auditoría independiente de inventario/finanzas tomó un snapshot de base a las **05:30:16 UTC**; las lecturas de API y Stripe posteriores no forman una transacción distribuida. Se añadieron después la verificación del worker de webhook (**05:34:54 UTC**), la liberación pickup (**05:36:20 UTC**) y la finalización nativa de PED5 con liberación de importe cero (**05:37:54 UTC**).
- Correos deshabilitados y jobs generales Stripe deshabilitados en el entorno. Se observó el workflow automático después de completar Nova y el scanner existente procesó el retiro tras la corrección, conservando su finalización y reloj originales. No se esperaron plazos de liberación de varios días.

## Catálogo creado

Los tres productos publicados permanecen disponibles para buscarlos por nombre en el catálogo. Cada uno tiene cuatro variantes, incluyendo una agotada y otra con stock inicial de dos unidades.

| Tienda | Producto | Handle |
| --- | --- | --- |
| TIENDA DE PRUEBA | QA 0810 · Organizador modular | `qa-0810-organizador-modular` |
| Estilo Urbano | QA0810 Bolso urbano | `qa0810-estilo-urbano-bolso-urbano-20261008` |
| Nova Hogar | QA0810 Estante modular | `qa0810-nova-hogar-estante-modular-20261008` |

## Pedidos para revisar

Cada enlace abre el pedido en el admin local y requiere una sesión autorizada. «Importe» es la asignación original de la compra a esa tienda; «Cobrado» y «Reembolsado» son importes monetarios registrados, independientes del total logístico que Medusa recalcula tras una devolución.

| Pedido | Tienda | Importe | Cobrado | Reembolsado | Resultado observado |
| --- | --- | ---: | ---: | ---: | --- |
| [PED1](http://localhost:7000/dashboard/orders/order_01M4CY316X32CB9CC2Q0E2WHGZ) | TIENDA DE PRUEBA | 32,35 | 0,00 | 0,00 | Cancelado antes de preparar; autorización y reserva liberadas. |
| [PED2](http://localhost:7000/dashboard/orders/order_01M4CYCNEA49ZQ1MAAKT5QNJFY) | Estilo Urbano | 25,70 | 0,00 | 0,00 | Cancelado dentro de una compra de dos tiendas; solo Nova se cobró. |
| [PED3](http://localhost:7000/dashboard/orders/order_01M4CYCNEAAR62VVY25T501VW7) | Nova Hogar | 17,80 | 17,80 | 17,80 | Reembolso parcial 1,00; cancelación devolvió los 16,80 restantes. Reintentos sin duplicar dinero. |
| [PED4](http://localhost:7000/dashboard/orders/order_01M4CYGPTCC0MK492AP5X4EA9Z) | TIENDA DE PRUEBA | 32,35 | 32,35 | 0,00 | Entregado, pendiente de completar; comparte compra con PED5/PED6. |
| [PED5](http://localhost:7000/dashboard/orders/order_01M4CYGPTD9ZYE803KS6Y3EDQG) | Estilo Urbano | 68,60 | 68,60 | 68,60 | Devolución de 3 unidades en dos tandas: 2 buenas y 1 dañada. Reembolso completo, incluido envío; completado nativamente y liberación automática resuelta en cero, sin transferencia. |
| [PED6](http://localhost:7000/dashboard/orders/order_01M4CYGPTD6HE09MC780S1MM1V) | Nova Hogar | 17,80 | 17,80 | 1,00 | Completado; liberación automática TEST 16,63. Reembolso posterior revierte 0,93 de la transferencia y devuelve 0,07 de comisión. |
| [PED7](http://localhost:7000/dashboard/orders/order_01M4CYXYV033DRHMW10VRA4GXK) | TIENDA DE PRUEBA | 12,35 | 12,35 | 0,00 | Compra por navegador y retiro completado. Liberación automática TEST 11,36; comisión 0,99. |
| [PED8](http://localhost:7000/dashboard/orders/order_01M4CYXYV0TJKRKX9JDRT358Y5) | Estilo Urbano | 24,20 | 24,20 | 0,00 | Enviado/entregado; solicitud descartada conserva historial y UUID. Nueva solicitud aprobada y luego cancelada sin recepción, reposición ni reembolso. |
| [PED9](http://localhost:7000/dashboard/orders/order_01M4CYXYV06H4CG81QFSQX582Y) | Nova Hogar | 15,50 | 15,50 | 15,50 | Reembolso completo seguido de cancelación logística con saldo cero; sin otro reembolso. |
| [PED10](http://localhost:7000/dashboard/orders/order_01M4CZAYXR60AKVCGT6244EHBT) | Nova Hogar | 17,80 | 0,00 | 0,00 | Tarjeta rechazada; Visa válida reintenta el mismo carrito/PI. Compra completada y cancelada por su comprador; autorización liberada. |
| [PED11](http://localhost:7000/dashboard/orders/order_01M4CZMBK3QB83C5XQG93SFBZW) | Nova Hogar | 15,50 | 0,00 | 0,00 | Desafío 3DS fallido y luego autenticado desde navegador. Pedido pendiente; 15,50 autorizados, todavía sin capturar. |
| [PED12](http://localhost:7000/dashboard/orders/order_01M4CZNNH9ECS811QDCCA6CV6M) | Estilo Urbano | 25,70 | 0,00 | 0,00 | Cancelación concurrente con PED13; ambas tiendas canceladas y reservas liberadas. |
| [PED13](http://localhost:7000/dashboard/orders/order_01M4CZNNH9GB76QH4S2PD4GDF8) | Nova Hogar | 17,80 | 0,00 | 0,00 | La petición concurrente devolvió `409`; su reintento completó la cancelación y el PI terminó cancelado sin capturar. |

Los pedidos completados o cancelados conservan ese estado en Medusa. Un reembolso completo no cambia por sí solo el estado logístico; PED5 se completó mediante su operación nativa posterior. Los pedidos QA permanecen disponibles para inspección; esta ejecución no declara una limpieza completa.

### Correlación con Stripe TEST

| Pedidos | PaymentIntent | Estado comprobado | Capturado | Autorización restante |
| --- | --- | --- | ---: | ---: |
| PED1 | `pi_3UO9QULYDSAMFoVr0DCiEjij` | `canceled` | 0,00 | 0,00 |
| PED2–3 | `pi_3UO9VaLYDSAMFoVr0c1DjFxs` | `succeeded` | 17,80 | 0,00 |
| PED4–6 | `pi_3UO9XiLYDSAMFoVr0x9DMFcn` | `succeeded` | 118,75 | 0,00 |
| PED7–9 | `pi_3UO9dsLYDSAMFoVr0o5fS5Aa` | `succeeded` | 52,05 | 0,00 |
| PED10 | `pi_3UO9lXLYDSAMFoVr19J2GaGh` | `canceled` | 0,00 | 0,00 |
| PED11 | `pi_3UO9oZLYDSAMFoVr1CYawIo2` | `requires_capture` | 0,00 | 15,50 |
| PED12–13 | `pi_3UO9rFLYDSAMFoVr1ctrklAV` | `canceled` | 0,00 | 0,00 |

La autorización liberada antes de cobrar no se contabiliza como un reembolso de dinero cobrado. La auditoría contrastó `amount_received`, capturas nativas e historial financiero; no sumó indiscriminadamente los registros de reversión de autorizaciones de Stripe como reembolsos monetarios.

## Cobertura comprobada

| Área | Casos y resultado |
| --- | --- |
| Catálogo e interfaz | Creación/publicación, subida de imagen, cuatro variantes persistidas, precio al cambiar variante y variante agotada con controles de compra deshabilitados. |
| Compra | Compra multitienda desde navegador; compras por SDK con ofertas, inventario, precios y finalización nativos. Un pago compartido se atribuye a los pedidos por tienda. |
| Cancelación antes del cobro | Pedido individual y una tienda de un grupo. Al cancelar dos tiendas concurrentemente, una petición completó y la otra recibió `409`; el reintento con su UUID original completó la segunda. Stripe y reservas terminan liberados sin captura. |
| Captura | La compra de PED2/PED3 cobró solo 17,80 de Nova tras cancelar Estilo. La compra de tres tiendas cobró 118,75 al preparar todos los pedidos activos. Capturas nativas y proveedor coinciden en los siete PI. |
| Rechazo y reintento | Rechazo real `card_declined` / `generic_decline`; ningún pedido nuevo ni carrito completado tras el rechazo. Visa válida usa el mismo carrito y PI; cancelación posterior del comprador deja recibido/capturable en cero. |
| 3DS en navegador | Desafío visible, fallo con `payment_intent_authentication_failure`, luego resultado `authenticated` y pedido PED11 creado. El éxito de autenticación dejó `requires_capture`; no se presenta como dinero cobrado. |
| Logística | Preparación, envío y entrega; cancelación de preparación antes de cancelar pedido; retiro en tienda completado sin simular envío ni entrega. |
| Devolución física | PED5: aprobación con almacén, recepción parcial de una unidad buena y segunda recepción de una buena + una dañada. Estado `partially_received` → `received`; solo dos unidades vuelven a stock vendible. Reembolso bloqueado mientras la devolución está abierta y habilitado tras recibirla. |
| Solicitudes del comprador | PED8: descarte del borrador, repetición del UUID descartado, nueva solicitud con UUID distinto, aprobación con destino y cancelación antes de recibir. Historial cancelado conservado, sin doble devolución ni cambios monetarios/de stock. |
| Reembolsos | PED3 parcial + cancelación del saldo; PED5 completo tras devolución; PED9 completo + cancelación con saldo cero; PED6 parcial tras transferencia. UUID repetidos no añaden dinero; los pedidos hermanos quedan intactos en los casos que lo verifican. |
| Liberación y reversión | PED6: workflow automático después de completar nativamente, payout vinculado y transferencia TEST 16,63. Refund 1,00: reversión Stripe 0,93 y comisión retornada 0,07; otros reembolsos sin cambios. PED7: scanner existente procesa el retiro elegible y crea una única transferencia TEST 11,36, conservando reloj y contadores. PED5 completado y totalmente reembolsado: `no_transfer_required`, importe cero y sin payout/transferencia. Son transferencias Connect TEST, no abonos bancarios reales. |
| Inventario y reservas | 12/12 variantes: stock coincide con preparaciones/cancelaciones/recepciones buenas; niveles de reservas coinciden con el ledger. Ningún pedido cancelado conserva reserva; las reservas activas pertenecen a los pedidos QA descubiertos. |
| Webhook local y worker | Evento real Stripe TEST `evt_3UO9VaLYDSAMFoVr0qQHm7Dk`, replay firmado válido dos veces y replay con firma inválida. HTTP nativo encola y responde 200 antes de verificar firma: el worker rechazó el inválido tras tres intentos y completó los dos válidos. Historial e importes intactos, una sola captura nativa. |

### Controles HTTP negativos: 34/34

- Sesiones nativas positivas de los tres actores; comprador y anónimo rechazados al entrar a endpoints admin/vendor (`401`).
- Vendor QA rechazado al seleccionar TIENDA DE PRUEBA sin membresía (`400`, contrato nativo Mercur). La expectativa inicial de `403` se corrigió con evidencia del contrato instalado; no se concedió acceso.
- Pedidos inexistentes y sus rutas cancellation/returns devuelven `404`; rutas protegidas sin sesión devuelven `401`. Lectura/escritura anónima del carrito QA propio devuelve `404`.
- Cantidades cero, negativas, fraccionarias, 100 unidades por encima del stock y oferta agotada rechazadas (`400`).
- `variant_id` manipulado, variante sin oferta y precios enviados por el cliente (`unit_price`, precio personalizado y precio bruto) rechazados (`400`). También se rechazaron precio/cantidad adulterados al actualizar y precio adulterado en el carrito inicial.
- Los rechazos conservaron el carrito vacío o la línea válida previa: cantidad 1 y precio nativo 12,35. Hubo un carrito QA nuevo; el segundo intento con precio manipulado falló antes de crear otro. Esta batería no efectuó checkout ni operaciones Stripe.

## Defectos encontrados y corregidos durante la QA

| Defecto | Corrección y evidencia posterior |
| --- | --- |
| Un enlace a payout sin entidad relacionada bloqueaba cancelaciones de nuevos pedidos de TIENDA DE PRUEBA. | La lectura financiera excluye únicamente payout `null`/`undefined`. PED1 pudo cancelar su autorización y liberar reservas; los payouts reales conservan sus controles. |
| La preparación enviada por la interfaz incluía `shipping_option_id`, rechazado por el validador nativo con `400`. | Compatibilidad del validador instalada mediante patch y guard del workflow: la opción debe pertenecer a la compra y al almacén autorizado. Preparaciones reales posteriores pasaron con el flujo nativo. |
| Tras devolver parcialmente, storefront presentaba el total logístico como «Total pagado» y mostraba cantidad/importe de línea incoherentes. | Se separaron total actual, cobrado, reembolsado y cobrado neto usando el resumen monetario nativo. Cantidad actual descuenta recibidos y descartados; comprados/devueltos se muestran aparte. Cuenta, detalle y factura comparten el helper. [Captura corregida](C:/Users/dcalu/.codex/tmp/commerce-qa-20261008/buyer-return-refund-fixed.jpg). |
| Retiro completado no resultaba elegible para liberación porque no tiene `shipped_at`/`delivered_at`. | Se reutiliza la prueba nativa de finalización pickup. PED7 mantiene shipped/delivered en cero, conserva su reloj y alcanza payout automático `paid` de 11,36 TEST, sin cambiar flags para forzarlo. |

La liberación pickup quedó cerrada a las **05:36:20 UTC**: payout `pout_01M4D042H4Q90EN61B2KNDTNVC`, transferencia `tr_3UO9dsLYDSAMFoVr0s6UM6z3`. Nova PED6: payout `pout_01M4CZKK5H3FZY8AN5T225XTB8`, transferencia `tr_3UO9XiLYDSAMFoVr0hptDXRF`, reversión `trr_1UO9taLYDSAMFoVrUzHpNInJ`.

## Comprobaciones de código ejecutadas

Estos checks acompañan a las correcciones; no sustituyen la evidencia real de pagos y persistencia anterior.

- Storefront: helper de importes **5/5**, suite `test:orders` **45/45**, lint y typecheck aprobados; `git diff --check` del alcance aprobado.
- Corrección pickup/API: **68** pruebas de elegibilidad y **4** de payout (**72** en total), lint, typecheck y build API aprobados después de la corrección. `pnpm peers check` aprobado para el patch nativo.
- No se ejecutó una suite Stripe adicional como gate incidental. La evidencia Stripe de este informe corresponde a las operaciones QA explícitamente autorizadas.

## Límites y estado pendiente

- **Entrega externa de webhooks Stripe NO probada.** Se reprodujo localmente un evento real con firma y se comprobó el worker. No se certifican endpoint público, red, configuración del Dashboard ni reintentos originados por Stripe. Los hashes de jobs exitosos se eliminan; la correlación posterior utiliza la secuencia local invalid/valid1/valid2 y sus IDs en el stream nativo.
- **Sin LIVE, tarjetas reales ni producción.** Connect y transferencias son TEST; no se verificaron desembolsos bancarios, onboarding/KYC de personas reales, reservas del proveedor, disputas ni recuperación operativa en producción.
- Impuestos del escenario: **0**. Sin cobertura de fiscalidad compleja, descuentos/prorrateos complejos, múltiples monedas ni múltiples métodos de pago.
- Sin cobertura de exchanges/reemplazos, reclamaciones de pedido no recibido, disputas/chargebacks, cancelación automática por plazo ni transporte físico real de las devoluciones. Las recepciones representan mercancía QA registrada por el operador.
- No se provisionó un segundo comprador para esta batería manual: el acceso cruzado entre dos compradores reales no se prueba aquí. Sí se comprobó falta de autenticación, recursos inexistentes y membresía vendor ajena.
- No se probó envío/entrega real de correos ni se esperaron demoras de liberación de varios días. La cobertura del scanner y de las reacciones automáticas se limita a los casos indicados.
- PED11 conserva **15,50 autorizados sin captura**. PED4/PED8 continúan abiertos en sus estados logísticos respectivos. Los productos, cuentas y pedidos QA permanecen en desarrollo para revisión; no se declara eliminación de todos los objetos locales o Stripe.

## Evidencia conservada

Directorio externo de esta ejecución: `C:/Users/dcalu/.codex/tmp/commerce-qa-20261008/`. Los JSON son evidencia temporal local; no se incorporaron sus payloads completos al repositorio. Este informe no contiene contraseñas, tokens, firmas de webhook, claves ni `client_secret`.

| Evidencia | Archivo |
| --- | --- |
| Auditoría independiente: siete PI, trece pedidos, stock/reservas 12/12 | `verify-inventory-finance.json` |
| Controles negativos y conservación del carrito | `negative-http-evidence.json` |
| Rechazo/reintento sobre el mismo PI y cancelación propia | `payment-negative-decline-retry-evidence.json` |
| Resultado real del desafío 3DS | `browser-3ds-failed.json`, `browser-3ds-success.json` |
| Cancelación de ambas tiendas concurrentemente | `case-all-cancel.json` |
| Devolución parcial, recepción buena/dañada y reembolso | `case-physical-return.json`, `return-refund-evidence.json` |
| Borrador descartado/repetido y devolución aprobada cancelada | `case-browser-return-cancellations.json` |
| Refund parcial + cancelación; refund total + cancelación sin dinero | `case-partial-refund-cancel.json`, `case-full-refund-cancel-zero.json` |
| Nova: liberación automática y reversión de transferencia | `case-nova-manual-release.json` (el nombre del archivo conserva la intención inicial; `execution_source` registra el workflow automático realmente observado) |
| Pickup: antes/después de la elegibilidad, única transferencia y reloj/contadores conservados | `pickup-release-before.json`, `pickup-release-after.json`, `pickup-release-verification.json` |
| Estilo totalmente reembolsado: finalización y liberación automática sin transferencia | `estilo-zero-release.json` |
| Replay de webhook y durabilidad del worker | `webhook-replay.json`, `webhook-durability.json` |

Capturas locales:

- [Carrito multitienda](C:/Users/dcalu/.codex/tmp/commerce-qa-20261008/multivendor-cart.jpg) y [compra desde navegador](C:/Users/dcalu/.codex/tmp/commerce-qa-20261008/browser-purchase.jpg).
- [Cancelación por comprador](C:/Users/dcalu/.codex/tmp/commerce-qa-20261008/buyer-cancellation.jpg) y [retiro completado](C:/Users/dcalu/.codex/tmp/commerce-qa-20261008/pickup-completed.jpg).
- [Recepción parcial](C:/Users/dcalu/.codex/tmp/commerce-qa-20261008/return-partial.jpg), [reembolso admin](C:/Users/dcalu/.codex/tmp/commerce-qa-20261008/return-refund-admin.jpg) y [importes corregidos en cuenta](C:/Users/dcalu/.codex/tmp/commerce-qa-20261008/buyer-return-refund-fixed.jpg).
- [Desafío 3DS](C:/Users/dcalu/.codex/tmp/commerce-qa-20261008/stripe-3ds-challenge.jpg), [fallo](C:/Users/dcalu/.codex/tmp/commerce-qa-20261008/stripe-3ds-failed.jpg) y [autenticación completada](C:/Users/dcalu/.codex/tmp/commerce-qa-20261008/stripe-3ds-success.jpg).
- [Pedido devuelto, reembolsado y completado](C:/Users/dcalu/.codex/tmp/commerce-qa-20261008/return-completed-admin.jpg).
