# Development Implementation Plan

Fecha de preparación: 2026-09-15. Estado inicial: **NOT STARTED**.

Estado vigente al 2026-10-03: **Phase 1–6 / F01–F12 DONE**, con
**Financial Readiness PASS acotado a Stripe TEST, USD y operación manual**.
Las tareas, dependencias y verificaciones siguientes conservan el plan original
y sus checkpoints; no representan una lista de trabajo todavía abierto.
La [matriz final](evidence/development-closure-20261003.md) y el
[progreso](development-progress.md) documentan la resolución y sus límites.

Este documento convierte únicamente los P0/P1 (F01–F12) de la [auditoría de cierre](development-completion-audit.md) en trabajo ejecutable por fases. La auditoría recoge evidencia histórica de la sesión del 13–14 de septiembre de 2026; crear este plan no repite sus verificaciones ni inicia F01. Consultar el [progreso](development-progress.md) para conocer el estado actual.

## Uso entre sesiones y límites

1. Leer `AGENTS.md`, la auditoría, este plan y el progreso; contrastarlos con el código y el estado Git actual. Las instrucciones actuales del usuario prevalecen.
2. Ejecutar solamente la fase o alcance autorizado por el usuario. Este plan no ordena comenzar ni terminar todas las fases automáticamente; tampoco exige pedir de nuevo autorización para trabajo ya incluido en una instrucción vigente.
3. Revalidar la evidencia correspondiente antes de editar. Si un hallazgo ya fue resuelto, demostrarlo y registrar la verificación; no rehacerlo por cumplir el documento.
4. Mantener la auditoría como base histórica. Solo corregirla ante un error factual demostrado, conservando fecha, evidencia y explicación de la corrección. Registrar avances y nuevas decisiones en el progreso; actualizar aquí dependencias o diseño del plan si cambian justificadamente.
5. Cerrar cada fase con sus pruebas y una actualización del progreso suficiente para otra cuenta/sesión. No marcar `DONE` si queda un criterio de salida sin demostrar.

**Fuera de las fases obligatorias:** F13–F17 (P2/P3), funciones nuevas ajenas a la auditoría, analítica avanzada, automatización no imprescindible y tareas puramente de producción. La auditoría conserva esos pendientes para otra fase del producto.

**Extensión autorizada el 2026-10-03:** el usuario solicita liquidación automática
72 horas después de completar el pedido. Se agrega únicamente ese camino
Stripe TEST/USD, conservando captura y recuperación existentes. No reabre el
cierre histórico F01–F12 ni incorpora el resto de F17. Diseño, verificaciones y
activación efectiva TEST en [la evidencia de la extensión](evidence/automatic-settlement-20261003.md).
La prueba integral de un pedido nuevo con 72 horas reales permanece **NEEDS
VERIFICATION**; no se adelantan relojes ni se reutilizan órdenes históricas para
declararla completa. LIVE, payout bancario y preparación de producción siguen
fuera de la certificación de desarrollo.
El [circuito nuevo en curso](evidence/automatic-settlement-e2e-20261003.md)
corresponde al pedido TEST #16, ya completado y capturado, con vencimiento
2026-10-06T15:51:00.416Z. No iniciar otra compra para sustituir su espera.

### Reglas técnicas comunes

