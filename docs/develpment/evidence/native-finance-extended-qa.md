# QA financiera adicional sobre las dos compras existentes

Preparado el 2026-09-26. Los helpers y sus unitarios no acreditan ejecución real de Stripe TEST. El coordinador conserva la ventana exclusiva de DB15 y ejecuta las operaciones con su launcher TLS aislado; esta tarea sólo prepara y comprueba código.

## Partición de las cuatro órdenes

| Orden | Recorrido reservado |
| --- | --- |
| Normal, target | Captura → refund 2 → liquidación → refund 3 → centavos → saldo restante |
| Normal, hermano | Transferencia interrumpida antes de persistencia → recuperación F08 → replay exacto |
| Parcial, target | Captura → centavos → saldo restante → liquidación sin transferencia |
| Parcial, hermano | Cancelación antes de captura; autorización liberada, captura cero |

El target parcial debe conservarse sin liquidar hasta agotar sus refunds. La liberación de la autorización del hermano no cuenta como refund de dinero capturado. Este reparto comprueba refund parcial y agotamiento total acumulativo antes y después de liquidar; no representa cuatro escenarios independientes de refund único total/parcial. No requiere nuevas compras ni cargos.

## Extensión de refunds

El helper nuevo `packages/api/integration-tests/helpers/complete-native-finance-refunds.ts` reutiliza las guardas y el inspector del runner inicial, que permanece sin cambios. Usa los mismos `NATIVE_CHECKOUT_MANIFEST_PATH`, `FINANCE_NATIVE_QA_ORDER_IDS`, `FINANCE_NATIVE_QA_TARGET_ORDER_ID` y `FINANCE_NATIVE_QA_SCENARIO`. En parcial requiere también `FINANCE_NATIVE_QA_CANCEL_ORDER_ID` y `FINANCE_NATIVE_QA_BASELINE_CART_ID`. Cada ejecución exige un archivo privado nuevo `FINANCE_NATIVE_QA_EXTENSION_OUTPUT_PATH`, fuera del worktree, abierto con `wx`.

Tras preparar el entorno aislado autorizado, la inspección y ejecución usan estos formatos; los argumentos se transportan con `--args=` según el parser instalado de Medusa 2.18:

```text
pnpm --filter @usapeek/api exec medusa exec ./integration-tests/helpers/complete-native-finance-refunds.ts --args=before-settlement
pnpm --filter @usapeek/api exec medusa exec ./integration-tests/helpers/complete-native-finance-refunds.ts --args=before-settlement --args=--execute
pnpm --filter @usapeek/api exec medusa exec ./integration-tests/helpers/complete-native-finance-refunds.ts --args=after-settlement
pnpm --filter @usapeek/api exec medusa exec ./integration-tests/helpers/complete-native-finance-refunds.ts --args=after-settlement --args=--execute
pnpm --filter @usapeek/api exec medusa exec ./integration-tests/helpers/complete-native-finance-refunds.ts --args=inspect
```

Sin `--execute`, cada fase valida precondiciones y muestra su plan. `inspect` permite revisar el resultado final sin exigir otra vez el estado inicial. `before-settlement` requiere el target parcial capturado, sin refund ni payout, con el hermano cancelado y captura cero. `after-settlement` requiere el target normal tras exactamente 2 → liquidación → 3. Ambos bloquean cualquier fence, revisión u operación incierta, incluida una recuperación F08 pendiente en el hermano.

El oráculo usa enteros BigInt y el snapshot real G/C/N. Programa refunds de 0,01 hasta cruzar un límite de redondeo acumulativo de comisión, con al menos dos y como máximo cincuenta pasos; luego devuelve el saldo exacto. Para G=24,99, C=2 y N=22,99, son siete refunds de 0,01 y un último de 24,92 antes de liquidar o 19,92 después. Estos valores son ejemplos calculados, no una tasa fija usada para determinar el resultado. El caso previo termina invocando la liquidación nativa de derecho cero y comprueba que no crea transfer ni payout.

Antes del primer workflow se guardan todos los requests completos, UUIDs y originales en el archivo privado con append y fsync. Cada paso verifica sus referencias exactas Stripe/journal/refund nativo, transacción negativa y credit line, además de reparto acumulativo, capture compartido y reversals. Preserva los originales completos y el estado económico/contable del hermano. La variante posterior admite que el hermano tenga su payout F08 ya recuperado. Repite el mismo request sólo después de observar y guardar su éxito; ante cualquier excepción se detiene y no continúa ni reanuda automáticamente.

Pruebas enfocadas: **34 PASS** con escenarios simulados, incluidos límites de centavos, agotamiento previo/posterior, payout del hermano, liquidación cero, operaciones compartidas y rechazo de atribuciones, transacciones o créditos ausentes/duplicados. Estas pruebas no son un PASS de Stripe ni sustituyen el contraste final con proveedor, persistencia y dashboards.

## Cobertura que debe conservarse en el cierre

