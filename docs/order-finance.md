# Cancelaciones y reembolsos por tienda

Guía vigente actualizada el 2026-10-06. **F01–F12 / Phase 1–6 DONE**, con **Financial Readiness PASS para Stripe TEST, USD y operación manual**, según la [matriz final](develpment/evidence/development-closure-20261003.md). La [auditoría original](develpment/development-completion-audit.md) conserva sus hallazgos históricos; el [progreso](develpment/development-progress.md) registra su resolución. La liberación inmediata pasó una QA integral aislada; el circuito original del pedido TEST #16 a 72 horas reales sigue pendiente de comprobación y pausado por su cambio de entorno.

Implementación para Mercur 2.3.3 / Medusa 2.18.0. El alcance habilitado es Stripe de prueba, USD, un pago compartido con autorización sin captura, captura completa o captura final ajustada registrada por este flujo. Incluye liquidación operativa y reembolsos anteriores/posteriores a transferencias atribuibles y verificadas. La extensión automática conserva los controles de la vía manual y necesita configuración activa en el entorno que se va a operar. No habilita pagos reales; cambiar claves no implementa compatibilidad LIVE.

## Acceso

- Operador: **Pedidos → abrir pedido → Finanzas** (`/dashboard/orders/[id]`). Incluye **Cobrar compra**, además de cancelar y reembolsar.
- Vendedor: **Pedidos → abrir pedido → Finanzas** (`/seller/orders/[id]`). Solo puede cancelar/reembolsar pedidos de la tienda autorizada; no puede cobrar el pago compartido.
- Comprador: **Mis órdenes → Ver detalles → Ver comprobante**. El resumen y el comprobante muestran el reembolso registrado en ese pedido. El estado «Pago de la compra» corresponde al pago compartido de Mercur, no exclusivamente a esa tienda.

El formulario permite cancelar, reembolsar todo el saldo disponible o indicar un importe parcial. Exige motivo y confirmación. Muestra importe asignado, cobrado para esa tienda, reembolsado, saldo y un historial con resultado; cuando corresponde, detalla el neto recuperado del vendedor y la comisión devuelta. El desglose original de comisión/ganancias y transferencias/reversiones se consulta en el informe financiero de `/dashboard` o `/seller`, separado de esta sección operativa del pedido. La elegibilidad procede del backend, no de una lista de botones estática. Las lecturas financieras tienen su propia región de carga/error y no bloquean el detalle logístico.

## Flujo

1. Autenticar al actor; para vendedores, verificar pertenencia al pedido y permisos de Mercur.
2. Leer grupo, pedidos, pago del carrito, capturas, reembolsos, preparaciones, cambios pendientes y liquidaciones. Usar el snapshot original inmutable de la regla, base, comisión, derecho vendedor y reparto del pago compartido; conservar descuentos/envío calculados por Medusa. Ajustes posteriores no sobrescriben el original ni aplican la tasa vigente a ventas pasadas. Los históricos no reconstruibles permanecen explícitos para revisión.
3. Serializar operaciones por carrito y registrar de forma duradera la identidad de la solicitud antes de mover dinero.
4. Verificar en Stripe TEST que sus saldos coinciden con Medusa.
5. Ejecutar la operación nativa aplicable y registrar el resultado del pedido concreto.
6. Actualizar historial y refrescar las vistas. Una respuesta ambigua bloquea nuevas operaciones hasta conciliación; no reintenta automáticamente un movimiento de dinero.

### Cancelación

Medusa permite cancelar pedidos abiertos; antes deben cancelarse las preparaciones activas. Un pedido completado no se cancela: puede reembolsarse si cumple las condiciones financieras.

- Sin captura: cancelar el pedido sin emitir un reembolso ficticio. Conservar la autorización compartida si otra tienda sigue activa. Si todos los pedidos están cancelados, anular la autorización mediante el paso nativo y comprobarlo en Stripe.
- Con captura: reembolsar únicamente el saldo de ese pedido y ejecutar `cancelOrderWorkflow`, que conserva la validación, liberación de reservas y eventos nativos.
- Después de un reembolso total: cancelar el pedido abierto sin volver a devolver dinero.