- Conservar Medusa 2.18.0/Mercur 2.3.3 y patrones existentes salvo necesidad demostrada; no introducir un ledger general, ERP, nueva librería monetaria ni paquete compartido por anticipación. Extender la persistencia existente solo en lo que falte para reconstruir la venta y sus ajustes.
- Antes de cambiar backend, cargar `building-with-medusa`, las referencias pertinentes y la documentación instalada de Mercur. Inspeccionar workflows, rutas, validadores, subscribers y hooks nativos y locales. Medusa permite un solo consumidor por workflow hook: cualquier composición debe probarse con hooks Mercur cargados.
- No editar `node_modules` directamente. Si el cambio requiere intervenir una dependencia, revisar primero los parches declarados y usar el mecanismo reproducible del repositorio, con regresión de compatibilidad y sin actualizar versiones por conveniencia.
- Cargar `building-storefronts` y `storefront-best-practices` para `apps/web`; `frontend-design` cuando se construyan las nuevas vistas de reporting; `supabase` y `supabase-postgres-best-practices` para permisos y base de datos. Cargar `db-generate`/`db-migrate` al generar/ejecutar migraciones Medusa. Leer [date-fns](../skills/date-fns/SKILL.md) antes de modificar fechas o rangos. Localizar skills requeridas; no suponer que otra cuenta mantiene las mismas rutas absolutas.
- Consultar documentación actual/versionada según `AGENTS.md` cuando el cambio dependa de APIs o comportamiento incierto. Este plan no prescribe firmas de APIs sin verificarlas.
- Mutaciones mediante workflows, ownership en backend y SDK existente para consumidores frontend. Contratos oficiales/generados, sin importar código backend desde las aplicaciones.
- Medusa guarda importes en unidades de presentación. La conversión a unidades menores corresponde al límite del proveedor y a cálculos explícitos; no cambiar la escala almacenada ni dividir por 100 al mostrar.
- Preservar captura manual, separación por vendedor, reservas, validaciones nativas, compensación y journal de operaciones. No usar `order.completed` como prueba de cobro.
- Ninguna prueba debe tocar datos compartidos o dinero real por defecto. Identificar entorno y alcance antes de ejecutar pruebas que escriban; usar fixtures y bases aisladas. No activar claves live, mover dinero real ni ejecutar migraciones remotas como efecto lateral de un check.
- Ante un fallo exclusivamente de permisos, detener la operación antes de cualquier alternativa que cambie estado, pedir la capacidad/ruta exacta y reintentar la operación original tras obtener acceso. No reubicar caches/stores, reinstalar o reconstruir dependencias para eludirlo. Pueden continuar diagnósticos de solo lectura.
- No guardar credenciales, tokens, cookies, claves, datos personales ni volcados financieros sensibles en estos documentos. Registrar comandos saneados y resultados agregados.

## Dependencias y verificación

| Fase                                       | Hallazgos                       | Dependencia de salida                                                                |
| ------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------ |
| Phase 1 — Financial Foundation             | F01, F02, F03                   | Base para todas las operaciones y agregaciones financieras                           |
| Phase 2 — Integrity & Authorization        | F04, F05, F06                   | F04 integra las invariantes de Phase 1; F05/F06 admiten investigación independiente  |
| Phase 3 — Settlement & Recovery            | F07, F08, costes/reconciliación | Phase 1 y Phase 2 verificadas antes de validar el circuito completo                  |
| Phase 4 — Financial Reporting              | F09                             | Fuentes y ajustes de Phase 3 fiables                                                 |
| Phase 5 — Remaining Product Gaps           | F10, F11                        | F11 reutiliza convenciones monetarias cerradas; trabajo independiente si se autoriza |
| Phase 6 — Regression & Development Closure | F12 y cierre de F01–F11         | Todas las fases anteriores con evidencia de salida                                   |

Orden recomendado: 1 → 2 → 3 → 4 → 5 → 6. No es necesario bloquear investigación independiente de F05/F06/F10, pero no alterar el alcance autorizado ni validar dinero contra una base todavía incoherente.

Los scripts siguientes existen al preparar este plan; volver a comprobar los manifests si cambian. Para una aplicación, ejecutar `pnpm lint:<app>`, `pnpm typecheck:<app>` y verificar los flujos afectados. Para cambios de módulos, workflows, links, configuración o rutas API: `pnpm lint:api`, `pnpm typecheck:api` y `pnpm build:api`, más las integraciones pertinentes según la [guía de pruebas aisladas](../../packages/api/integration-tests/http/README.md). Los tests unitarios y sus comandos se retiraron por solicitud del usuario. Si afecta a varias apps/configuración compartida, aplicar los checks raíz correspondientes. `pnpm peers check` aplica si cambian dependencias. Repetir solo checks que un cambio posterior invalide.

Las pruebas de F01–F11 se desarrollan con cada corrección. Phase 6 integra y certifica el resultado; no es el lugar donde comenzar por primera vez las pruebas financieras.

### Hitos para sesiones cortas

Se mantienen seis fases porque sus fronteras coinciden con dependencias reales del proyecto. Una fase no equivale a una sesión ni a un único commit. Cada hito debe dejar un resultado revisable y actualizar el progreso; si un cambio exige varias piezas para ser seguro, mantenerlas coherentes antes de presentar ese hito como terminado.