- El cambio de regla futura debe hacerse después de crear ambos snapshots, sobre la única regla específica del manifest, mediante el workflow nativo y un refresco de las cuatro órdenes. Deben conservarse tanto originales como líneas nativas. Mantener la tasa nueva durante los refunds demuestra que éstos usan el original; sin otra compra no se prueba una venta nueva a esa tasa.
- Los costes deben contrastarse contra balance transactions reales y su persistencia por cuenta, modo e ID. El coste compartido no se suma dos veces. Un coste pendiente o no atribuible permanece pendiente; nunca equivale a tarifa cero o beneficio confirmado.
- El agotamiento financiero acumulativo, la recuperación F08 y sus replays deben reconciliarse antes de declarar el cierre. Los helpers no activan jobs ni constituyen evidencia de payouts bancarios.

## Regla futura y contraste de costes

El helper separado `packages/api/integration-tests/helpers/verify-native-finance-rate-costs.ts` acepta `inspect`, `rate` y `costs`. Reutiliza el entorno/manifest protegido y añade `FINANCE_NATIVE_QA_RATE_ORDER_IDS`: los cuatro IDs explícitos, primero el par normal y después el parcial. Comprueba que forman dos grupos y dos carts distintos, que ambas compras tienen originales y que no existen operaciones inciertas. El parcial puede estar pendiente de cancelación/captura cuando se cambia la regla. Requiere `FINANCE_NATIVE_QA_RATE_COST_OUTPUT_PATH` privado y nuevo para ejecutar el cambio o guardar el contraste de costes.

```text
pnpm --filter @usapeek/api exec medusa exec ./integration-tests/helpers/verify-native-finance-rate-costs.ts --args=inspect
pnpm --filter @usapeek/api exec medusa exec ./integration-tests/helpers/verify-native-finance-rate-costs.ts --args=rate
pnpm --filter @usapeek/api exec medusa exec ./integration-tests/helpers/verify-native-finance-rate-costs.ts --args=rate --args=--execute
pnpm --filter @usapeek/api exec medusa exec ./integration-tests/helpers/verify-native-finance-rate-costs.ts --args=costs
```

La fase `rate` sin `--execute` inspecciona el cambio 10→12. La ejecución valida el `commission_rate_id` conservado en el manifest, nombre del run, código QA con UUID, porcentaje USD habilitado/no predeterminado, exclusión de impuestos/envíos y reglas de producto exactamente iguales al conjunto completo del manifest. Los cuatro originales deben referenciar esa regla al 10%; sus líneas nativas deben coincidir por ancla e importe.

El helper guarda estado previo y requests, ejecuta `updateCommissionRatesWorkflow` sólo sobre ese ID con `value: 12`, vuelve a verificar y ejecuta `refreshOrderCommissionLinesWorkflow` para los cuatro IDs. Después exige la regla al 12% mientras los originales completos, líneas nativas y efectos financieros siguen iguales. Guarda checkpoints con fsync antes y después de cada workflow. Ante un fallo se detiene sin retry ni restauración automática: la compensación nativa no garantiza volver al 10%. El coordinador debe conservar la regla al 12% durante las extensiones de refunds para demostrar que éstos respetan los originales al 10%.

La fase `costs` es de sólo lectura y rechaza `--execute`. Requiere ambas compras capturadas. Obtiene las balance transactions reales desde Stripe usando el lector existente, conserva la respuesta bruta y contrasta cuenta/modo/ID, fuente exacta, importe con signo, `net = amount - fee` y desglose de tarifas mediante BigInt. Compara los hechos y costes persistidos, deduplica por clave de cuenta/modo/BT y vuelve a leer las órdenes para detectar cambios concurrentes. Cualquier coste pendiente, inaccesible, ausente o desactualizado devuelve `needs_reconciliation`; no escribe ni sustituye costes desconocidos por cero. El total de tarifas confirmadas suma sólo filas confirmadas y no acredita un beneficio total cuando la cobertura está incompleta.

Los workflows financieros ya existentes registran hechos al terminar cada operación. Repetir un request completado retorna antes de refrescarlos. Si un coste pasa después de pendiente a disponible y la persistencia sigue pendiente, el contraste lo declara desactualizado; este helper no añade una vía de escritura para ocultar ese estado.

Validación del helper de regla/costes: **56 pruebas unitarias PASS**, con alcance de regla, originales/líneas, aislamiento de grupos, checkpoints y fallos sin retry, signos de refunds, desgloses, duplicados y costes pendientes/desactualizados. Validación conjunta de esta preparación: `pnpm typecheck:api` PASS, `pnpm lint:api` sin errores (51 advertencias previas), formato y `git diff --check` PASS; lint explícito de helpers/specs sin errores (seis advertencias QA para refunds, cuatro para tasa/costes). Una revisión independiente no encontró bloqueos adicionales. No se ejecutaron cambios de tasa, refunds, liquidaciones ni lecturas externas de costes desde esta tarea.