Stripe puede crear un objeto `Refund` al liberar el importe autorizado, aunque `amount_received` sea cero. La conciliación reconoce esa liberación solamente si el PaymentIntent está cancelado, no recibió dinero, no queda importe capturable y la liberación corresponde al importe autorizado completo; no la contabiliza como dinero cobrado y reembolsado en Medusa. Este comportamiento está documentado en [cancelar un PaymentIntent](https://docs.stripe.com/api/payment_intents/cancel).

### Reembolso

Mercur mantiene la colección de pago en el carrito, no enlazada a cada pedido. El workflow completo `refundPaymentWorkflow` de Medusa busca una relación directa pedido–colección y no resuelve por sí solo este reparto. No se añade una relación artificial al pago compartido.

La adaptación usa las primitivas públicas nativas `refundPaymentStep`, `addOrderTransactionStep` y `createOrderCreditLinesWorkflow`, con importe explícito y atribución al pedido. Si falta la transacción del cobro de ese pedido, se registra la parte realmente capturada que le corresponde. La transacción negativa del reembolso y el crédito nativo mantienen la contabilidad de Medusa; el crédito tiene en cuenta los saldos ya modificados por devoluciones. Los importes de Medusa permanecen en unidades monetarias: solo la comprobación contra Stripe usa centavos.

El saldo reembolsable se limita tanto por la asignación de esa tienda menos sus devoluciones anteriores como por el saldo realmente cobrado. Un reembolso de A no consume la asignación de B. Reembolsar no marca artículos como devueltos ni los repone: la devolución física es un proceso nativo distinto.

### Captura final ajustada

La compra conserva un único pago compartido. En **Pagos → Cobros → Modo de cobro**, el operador elige entre **Manual** (confirma «Cobrar compra») y **Automático** (el sistema confirma el cobro cuando todos los pedidos activos tienen todos sus artículos preparados). Los cancelados quedan fuera del importe que calcula el servidor. El formulario manual muestra explícitamente que el cobro incluye otras tiendas, no solo el pedido abierto.

El modo se guarda en los metadatos de la tienda nativa, mediante un workflow y una revisión de concurrencia; sin configuración guardada se conserva el modo manual. Los eventos nativos de preparación/cancelación disparan la revisión automática y un job recorre hasta 25 compras por minuto con un cursor persistido para recuperar eventos perdidos. Activar Automático incluye compras ya preparadas pendientes de cobro. Ambas entradas reutilizan el workflow financiero, su exclusión por compra, comprobaciones de preparación, reparto original, journal e idempotencia. El modo se vuelve a comprobar dentro de la operación antes de reservar el cobro. Una captura ambigua queda bloqueada para conciliación, sin repetirla automáticamente. Esta opción no modifica la liquidación a las tiendas ni habilita Stripe LIVE.

El proveedor Stripe instalado no recibe un importe en `capturePayment`, por lo que no basta con pasar una cantidad al workflow nativo: capturaría toda la autorización. La adaptación captura en Stripe con `amount_to_capture` e idempotencia estable; el cobro manual ordinario libera automáticamente el resto. No envía `final_capture`, que Stripe rechaza sin soporte de multicaptura. Verifica el resultado y registra esa captura mediante el paso público de Medusa con `is_captured: true`. Después registra una transacción por cada pedido incluido y conserva una asignación final inmutable. No altera artificialmente el importe autorizado ni `captured_at`; Medusa puede seguir etiquetando la colección como parcialmente capturada, mientras el panel financiero indica lo realmente cobrado a cada tienda.

La liberación de la autorización restante no es un reembolso al comprador. Se registran y validan los identificadores de las liberaciones que Stripe anterior a Basil presenta como `Refund`. Un adaptador del proveedor verifica la firma y evita que el webhook de éxito, marcado exclusivamente por esta captura final de prueba, duplique la captura nativa. Los demás eventos conservan su comportamiento nativo.

### Reembolso después de liquidar

Se verifica la liquidación nativa y la transferencia real de Stripe: tienda, cuenta conectada, moneda, importe, grupo del pedido, modo de prueba y reversiones previas. Una transferencia huérfana, duplicada, externa o que no cuadre bloquea la operación.

La política autorizada devuelve proporcionalmente la comisión del marketplace. En el fixture histórico de QA de un pedido bruto de 12 USD, con neto de vendedor de 10,80 USD, un reembolso de 1 USD recupera 0,90 USD de la transferencia y devuelve 0,10 USD de comisión. Es un ejemplo de esa prueba, no el porcentaje general vigente. El cálculo acumulativo en centavos conserva los importes originales y el reparto con refunds sucesivos; F02 quedó cerrado con precisión consistente entre persistencia y proveedor.

Antes de mover dinero se guarda el plan. Se revierte la parte correspondiente de la transferencia con una clave idempotente; se guarda su identificador y después se reembolsa al comprador con el paso nativo de Medusa y su contabilidad por pedido. Si la reversión falla no se inicia el reembolso; si el resultado posterior es incierto se conserva el bloqueo para conciliación, sin volver a mover dinero automáticamente.

## Seguridad y límites explícitos

- UUID estable para repetir la misma solicitud dentro del formulario; el backend rechaza reutilizarlo con otros datos. Tras recargar, consultar el historial antes de iniciar una solicitud nueva.
- Exclusión mutua por carrito y registro duradero de operaciones. Si hay incertidumbre, no se libera automáticamente el bloqueo ni se crea otro reembolso.
- Las rutas nativas de captura, cancelación y reembolso sin asignación, y escrituras de la colección compartida, quedan bloqueadas. Se normalizan los identificadores y las rutas antes de comprobarlas. Los escritores de pedidos, devoluciones, cambios y reclamaciones incluidos en F04, también `order-edits`, respetan la exclusión por carrito y una reserva duradera. Esto no protege SQL externo ni escritores nuevos añadidos posteriormente. Una desconexión HTTP conserva la reserva y exige revisión: desconectar el navegador no cancela un workflow nativo.
- Se rechazan importes negativos, fracciones de centavo, exceso de saldo, estados no verificados, cambios/devoluciones pendientes, reembolsos históricos sin asignación, capturas parciales ajenas al flujo y liquidaciones que no puedan conciliarse.
- No hay botón para «forzar» o borrar una operación incierta. Hay un diagnóstico de solo lectura: `pnpm --filter @usapeek/api exec medusa exec ./src/scripts/inspect-order-finance.ts order_ID`.

## Liquidación y recuperación operativas

`settle-order-finance.ts` inspecciona por defecto el plan de un pedido con actor
operador, UUID estable y motivo; sólo `--execute` ejecuta la transferencia.
Verifica captura, snapshot, ajustes, cuenta Connect y movimientos existentes;
un refund anterior a la transferencia reduce el derecho a liquidar. La operación
durable y la clave de idempotencia impiden duplicaciones.

`recover-order-finance.ts` inspecciona una operación con pedido, operación, actor
y motivo. Ejecutar exige `--execute --plan-hash=<hash de inspección>` y hechos
conciliados del proveedor. La liberación de un escritor local exige además
`--release-stopped-writer` y prueba de que su proceso está detenido. No borrar
journals ni cambiar estados por SQL. Consultar la
[guía de scripts](../packages/api/src/scripts/README.md) y el código antes de operar.

Los informes financieros de `/dashboard` y `/seller`, incluido su desglose por
venta, usan fuentes backend y filtros
en `America/Montevideo`. Separan cobros, refunds, comisiones y transferencias;
costes pendientes o fechas desconocidas no se sustituyen por cero. El resultado
después de tarifas permanece desconocido con cobertura incompleta.

## Liberación automática con tiempo de espera configurable

En **Pagos → Liberaciones → Modo de liberación**, el operador elige **Manual**
(inicia cada liberación con el flujo operativo existente) o **Automático** (el job libera los pedidos elegibles).
La elección se guarda en los metadatos de la tienda nativa con actor y revisión;
requiere los permisos `store.update` y `payment.update`. La revisión impide
sobrescribir un cambio de otro operador. Cancelar descarta el borrador.
`STRIPE_AUTOMATIC_SETTLEMENT_ENABLED` solo define el modo inicial cuando aún no
hay una elección guardada; después manda el valor persistido, compartido por API
y worker. El modo de cobro es independiente.

Al elegir Automático se puede guardar el modo y el plazo juntos. La opción
**Tiempo de espera** permite elegir **Inmediato (0)**, **3 días** o **Una semana (7)**,
o introducir un entero entre 0 y 365 en el campo contiguo. Un separador vertical
separa las opciones del campo. Cada día equivale a 24 horas transcurridas,
incluidos fines de semana y feriados. Inmediato deja el pedido elegible desde su
finalización verificada; el siguiente ciclo normal del job ejecuta la liberación
si se cumplen todos los controles. El valor inicial es 3 días y se conserva al
volver a Manual.

Por decisión del operador, cambiar el plazo solo afecta a **nuevas finalizaciones**.
La primera observación persistida guarda `release_delay_days` y la fecha límite
inmutable del pedido; un evento tardío utiliza el ajuste vigente al registrar esa
observación. Los pedidos con reloj existente mantienen su plazo, token y fecha,
incluso si el evento se reintenta después de cambiar la configuración.

El job independiente, cada minuto, requiere Automático, las migraciones
financieras y un worker/shared operativo. Stripe debe conservar una configuración
TEST válida y `STRIPE_AUTOMATIC_JOBS_ENABLED=false`; el selector no habilita LIVE.
El subscriber registra una vez el reloj servidor al observar la finalización
nativa con esa integración disponible, también en Manual. Cambiar de modo no
reinicia el reloj. Activar Automático incluye pedidos anteriores con reloj
registrado; no reconstruye los que carecen de él. Espera el plazo guardado en cada pedido;
eventos tardíos o backlog prolongan la espera. No usa `updated_at` como inicio ni
reconstruye relojes para órdenes históricas.

Antes de liberar revalida estado, versión observada, preparación/envío, tienda y
Connect activos, captura, refunds, disputas, cambios pendientes y conciliación.
Un cambio posterior del pedido o resultado incierto exige revisión manual. El
ejecutor es el mismo de la vía manual, con locks, journal e idempotencia; una
transferencia ya registrada no se repite. El destino es el saldo Stripe TEST
Connect, separado del calendario bancario. El contrato detallado está en
[jobs](../packages/api/src/jobs/README.md).

Los editores de pagos, el registro del reloj y cada ejecución automática comparten un bloqueo por
propietario sin vencimiento. Si hay una operación en curso, cambiar de modo o plazo
devuelve conflicto; el operador debe reintentar al terminar. La escritura nativa
HTTP de metadatos de Store queda bloqueada porque podría borrar estas opciones.
Un proceso interrumpido puede conservar el bloqueo: exige revisión de operaciones
y prueba de que todos sus escritores están detenidos antes de una recuperación
explícita; nunca se libera automáticamente por antigüedad.

La migración `Migration20261006171340` añade el plazo del pedido con valor 3
para los relojes existentes, sin modificarlos. PostgreSQL exige un entero entre
0 y 365 y una diferencia exacta de `release_delay_days × 86400` segundos, junto
con instantes finitos. El trigger de inmutabilidad y los permisos privados se
conservan. La reversión se rechaza si existe algún reloj con plazo distinto de
3 días; nunca adapta ni elimina esos relojes para permitir un rollback.

La activación inicial conserva su evidencia histórica. Inmediato pasó una QA
integral aislada; el pedido original TEST #16 a 72 horas reales y la conciliación
posterior continúan **NEEDS VERIFICATION**, con el seguimiento pausado por el
cambio de entorno. Consultar el progreso antes de retomar ese circuito.

Fuera de esos requisitos, las devoluciones físicas, cambios y reclamaciones tienen primitivas nativas pero esta extensión no añade todos sus formularios logísticos. No son automáticamente bloqueadores del alcance actual. La automatización financiera es opcional (F17) si existe operación manual segura; el modo real y la preparación de producción pertenecen a una etapa posterior.

Consultar el [progreso](develpment/development-progress.md) para el estado vigente y los informes [QA financiero](reports/qa-order-finance-2026-09-12.md) y [extensión de QA](reports/qa-order-finance-extension-2026-09-12.md) para distinguir pruebas históricas de verificaciones posteriores.