| Fase    | Hitos sugeridos dentro de la fase                                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 | **1A:** reproducir defectos y definir contrato financiero/compatibilidad histórica. **1B:** snapshot y redondeo coherentes con sus lectores. **1C:** validaciones por API/workflow y regresión conjunta F01–F03. |
| Phase 2 | **2A:** escritores de pedidos y exclusión financiera. **2B:** ciclo de identidad/carrito/comprobante. **2C:** permisos de tablas, regresión y compatibilidad del rol backend.                                    |
| Phase 3 | **3A:** liquidación manual y refunds antes/después de transferir. **3B:** recuperación e idempotencia ante fallos. **3C:** costes, conciliación y prueba del ciclo económico completo.                           |
| Phase 4 | **4A:** contrato, detalle y agregaciones backend probados. **4B:** consumidores admin/vendor y filtros temporales. **4C:** conciliación de cifras visibles y prueba de aislamiento.                              |
| Phase 5 | **5A:** continuidad del catálogo. **5B:** desglose monetario. Ambos con su validación local.                                                                                                                     |
| Phase 6 | **6A:** regresión integrada y fallos inducidos. **6B:** UX funcional/checks/builds. **6C:** revisar todos los criterios financieros y registrar el cierre.                                                       |

Los hitos sirven para handoff, no sustituyen las condiciones de salida de cada fase. Registrar el hito exacto y la siguiente acción en `development-progress.md`, incluso si se agota la sesión antes de terminarlo. F01 y F02 están ligados: no dejar lectores operativos mezclando el snapshot nuevo con un cálculo monetario viejo.

## Phase 1 — Financial Foundation

### Objetivo y hallazgos

Cerrar F01 (P0, histórico inmutable), F02 (P0, redondeo) y F03 (P0, validaciones backend), conservando el modelo comercial encontrado: regla activa observada del 8%, base anterior a descuentos, sin envío/impuestos. Esta observación histórica no autoriza a cambiar una configuración vigente sin verificarla.

### Dependencias y criterio de entrada

Leer las evidencias F01–F03 y localizar sus consumidores actuales. Identificar cómo se generan/reemplazan las líneas de comisión y dónde se convierte dinero para Stripe. Registrar estado Git y cambios ajenos. La fase no requiere efectuar ventas ni transferencias para iniciar el trabajo local.

### Áreas probablemente afectadas

- Comisión nativa de Mercur: `packages/api/node_modules/@mercurjs/core/.medusa/server/src/modules/commission/service.js` y sus subscribers/workflows, como referencias de lectura.
- [order-finance](../../packages/api/src/lib/order-finance/), en especial `policy.ts`, `settlement.ts` y contratos.
- Módulos/workflows existentes que persisten asignaciones y operaciones; localizar sus modelos antes de ampliar datos.
- Validadores de commission-rates nativos y su integración local; `pnpm-workspace.yaml` y parches solo si fueran necesarios para reproducir un cambio de dependencia.

### Invariantes

- La tasa/base/política original y los importes originales de una venta no cambian por modificar reglas futuras o refrescar el pedido.
- Ajustes, refunds y reversals se vinculan al original y no lo sobrescriben.
- Los importes persistidos y enviados al proveedor coinciden en la precisión soportada; los residuos de redondeo tienen una asignación determinista.
- Cada reparto conserva el total y nunca asigna al vendedor más de su derecho ni importes negativos.
- El frontend no decide tasa, base ni comisión. Cero o ausencia de regla no pueden convertirse silenciosamente en una venta sin comisión.

### Tareas

1. Reproducir F01–F03 mediante pruebas enfocadas antes de cambiar comportamiento. Revisar casos nativos de actualización, devolución y edición del pedido.
2. Definir y documentar el snapshot mínimo: moneda, componentes, base, tasa/tipo/regla, política, comisión redondeada, bruto y derecho vendedor, asignación del pago compartido y referencias de movimientos. Reutilizar campos válidos existentes.
3. Separar el hecho original de ajustes posteriores. Definir la lectura compatible de registros antiguos; no inventar una tasa histórica que no pueda recuperarse. Marcar lo no reconstruible para conciliación.
4. Definir una sola política de precisión y reparto por moneda soportada y aplicarla antes de persistir/transmitir. Mantener conversión Medusa/Stripe explícita.
5. Validar tasas porcentuales, importes fijos y resultado del reparto tanto en el límite API como en los workflows que puedan omitirlo. Resolver explícitamente el tratamiento comercial de tasa cero/ausente; si cambia comportamiento de producto y el código no lo determina, consultar al usuario.
6. Si se necesita migración, diseñarla mínima y reproducible, probarla en entorno aislado y registrar compatibilidad de datos previos. No ejecutar migración sobre base compartida sin alcance autorizado.

### Pruebas necesarias

- Venta al 8%, cambio futuro de regla y refresh/edición/refund: original conservado.
- Producto de 19,99 USD: eliminar el desacuerdo 18,3908 interno frente a 18,39 transferido.
- Muchas líneas/importes pequeños, reparto por vendedores y secuencias de refunds de un centavo; refund total agota exactamente el original.
- Reglas inválidas `-8`, `108`, fijas negativas y reglas fijas que produzcan un reparto superior al importe repartible; llamadas directas a workflows y APIs. No imponer otros límites comerciales sin justificarlos.
- Envío/impuestos/descuentos según la regla encontrada; no cambiar silenciosamente la base.
- Composición/carga de hooks si se modifican; migración y datos previos si procede; gates API.

### Criterio de salida

F01–F03 tienen pruebas de regresión y evidencia del snapshot/ajustes; backend rechaza repartos inválidos; valores conservados al centavo. Documentar archivos, decisiones y migraciones en el progreso. No declarar todavía liquidación, reporting o Financial Readiness global terminados.

### Riesgos y qué NO hacer

Riesgos: duplicar comisión al introducir snapshots, romper lectores nativos, reconstruir datos históricos falsos o alterar la base comercial al redondear. No crear un ERP/ledger general, no cambiar automáticamente a comisión sobre total/después de descuentos, no construir dashboards ni liquidaciones en esta fase, no editar dependencias instaladas sin mecanismo reproducible.

## Phase 2 — Integrity & Authorization

### Objetivo y hallazgos

Cerrar F04 (P0, `order-edits`), F05 (P0, carrito/identidad) y F06 (P0, privilegios PostgreSQL/Supabase).

### Dependencias y criterio de entrada

Integrar las invariantes financieras de Phase 1 para F04. Releer el código actual de sesiones y la configuración efectiva de esquemas/roles para F05/F06. Distinguir privilegios comprobados en la auditoría de exposición HTTP externa todavía `NEEDS VERIFICATION`. Asegurar un entorno aislado para pruebas que muten permisos o identidad.

### Áreas probablemente afectadas

- [order-finance-middlewares.ts](../../packages/api/src/api/order-finance-middlewares.ts), rutas admin/vendor `order-edits` nativas y consumidores locales.
- [auth-actions.ts](../../apps/web/app/auth-actions.ts), [auth-sdk.ts](../../apps/web/lib/auth-sdk.ts), [cart/actions.ts](../../apps/web/features/cart/actions.ts) y comprobantes/checkout.
- Permisos y esquemas de PostgreSQL, migraciones existentes y [vendor-operations.md](../vendor-operations.md).

### Invariantes

- Ningún escritor cambia un pedido/reserva durante una operación financiera o conciliación pendiente.
- Datos, carrito y comprobantes de A no pasan a B ni a un invitado; la asociación al comprador se comprueba en backend.
- Roles públicos no leen ni mutan tablas internas por acceso directo; el backend autorizado sigue funcionando.
- No confundir Supabase Auth con la autorización de Medusa ni añadir políticas `auth.uid()` genéricas que no representen este modelo.

### Tareas

1. Inventariar rutas/workflows que escriben pedidos, incluidos `order-edits`; integrar el bloqueo o deshabilitar esa operación marketplace si está fuera del producto. No desarrollar edición de pedidos por su mera existencia nativa.
2. Asegurar identidad del carrito y del comprobante en logout, login y transición invitado→cuenta; definir limpieza/reasociación según los patrones vigentes y proteger completion.
3. Revalidar grants, RLS, roles y esquemas expuestos. Diseñar corrección de acceso exclusivamente backend y permisos por defecto para tablas futuras, preservando servicios autorizados.
4. Versionar la corrección de permisos según el mecanismo de migraciones del proyecto. Registrar qué requeriría aplicación a otro entorno, sin aplicar cambios remotos por defecto.

### Pruebas necesarias

- HTTP real admin/vendor `order-edits` durante operación reservada/incierta; acceso entre vendors; modificación normal permitida cuando corresponda.
- A→logout→B, A→logout→invitado, invitado→cuenta y refresh de comprobante; pedido atribuido al comprador correcto y datos previos inaccesibles.
- Pruebas SQL de permisos de `anon`/`authenticated` y del rol backend en tablas sensibles, más tablas futuras; prueba de Data API solo con alcance y entorno identificados.
- Gates API y web según áreas modificadas; integración con middleware nativo cargado.

### Criterio de salida

No quedan escritores conocidos que omitan el guard, el cambio de identidad no comparte datos y las tablas internas tienen acceso directo restringido comprobado. Si una verificación externa sigue pendiente, documentar exactamente su alcance y no confundir pruebas locales con confirmación de ese entorno.

### Riesgos y qué NO hacer

Riesgos: bloquear operaciones legítimas, perder carrito invitado, romper workers/migraciones al revocar privilegios o dejar funciones/vistas como acceso alternativo. No crear nuevos roles de producto ni migrar autenticación a Supabase; no ejecutar revocaciones masivas sin verificar el rol de aplicación; no elevar permisos ni usar `SECURITY DEFINER` como atajo.

## Phase 3 — Settlement & Recovery

### Objetivo y hallazgos

Cerrar F07 y F08 (P1), incluyendo las fuentes y conciliación necesarias para costes financieros. Completar una vía operativa segura de cobro, liquidación y recuperación. Una vía manual autorizada, documentada y auditable es suficiente; no es obligatorio automatizarla.

### Dependencias y criterio de entrada

Phase 1 y Phase 2 verificadas antes de integrar o validar el circuito económico completo. Identificar la fuente original del reparto, las operaciones ya realizadas y el estado Stripe TEST. Revisar los límites actuales a TEST/USD sin tratar el cambio de claves como una implementación financiera.

Coordinación del 2026-09-19: con Phase1 y las protecciones F04/F06 verificadas localmente, la implementación aislada de ajustes, liquidación, recuperación y fuentes de costes puede avanzar en su worktree mientras F05 termina su revisión. Son archivos y lógica independientes de la identidad del carrito. Las pruebas unitarias y de persistencia local no sustituyen el gate Phase2; la integración de Phase3 y sus pruebas del circuito completo/Stripe esperan ese gate. Esta separación reduce espera sin adelantar la certificación de seguridad o dinero.

### Áreas probablemente afectadas

- [order-finance](../../packages/api/src/lib/order-finance/), [operate-order-finance.ts](../../packages/api/src/workflows/steps/operate-order-finance.ts).
- [commerce-automation](../../packages/api/src/lib/commerce-automation/), workflows/proveedor nativo de payouts, webhooks Stripe y journal existente.
- [inspect-order-finance.ts](../../packages/api/src/scripts/inspect-order-finance.ts), recuperación QA y herramienta operativa general que la sustituya/amplíe sin perder sus restricciones.

### Invariantes

- Autorización, captura, transferencia a cuenta Connect y payout bancario son estados distintos.
- Captura/refund/transfers/reversals no se duplican por retry, refresh, webhook o caída entre Stripe y persistencia.
- Refund anterior o posterior a liquidación termina en el mismo derecho económico acumulado del vendedor/marketplace según la política registrada.
- No liquidar desde total actual del pedido o tasa actual; usar importes efectivamente capturados, snapshots y ajustes.
- Operación incierta conserva su bloqueo hasta reconciliar hechos del proveedor. La recuperación ejecuta solo pasos faltantes.
- Tarifas desconocidas no se representan como cero y no se confunden con comisión.

### Tareas

1. Conectar el recorrido normal de captura→obligación vendedor→transferencia→registro, reutilizando primitivas nativas y controles locales; definir quién puede operarlo y condiciones de elegibilidad Connect.
2. Resolver autorización vencida, venta no capturada y captura parcial del grupo sin producir obligaciones sobre dinero no cobrado.
3. Registrar reparto del refund antes de liquidar con la misma política acumulativa que después de liquidar; conservar atribución de componentes necesaria para reporting.
4. Proteger la frontera transferencia/persistencia/enlaces con claves estables y reconciliación, incluidos movimientos huérfanos y externos.
5. Crear una recuperación general soportada (CLI documentada es válida), con actor, motivo, observaciones y resultados; no limitarla a IDs/fixtures QA.
6. Incorporar referencias/datos Stripe necesarios para conocer tarifas y ajustes, distinguir costes confirmados de pendientes y asociarlos de forma trazable al pago/grupo. Si se distribuyen costes entre pedidos, documentar la regla sin cambiar quién los soporta por intuición.
7. Resolver la compatibilidad estructural de TEST/live y monedas realmente soportadas mediante diseño/test de adaptadores; conservar guardas y no activar pagos reales en esta fase de desarrollo.

### Pruebas necesarias

- Venta normal, grupo multivendor, captura con pedidos cancelados, autorización vencida y saldo/Connect no elegible.
- Refund total/parcial antes/después de liquidación; secuencias pequeñas y refunds que intenten superar el original.
- Caída tras transfer/reversal antes de persistir, tras Stripe refund antes de journal y después de persistir antes de responder; retries y eventos repetidos/reordenados.
- Recuperación de un pedido normal, sin identificadores QA predefinidos, con movimiento faltante y sin duplicaciones.
- Conciliación capturas/refunds/transfers/reversals/costes en Stripe TEST y almacenamiento; datos desconocidos explícitos.
- Gates API y pruebas de composición de hooks/webhooks afectados; registrar la diferencia entre simulación y prueba externa efectiva.

### Criterio de salida

Una compra normal completa el recorrido económico y puede reconciliarse; refunds en ambos momentos generan el resultado esperado; recuperación general resuelve fallos inducidos sin duplicar movimientos; costes confirmados y pendientes son distinguibles. No quedan operaciones inciertas sin explicación en las pruebas finales de la fase.

### Riesgos y qué NO hacer

Riesgos: confundir transferencia con payout bancario, liberar un bloqueo sin conciliar, recalcular obligaciones desde pedidos mutables o suponer que el saldo bruto es ganancia. No automatizar cron/payouts por conveniencia, no construir todavía dashboards, no activar claves live ni configurar despliegue definitivo, no ampliar monedas o modelos comerciales innecesariamente.

## Phase 4 — Financial Reporting

### Objetivo y hallazgos

Cerrar F09 (P1): desglose por venta, dashboard admin y dashboard vendor con métricas mínimas fiables y filtros temporales.

### Dependencias y criterio de entrada

Fuentes, snapshots, ajustes y conciliación de Phase 3 completos. Tomar las definiciones del dashboard mínimo de la auditoría como propuesta explícita a concretar con la implementación; no presentarlas como métricas ya disponibles. Acordar y registrar la zona temporal de negocio y el criterio de atribución de refunds por componente.

Coordinación del 2026-09-22: la tarea de reporting puede preparar sus consumidores y desarrollar en un worktree separado cuando reciba un commit coherente de las fuentes de Phase3, con sus pruebas de persistencia y lectura. No copiará fuentes en edición ni sustituirá datos pendientes por cifras simuladas. La integración y certificación de Phase4 siguen esperando la verificación completa de Phase3 y el contraste con ventas Stripe TEST. La zona acordada es `America/Montevideo`; los refunds sin atribución verificable de componentes no se usarán para inventar GMV neto.

### Áreas probablemente afectadas

- Contratos y lecturas de [order-finance](../../packages/api/src/lib/order-finance/), endpoints admin/vendor, SDKs y contratos generados existentes.
- [overview/metrics.ts](../../apps/admin/src/features/overview/metrics.ts), vistas admin de pedidos/resumen y sus componentes.
- [seller workspace](../../apps/vendor/src/app/seller/), detalles de pedidos y resumen vendor.

### Invariantes

- GMV ≠ ingreso propio. Comisión neta ≠ beneficio tras costes si estos faltan.
- Cada cifra agregada se explica por movimientos/ventas; una captura compartida no se suma por cada vendedor.
- `completed` no implica pagado. Liberación de autorización no es refund efectivo. Cancelación sin devolución no borra un cobro histórico.
- Un vendor solo accede a sus datos y cifras; moneda y período siempre explícitos.
- Las métricas no aplican la tasa vigente a ventas pasadas y no inventan saldos disponibles ni payouts bancarios.
- Layout y contenido independiente aparecen antes que métricas remotas, con errores y estados vacíos locales.

### Tareas

1. Exponer un desglose por venta con original, capturas, refunds, comisión original/revertida, earnings, transfers/reversals y estado de conciliación.
2. Implementar agregaciones backend para volumen cobrado, GMV de mercancía cobrada, pedidos pagados, refunds efectivos y volumen neto de cobros.
3. Añadir comisión bruta/revertida/neta, resultado tras tarifas confirmadas, vendor earnings, transferido neto y pendiente de liquidar. Mostrar costes pendientes como pendientes de conciliación.
4. En admin, separar dinero vendido, propio y correspondiente a vendors. En vendor, explicar ventas − refunds − comisión = earnings, ajustado al modelo real.
5. Documentar para cada métrica fórmula, fuente, estados incluidos/excluidos, efectos de refund/cancelación y fecha usada. No deducir GMV neto por componente si no existe atribución verificable.
6. Añadir hoy, últimos 7 días, últimos 30 días y mes actual con intervalos `[inicio, fin)` y zona registrada. No añadir comparativas o rango personalizado como requisito de esta fase.

### Pruebas necesarias

- Dataset conocido multivendor con autorizaciones, capturas, refunds de ventas anteriores, cancelación sin cobro, transferencia y reversal.
- Agregados iguales al detalle y a los movimientos conciliados; un período puede ser negativo por devoluciones de ventas anteriores.
- Vendor A no accede a B ni manipulando IDs/filtros. Monedas/modos de prueba no se mezclan silenciosamente.
- Fronteras temporales, cambio de día/mes y zona horaria; snapshots no cambian al editar la tasa actual.
- Loading/error/empty y respuestas lentas en las regiones nuevas; gates API/admin/vendor y contratos generados.

### Criterio de salida

Admin y vendor entienden sus cifras; cada métrica mínima tiene contrato/definición/pruebas y puede explicarse a partir de ventas reales del entorno de pruebas. No se muestran como disponibles cifras que aún requieran conciliación.

### Riesgos y qué NO hacer

Riesgos: sumar tablas sin restar ajustes, contar grupos dos veces, mezclar períodos de venta y movimiento, exponer datos de otros vendedores o confundir costes desconocidos con cero. No convertir paneles en BI ni añadir AOV, rankings o comparativas como condición de cierre. No duplicar lógica de negocio financiera en frontend.

## Phase 5 — Remaining Product Gaps

### Objetivo y hallazgos

Cerrar F10 y F11 (P1): continuidad del catálogo/categoría y suma coherente en checkout/confirmación.

### Dependencias y criterio de entrada

Localizar los patrones de paginación ya existentes y el resumen de cuenta que presenta correctamente descuentos/impuestos. Mantener las convenciones monetarias de Phase 1. Esta fase no exige rediseñar el catálogo ni crear nuevas capacidades backend.

### Áreas probablemente afectadas

- [medusa.ts](../../apps/web/lib/medusa.ts), [catalog-section.tsx](../../apps/web/components/catalog-section.tsx).
- [order-summary.tsx](../../apps/web/features/cart/components/order-summary.tsx), [confirmation/page.tsx](../../apps/web/app/checkout/confirmation/page.tsx) y resumen de cuenta existente como referencia.

### Invariantes

- Todos los resultados de una categoría siguen siendo navegables, conservando filtros y contexto.
- No sustituir catálogo backend por fixtures ni hacer depender el layout completo de una consulta.
- Renglones visibles suman exactamente el total backend; el frontend no recalcula ni cambia el importe a cobrar.

### Tareas

1. Añadir continuidad usando paginación o enlace a resultados completos que preserve la categoría, según el patrón existente más pequeño.
2. Corregir la representación de descuento e impuesto para no restar dos veces el descuento fiscal; reutilizar la convención válida de cuenta.
3. Revisar estado vacío, página fuera de rango, error recuperable y navegación lenta de las áreas cambiadas.

### Pruebas necesarias

- Categoría con más de 12 productos y navegación posterior manteniendo filtros; límites y resultados vacíos.
- Producto 100, descuento 5 antes de impuestos e impuesto 10%: renglones suman 104,50; envío y ausencia de descuentos/impuestos.
- Importe enviado al pago inalterado por la corrección de presentación; `pnpm lint:web`, `pnpm typecheck:web` y pruebas web pertinentes.

### Criterio de salida

El usuario puede recorrer el catálogo completo y todos los resúmenes afectados muestran un desglose coherente con el total backend, también bajo errores y navegación lenta.

### Riesgos y qué NO hacer

Riesgos: perder filtros, romper enlaces o corregir solo un resumen dejando otro incoherente. No rediseñar checkout, crear búsqueda nueva ni cambiar reglas de impuestos/descuentos backend.

## Phase 6 — Regression & Development Closure

### Objetivo y hallazgos

Cerrar F12 (P1) y certificar en conjunto F01–F11: regresión integral, UX funcional, checks, builds, revisión de mocks operativos y Financial Readiness final.

### Dependencias y criterio de entrada

Todas las fases anteriores cumplen salida y tienen pruebas registradas. Identificar revisión Git, entorno aislado, fixtures y credenciales de prueba disponibles sin registrarlas. La evidencia histórica de la auditoría no sustituye una ejecución del código resultante.

### Áreas probablemente afectadas

- [integration-tests/http](../../packages/api/integration-tests/http/), pruebas existentes de módulos/workflows y suites web/admin/vendor.
- Scripts de comprobación/contratos y harness existente; documentación de evidencia en el progreso.
- Solo correcciones necesarias de los flujos ya incluidos si aparecen fallos durante la regresión; asignarlas al hallazgo/fase de origen.

### Invariantes

- Backend, proveedor, persistencia y dashboards concuerdan para la misma venta y sus ajustes.
- Dos compradores no obtienen el último stock; retries no duplican efectos; identidad y permisos se mantienen.
- No declarar PASS del recorrido integrado solo porque lint y typecheck no presenten errores.
- Entornos aislados para mutaciones; no limpiar fixtures o datos compartidos sin verificar alcance y autorización.

### Tareas y pruebas necesarias

1. Ejecutar recorrido cliente→checkout→Stripe TEST→pedidos por vendedor→captura→transferencia→dashboards, con pruebas reproducibles y expectativas calculadas independientemente del código bajo prueba.
2. Ejecutar refunds totales/parciales antes y después de liquidación; sucesiones pequeñas; cambio futuro de tasa; conciliación de costes/ajustes.
3. Inducir retries, eventos duplicados/reordenados, caídas Stripe/DB y recuperación. Revisar escritores `order-edits`, autorización entre vendors y cambios de cuenta/carrito.
4. Probar último stock concurrente, cambio de precio/disponibilidad durante checkout, producto deshabilitado en carrito, vendedor suspendido con pedidos activos y conservación de autorizaciones backend.
5. Verificar los flujos existentes de 3DS/retorno, abandono, expiración y pago fallido; correo, búsqueda e imágenes en el entorno de pruebas según integración realmente usada. No crear nuevas integraciones.
6. Revisar UX funcional con respuestas lentas/error: contenido independiente visible, loading local, acciones sin duplicación, feedback/retry y operación utilizable en móvil.
7. Ejecutar `pnpm lint`, `pnpm typecheck` y `pnpm build` sobre el código final. Ejecutar las integraciones HTTP/módulos pertinentes mediante scripts existentes después de comprobar que apuntan al entorno aislado. No usar `build:deploy` como requisito de desarrollo. Ejecutar `pnpm peers check` si cambiaron dependencias.
8. Buscar mocks, placeholders y callbacks sin acción en flujos operativos afectados; distinguir demos huérfanas de datos falsos activos. No convertir la limpieza P2 en una reescritura obligatoria.
9. Revisar cada ítem de Definition of Done financiera de la auditoría con evidencia actual, registrar PASS/FAIL final en el progreso y actualizar el siguiente paso. Una limitación no verificada debe quedar explícita, no como PASS.

### Criterio de salida

F01–F12 cerrados con evidencia actual, gates requeridos exitosos, flujos integrados reconciliados y Definition of Done financiera completa. `Financial Readiness: PASS` solo si todas sus garantías están demostradas. Si falta infraestructura/credenciales o una prueba falla, indicar comando, alcance, resultado y siguiente acción; no cerrar artificialmente la fase.

### Riesgos y qué NO hacer

Riesgos: pruebas que repiten la implementación, confundir fixtures históricos con validación nueva o ejecutar suites destructivas sobre la base compartida. No exigir 100% de coverage, no implementar P2/P3 por comodidad, no realizar despliegue definitivo ni tareas puras de producción.

## Registro al terminar cada fase

Actualizar [development-progress.md](development-progress.md) con cambios, decisiones, archivos, migraciones creadas y dónde se aplicaron, invariantes/pruebas añadidas, comandos exactos saneados, resultados, revisión Git, limitaciones, problemas y próxima acción. Usar `None` cuando un apartado no tenga elementos; no omitirlo de forma que parezca olvidado. Un commit o una compilación exitosa no sustituyen los criterios funcionales de salida.
