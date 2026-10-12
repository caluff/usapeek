# Development Completion Audit

## Uso de este documento y procedencia

- Auditoría realizada durante el 13–14 de septiembre de 2026; persistida el 15 de septiembre de 2026.
- Este documento conserva el diagnóstico entregado en la conversación, sus 17 hallazgos y sus límites. No certifica el estado de una sesión, despliegue o base de datos posterior.
- Es evidencia/base de trabajo: **no actualizarlo para marcar hallazgos resueltos durante la implementación**. Registrar avances, decisiones, verificaciones y cambios de alcance en [development-progress.md](development-progress.md) y mantener el plan en [development-implementation-plan.md](development-implementation-plan.md).
- Solo corregir este archivo ante un error factual demostrado, dejando constancia de fecha, afirmación corregida y evidencia. Una corrección de código posterior no convierte la evidencia histórica en un error.
- Se normalizaron los enlaces para que sean relativos al repositorio. Las líneas de referencia son orientativas y pueden desplazarse. Las dependencias instaladas se citan como evidencia de las versiones inspeccionadas; no son archivos a editar directamente. Revisar `pnpm-workspace.yaml`, `patches/` y los mecanismos de extensión antes de implementar.
- La autorización de la sesión que creó estos documentos fue exclusivamente documental. **No se implementó F01 ni ningún otro hallazgo.**
- `NEEDS VERIFICATION` significa que no se demostró esa afirmación o escenario con la evidencia disponible. No equivale a PASS ni a una pérdida ya ocurrida.

## Resumen ejecutivo

**El proyecto tiene una base funcional considerable, pero todavía no está listo para declarar “development complete”. El desarrollo financiero debe considerarse incompleto.**

El estado real es bastante más avanzado que el descrito en el README: existen autenticación, onboarding de vendedores, catálogo/ofertas, inventario, envíos, checkout con Stripe, pedidos y operaciones de captura/reembolso. No son únicamente pantallas de demostración.

Los pendientes principales están en **cerrar y proteger los flujos existentes**, especialmente su contabilidad, liquidación, recuperación y aislamiento entre usuarios. No hace falta reconstruir el marketplace ni incorporar todas las funcionalidades habituales de otras plataformas.

| Prioridad            | Hallazgos |
| -------------------- | --------: |
| P0 — Bloqueador      |     **6** |
| P1 — Necesario       |     **6** |
| P2 — Recomendado     |     **3** |
| P3 — Opcional/futuro |     **2** |

Las cinco áreas que más trabajo necesitan son:

1. **Comisiones y contabilidad histórica:** snapshots, redondeo y validación backend.
2. **Liquidación y recuperación financiera:** completar el recorrido normal y resolver resultados inciertos.
3. **Autorización e integridad:** aislamiento de carritos, escrituras de pedidos y permisos de PostgreSQL.
4. **Dashboards financieros:** actualmente muestran actividad operativa, no ingresos ni obligaciones con vendedores.
5. **Regresión integral:** comprobar el recorrido comercial con middleware, persistencia y Stripe TEST reales.

No se asigna un porcentaje de avance: la amplitud de funcionalidades ya implementadas no refleja el riesgo de los pendientes financieros.

**Alcance de la auditoría:** inspección del código local y dependencias instaladas, documentación, validadores, pruebas y consultas de solo lectura a PostgreSQL y Stripe TEST. Durante la auditoría no se modificaron archivos ni datos, ni se ejecutaron nuevas compras, reembolsos, transferencias o migraciones. El archivo no rastreado `1004` ya existía y se conservó. Este dato es contexto histórico, no autorización para borrarlo.

### Arquitectura inspeccionada

| Área                             | Ubicación                              | Responsabilidad                                                          |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| Storefront                       | `apps/web`                             | Next.js App Router, comprador, catálogo, cuenta y checkout               |
| Admin                            | `apps/admin`                           | Next.js independiente, operaciones del marketplace                       |
| Vendor                           | `apps/vendor`                          | Next.js independiente, operación de la tienda                            |
| API/worker                       | `packages/api`                         | Mercur 2.3.3 sobre Medusa 2.18.0, módulos/workflows y APIs               |
| Contratos onboarding             | `packages/vendor-onboarding-contracts` | Contratos de tipos compartidos, sin importar fuente backend en frontends |
| Preferencia de tema              | `packages/theme-sync`                  | Preferencia visual compartida; no comparte autenticación                 |
| Configuración de infraestructura | `.railway/`, `railway/`                | Definiciones/documentación; despliegue definitivo fuera del alcance      |
| Dependencias adaptadas           | `patches/`, `pnpm-workspace.yaml`      | Parches declarados de framework, Mercur y proveedor Connect              |

Persistencia PostgreSQL/Supabase; Redis en Railway para caché, eventos, workflows y bloqueos; integraciones reales con Stripe/Connect, Resend, Algolia y almacenamiento de imágenes. Las aplicaciones conservan SDKs y sesiones propios. La documentación y los AGENTS antiguos que llaman “demo” a los paneles no deben sustituir la inspección del código conectado.

## Financial Readiness

| Pregunta                                                        | Respuesta                                                                                                                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **¿El marketplace está conservando correctamente su comisión?** | **No puede garantizarse para el flujo general.** La transferencia de QA comprobada retuvo inicialmente la diferencia esperada, pero el circuito ordinario de liquidación está incompleto y existen defectos de histórico y redondeo. |
| **¿Puede demostrarse desde el código?**                         | Puede demostrarse el cálculo actual y varias operaciones protegidas. **No puede demostrarse el ciclo financiero completo bajo todos los estados admitidos.**                                                                         |
| **¿Puede reconciliarse con Stripe?**                            | **Sí, para los registros TEST inspeccionados.** No existe todavía una conciliación operativa completa que abarque ingresos, costes, obligaciones, transferencias y recuperación general.                                             |
| **¿Los refunds revierten correctamente las cantidades?**        | **En los escenarios de QA inspeccionados, sí.** La reversión proporcional posterior a una liquidación está implementada. Antes de liquidar falta un ajuste financiero persistido equivalente de comisión y derecho del vendedor.     |
| **¿Los dashboards muestran los números correctos?**             | **No muestran los números financieros necesarios.** No se encontró un dashboard activo confundiendo GMV con revenue; faltan ambas métricas y sus fuentes consolidadas.                                                               |
| **¿El historial permanece correcto si cambia la comisión?**     | **No está garantizado.** Cambiar la tasa no reescribe inmediatamente todas las ventas, pero un refresco posterior puede reemplazar sus líneas usando la tasa vigente.                                                                |
| **¿Podemos vender sin generar nuestra ganancia?**               | **Sí, hay escenarios admitidos por el código:** tasa cero, ausencia de tasa aplicable y tasas inválidas por API. La regla comercial observada es **8%**, no cero. Tampoco está demostrado el margen después de tarifas Stripe.       |
| **¿Es seguro cerrar el desarrollo financiero?**                 | **FAIL**: faltan histórico inmutable, coherencia monetaria, liquidación completa, recuperación general y reporting verificable.                                                                                                      |

### Lo comprobado directamente en PostgreSQL y Stripe

Las consultas financieras se realizaron sin iniciar Medusa y dentro de transacciones PostgreSQL `READ ONLY`. En Stripe solamente se consultaron objetos existentes. Los siguientes valores son la fotografía de esa auditoría, no lecturas renovadas al crear los documentos.

| Dato                                                       | Resultado observado                               |
| ---------------------------------------------------------- | ------------------------------------------------- |
| Comisión comercial activa                                  | **8%**, regla `default`                           |
| Incluye impuestos                                          | **No**                                            |
| Incluye envío                                              | **No**                                            |
| Reglas específicas activas                                 | Ninguna                                           |
| Otra tasa existente                                        | **12%**, identificada como QA y **deshabilitada** |
| Pagos Stripe persistidos inspeccionados                    | 8, todos TEST                                     |
| Capturas efectivas acumuladas                              | **92 USD**                                        |
| Reembolsos efectivos acumulados                            | **92 USD**                                        |
| Transferencia a vendedor                                   | **10,80 USD**                                     |
| Reversiones de esa transferencia                           | **0,90 + 9,90 = 10,80 USD**                       |
| Grupos financieros con reserva activa o revisión pendiente | **0**, entre los 5 registros existentes           |
| Autorización todavía sin capturar                          | **420 USD**, asociada al pedido completado #5     |

La autorización de 420 USD ilustra una distinción necesaria: **un pedido `completed` no demuestra que se haya cobrado**. No se interpreta ese registro de pruebas como una pérdida comercial real.

Los objetos `Refund` que Stripe utiliza en estos pagos para liberar autorizaciones no capturadas **no se sumaron como reembolsos de dinero cobrado**. La implementación local contempla esa diferencia.

No se incluyen credenciales, datos personales, tokens, hosts privados ni identificadores de cuentas Stripe. Los informes QA existentes contienen el contexto de sus propios fixtures; no reutilizarlos para mutaciones sin verificar su alcance y autorización.

## Tabla de hallazgos

Los identificadores se mantienen estables para la implementación. Los riesgos deducidos del código se distinguen de operaciones efectivamente observadas.

| Prioridad    | Área                    | Hallazgo                                                                                                                                                                                                                | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Qué falta                                                                                                                      | Criterio de finalización                                                                                                                                               |
| ------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0 · F01** | Comisiones              | **El histórico puede recalcularse con otra tasa.** Un cambio posterior de pedido puede alterar la comisión original.                                                                                                    | Mercur [`service.js`](../../packages/api/node_modules/@mercurjs/core/.medusa/server/src/modules/commission/service.js), `getCommissionLines()`/`upsertCommissionLines()` (líneas 115/185); [`order-edit-confirmed.js`](../../packages/api/node_modules/@mercurjs/core/.medusa/server/src/subscribers/order-edit-confirmed.js), línea 13.                                                                                                                                         | Snapshot financiero original y ajustes separados; conservar tasa, base y política aplicada.                                    | Cambiar 8%→otra tasa y procesar cambios/reembolsos nunca modifica la comisión original; ajustes trazables.                                                             |
| **P0 · F02** | Redondeo                | **La liquidación interna y Stripe pueden guardar importes distintos.** Ejemplo: neto interno 18,3908; transferencia 18,39. El refund posterior rechaza ese neto fraccionario.                                           | [`computeCommission()`](../../packages/api/node_modules/@mercurjs/core/.medusa/server/src/modules/commission/service.js), línea 99; [`getSmallestUnit()`](../../packages/api/node_modules/@mercurjs/payout-stripe-connect/dist/index.js), línea 38; [`createPayouts()`](../../packages/api/node_modules/@mercurjs/core/.medusa/server/src/modules/payout/services/payout-module-service.js), línea 123; [`financeAmount()`](../../packages/api/src/lib/order-finance/policy.ts). | Regla única de redondeo monetario y reparto de residuos antes de persistir/mover dinero.                                       | Importes persistidos y transferidos idénticos al centavo; refunds parciales agotan exactamente los originales.                                                         |
| **P0 · F03** | Validación financiera   | **La API admite porcentajes negativos y superiores al 100%.** La UI restringe el rango, el backend no.                                                                                                                  | [`AdminUpdateCommissionRate`](../../packages/api/node_modules/@mercurjs/core/.medusa/server/src/api/admin/commission-rates/validators.js), línea 47; workflow nativo de actualización sin validación adicional. Comprobación en memoria: `-8` y `108` aceptados.                                                                                                                                                                                                                 | Validaciones de tasa, importes fijos y reparto final en backend.                                                               | API rechaza reglas inválidas; ningún payout puede exceder el derecho del vendedor ni resultar negativo. Cero debe ser una decisión explícita, no una caída silenciosa. |
| **P0 · F04** | Pedidos/finanzas        | **`order-edits` elude los bloqueos financieros.** Puede cambiar pedidos y reservas durante una operación o conciliación pendiente.                                                                                      | [`order-finance-middlewares.ts`](../../packages/api/src/api/order-finance-middlewares.ts), líneas 49/205; rutas nativas `/vendor/order-edits/:id/confirm`.                                                                                                                                                                                                                                                                                                                       | Cubrir esos escritores o bloquearlos para pedidos marketplace si la edición no forma parte del alcance.                        | Rutas reales admin/vendor no pueden cambiar el pedido durante una operación financiera; toda edición admitida conserva coherencia del reparto.                         |
| **P0 · F05** | Cliente/autorización    | **Carrito y comprobante sobreviven al cambio de cuenta.** Una compra de B puede conservar a A como propietario.                                                                                                         | [`logoutCustomerAction()`](../../apps/web/app/auth-actions.ts), línea 433; [`auth-sdk.ts`](../../apps/web/lib/auth-sdk.ts), línea 56; [`currentCart()`](../../apps/web/features/cart/actions.ts), línea 40.                                                                                                                                                                                                                                                                      | Aislamiento de carrito/comprobante y validación de asociación al comprador antes del checkout.                                 | A→logout→B y A→logout→invitado no exponen datos anteriores ni atribuyen pedidos a A. Reproducción E2E: **NEEDS VERIFICATION**.                                         |
| **P0 · F06** | PostgreSQL/autorización | **Tablas sensibles permiten SELECT/UPDATE a `anon` sin RLS.** Los guards Medusa no protegen ese acceso directo.                                                                                                         | Lectura de `pg_class` y `has_table_privilege`: customer, order, payment, refund, payout, commission y auth, entre otras. Limitación ya documentada en [`vendor-operations.md`](../vendor-operations.md), línea 102.                                                                                                                                                                                                                                                              | Privilegios/esquemas coherentes con acceso exclusivo desde backend y una regresión de permisos.                                | Roles públicos no leen ni modifican tablas internas. Exposición efectiva de Data API externa: **NEEDS VERIFICATION**.                                                  |
| **P1 · F07** | Liquidaciones           | **Falta una vía operativa completa y reconciliable para liquidar ventas normales.** El proveedor existe, pero la automatización permanece incompleta y el refund previo a liquidación no registra su reparto económico. | [`configuration.ts`](../../packages/api/src/lib/commerce-automation/configuration.ts), línea 13; [`runner.ts`](../../packages/api/src/lib/commerce-automation/runner.ts), línea 126; [`prepareSettlement()`](../../packages/api/src/lib/order-finance/settlement.ts), línea 52.                                                                                                                                                                                                  | Flujo soportado de captura→derecho vendedor→transferencia, con refunds, vencimientos, costes e idempotencia. Puede ser manual. | Una venta normal se captura y liquida correctamente; refund antes/después de liquidar produce el mismo resultado económico.                                            |
| **P1 · F08** | Recuperación            | **Las operaciones inciertas se bloquean correctamente, pero no tienen recuperación general soportada.**                                                                                                                 | [`operate-order-finance.ts`](../../packages/api/src/workflows/steps/operate-order-finance.ts), línea 403; [`inspect-order-finance.ts`](../../packages/api/src/scripts/inspect-order-finance.ts), línea 10; recuperación QA restringida a fixtures.                                                                                                                                                                                                                               | Herramienta autorizada y auditada para conciliar y completar exclusivamente pasos faltantes.                                   | Recuperación de un pedido normal tras caída entre reversal/refund o Stripe/DB, sin duplicar dinero. CLI documentada es suficiente.                                     |
| **P1 · F09** | Dashboards              | **Faltan métricas financieras admin/vendor y desglose de ganancias por venta.**                                                                                                                                         | [`OVERVIEW_METRICS`](../../apps/admin/src/features/overview/metrics.ts), línea 5; [vendor page](../../apps/vendor/src/app/seller/%28workspace%29/page.tsx), línea 15; [`contracts.ts`](../../packages/api/src/lib/order-finance/contracts.ts), línea 32.                                                                                                                                                                                                                         | Agregaciones backend sobre capturas, refunds, snapshots y transferencias; filtros temporales.                                  | Totales explicables por pedido, separados por actor/moneda y reconciliables con Stripe.                                                                                |
| **P1 · F10** | Catálogo                | **La navegación por catálogo/categoría se corta en 12 productos sin continuidad.**                                                                                                                                      | [`medusa.ts`](../../apps/web/lib/medusa.ts), línea 14; [`CatalogContent()`](../../apps/web/components/catalog-section.tsx), línea 166.                                                                                                                                                                                                                                                                                                                                           | Paginación o enlace a resultados completos conservando la categoría.                                                           | Se puede recorrer una categoría con más de 12 productos sin perder filtros.                                                                                            |
| **P1 · F11** | Checkout/comprobante    | **El desglose resta dos veces la parte fiscal del descuento.** El total backend permanece correcto, pero los renglones no suman.                                                                                        | [`order-summary.tsx`](../../apps/web/features/cart/components/order-summary.tsx), línea 30; [`confirmation/page.tsx`](../../apps/web/app/checkout/confirmation/page.tsx), línea 79.                                                                                                                                                                                                                                                                                              | Presentación coherente con `discount_subtotal` y el impuesto ya descontado.                                                    | Con descuento e impuestos, la suma visible coincide exactamente con el total cobrado.                                                                                  |
| **P1 · F12** | Tests                   | **Falta regresión integral reproducible del circuito comercial actual.** Los unitarios no cubren todas las conexiones reales.                                                                                           | [`integration-tests/http`](../../packages/api/integration-tests/http/README.md), suites actuales y omisión de `order-edits` en pruebas del guard.                                                                                                                                                                                                                                                                                                                                | Pruebas aisladas de dinero, sesiones, ownership, último stock y recuperación con persistencia real.                            | Suite repetible del código final, incluidos todos los P0 y reconciliación Stripe TEST.                                                                                 |
| **P2 · F13** | Admin                   | Suspender/reactivar tiendas y asumir parte de su logística requiere APIs externas al panel. El backend sí existe.                                                                                                       | [`StoreDetails`](../../apps/admin/src/features/stores/components.tsx), línea 217; rutas nativas `suspend/unsuspend`.                                                                                                                                                                                                                                                                                                                                                             | Conectar acciones o documentar una herramienta operativa soportada.                                                            | Operador puede gestionar restricciones y resolver pedidos activos sin procedimientos improvisados.                                                                     |
| **P2 · F14** | Documentación/limpieza  | README e informes describen capacidades antiguas; quedan componentes demo sin uso operativo.                                                                                                                            | [`README.md`](../../README.md), [`IMPLEMENTATION_REPORT.md`](../../apps/admin/IMPLEMENTATION_REPORT.md), línea 5; documentos vendor.                                                                                                                                                                                                                                                                                                                                             | Actualizar mapa vigente y separar evidencia histórica; retirar restos realmente huérfanos.                                     | Documentación coincide con rutas y límites actuales.                                                                                                                   |
| **P2 · F15** | Calidad técnica         | 50 warnings API y dependencia de APIs internas/parches requieren mantenimiento controlado.                                                                                                                              | [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml), [`inventory/README.md`](../../packages/api/src/modules/inventory/README.md), lint ejecutado.                                                                                                                                                                                                                                                                                                                                 | Resolver advertencias útiles y mantener pruebas de compatibilidad al actualizar.                                               | Riesgos relevantes documentados/protegidos; no se exige eliminar warnings justificadas.                                                                                |
| **P3 · F16** | Analítica               | Rankings, AOV, comparaciones y rango personalizado son útiles, pero secundarios.                                                                                                                                        | No existen en dashboards inspeccionados.                                                                                                                                                                                                                                                                                                                                                                                                                                         | Incorporarlos después de tener fuentes financieras fiables, si aportan valor.                                                  | Fórmulas explícitas y resultados derivados del mismo ledger.                                                                                                           |
| **P3 · F17** | Automatización          | Automatizar cobros/liquidaciones puede esperar si existe un flujo manual seguro y operable.                                                                                                                             | [`commerce-automation/runner.ts`](../../packages/api/src/lib/commerce-automation/runner.ts), línea 126.                                                                                                                                                                                                                                                                                                                                                                          | Automatización sobre el flujo financiero ya cerrado.                                                                           | Reutiliza sus invariantes, idempotencia y recuperación; no crea otro sistema contable.                                                                                 |

**Precisión sobre F06:** los privilegios peligrosos están comprobados. No se probó una explotación HTTP externa. Se clasifica como P0 por el acceso que el propio esquema concede a roles públicos sobre datos financieros y de identidad; no como una afirmación de filtración ya ocurrida.

### Evidencia complementaria para reproducir los hallazgos

- **F01:** el subscriber nativo refresca comisiones en confirmación de edición, devolución recibida, claim y exchange. `getCommissionLines()` carga tasas habilitadas vigentes; `upsertCommissionLines()` reemplaza líneas por ancla. La existencia de `rate` y `commission_rate_id` en `commission_line` no vuelve inmutable el registro.
- **F02:** `computeCommission()` conserva precisión arbitraria; el proveedor Connect redondea al convertir a unidades menores; `createPayouts()` persiste `input.amount`, no el importe redondeado devuelto por Stripe. `prepareSettlement()` exige importes de dos decimales mediante `financeAmount()`.
- **F03:** los workflows `update-commission-rates` y su step delegan al servicio sin añadir el límite 0–100 del frontend. Se probaron únicamente los validadores en memoria, sin enviar cambios a la API ni guardar tasas.
- **F04:** el middleware financiero contempla orders, payments, payment-collections, returns, claims y exchanges; omite order-edits. Mercur confirma la edición del pedido propio con permiso `order_change:update`. `financeView()` compara identidades y suma de asignaciones con pago/colección, pero no compara cada total vivo de pedido con su asignación original. La exclusión de escritores debe resolverse sin confundir snapshot inmutable con el defecto.
- **F05:** `clearCustomerSession()` elimina autenticación, no `marketplace_cart` ni `marketplace_receipt`; `currentCart()` no verifica `customer_id`. El update-cart nativo conserva `customer_id` y `findOrCreateCustomer` conserva al cliente registrado original aun cambiando email. `completeCartWithSplitOrdersWorkflow` copia `cart.customer.id`. El comprobante también se recupera por cookie persistente en `features/cart/data.ts`. La cadena A→logout→B está deducida del código; no se ejecutó una compra para reproducirla.
- **F06:** auth_identity, provider_identity, customer, order, payment, refund, payout, commission_rate y commission_line mostraron `relrowsecurity=false`, `anon` SELECT/UPDATE y `authenticated` SELECT permitidos. `commerce_operation` y `vendor_application` sí tenían RLS y carecían de esos grants públicos. Esto no autoriza revocar indiscriminadamente permisos de consumidores desconocidos.
- **F08:** existe diagnóstico de lectura y un script de recuperación limitado al fixture QA. No generalizarlo borrando su restricción o liberando locks sin reconciliar efectos externos.
- **F10:** `/search` sí ofrece paginación; el defecto afecta la home/catalogo por categoría y su falta de continuidad, no toda la búsqueda.
- **F11:** el resumen de cuenta en `apps/web/features/account/components/order-summary.tsx` ya usa `discount_total - discount_tax_total`; se puede reutilizar el patrón. El problema observado es visual, no un importe de cobro alterado.

## Reconstrucción del flujo financiero

### Modelo actual y fórmula real

El modelo observado es **cargo en la plataforma y transferencias separadas a cuentas conectadas**.

Los PaymentIntents inspeccionados no tienen `application_fee_amount` ni `transfer_data`. La comisión se conserva reduciendo la transferencia al vendedor; no depende de un objeto Stripe `ApplicationFee`.

Ese modelo es válido: Stripe permite retener la comisión transfiriendo menos que el cargo. La plataforma soporta los débitos de tarifas, refunds y disputas; un refund del cargo no sustituye la reversión de la transferencia. [Documentación oficial de Stripe](https://docs.stripe.com/connect/separate-charges-and-transfers?locale=en-GB).

**Configuración comprobada durante la auditoría:**

```text
r = 8%
include_tax = false
include_shipping = false
sin reglas específicas activas
```

Para cada línea de producto:

```text
commissionBaseᵢ = item.subtotal
commissionAmountᵢ = commissionBaseᵢ × 0,08

C = suma(commissionAmountᵢ)
Z_nativo = order.total − C
```

En esta implementación, `item.subtotal` es la base **antes de descuentos y sin impuestos**.

- Productos: incluidos.
- Descuentos: **no reducen la base de comisión**.
- Envío: excluido.
- Impuestos: excluidos.
- Total del pedido: se utiliza para calcular el neto del vendedor, no como base directa del 8%.

No se marca como error que la comisión sea anterior a descuentos: es la regla implementada. Debe conservarse y hacerse visible contractualmente; no cambiarla por intuición ni fijar el 8% en código como constante.

Mercur también admite reglas específicas y tasas fijas. Si se usan, la resolución es por línea, gana la mayor especificidad y, ante empate, la tasa más antigua. No había reglas específicas activas en la base inspeccionada.

### Recorrido de una venta

| Paso                  | Implementación inspeccionada                                                                                                    | Evaluación                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Preparar compra    | Medusa calcula carrito, ofertas, descuentos, impuestos y envíos.                                                                | Implementado.                                                 |
| 2. Iniciar pago       | Stripe TEST, captura manual: `capture:false`.                                                                                   | Implementado. Autorizar no equivale a cobrar.                 |
| 3. Crear pedidos      | Mercur divide el carrito por vendedor y conserva pago compartido.                                                               | Implementado, con protección de retries.                      |
| 4. Calcular comisión  | Se generan líneas de comisión desde datos backend.                                                                              | Implementado; histórico y redondeo defectuosos.               |
| 5. Capturar           | Operador captura el total de pedidos activos preparados; puede excluir cancelados. Registra captura y transacciones por pedido. | Implementado en el flujo financiero local.                    |
| 6. Liquidar vendedor  | Workflow nativo calcula `order.total − commissionLines` y crea transferencia.                                                   | Proveedor existente; falta circuito operativo local completo. |
| 7. Conservar comisión | Diferencia entre bruto correspondiente y transferencia.                                                                         | Demostrado en fixture; no garantizado de forma general.       |
| 8. Registrar costes   | Stripe conoce sus tarifas; no hay una fuente local consolidada para ingresos después de costes.                                 | Pendiente.                                                    |
| 9. Mostrar resultados | Detalle muestra asignado/capturado/reembolsable e historial.                                                                    | No muestra comisión original, earnings ni balances completos. |

El código impide claves live y varias validaciones exigen TEST/USD. **No basta con cambiar variables para habilitar dinero real.** La compatibilidad estructural debe cerrarse durante desarrollo; activar claves reales y verificar la configuración definitiva pertenece a la etapa posterior. No quitar protecciones TEST ni activar jobs como atajo para cerrar el hallazgo.

### Fuente de verdad actual

| Concepto                                | Fuente actual                                              | Limitación                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Total autorizado                        | Payment/PaymentCollection y PaymentIntent                  | No es venta cobrada.                                                                                                                |
| Total cobrado                           | Capturas Medusa y `PaymentIntent.amount_received`          | Debe atribuirse a cada pedido del grupo.                                                                                            |
| Subtotal, envío, impuestos y descuentos | Líneas, ajustes, impuestos y totales Medusa                | Son datos del pedido; no un snapshot financiero completo e inmutable.                                                               |
| Tasa aplicada                           | `commission_line.rate`, código y referencia a tasa         | Las líneas pueden reemplazarse.                                                                                                     |
| Comisión                                | `commission_line.amount`                                   | Puede tener fracciones de centavo y recalcularse.                                                                                   |
| Bruto asignado al vendedor              | `finance_allocation` / captura final                       | Se congela al operar financieramente; no representa todo el snapshot de la venta.                                                   |
| Neto transferido                        | `payout.amount` y Stripe Transfer                          | Posible diferencia por redondeo.                                                                                                    |
| Refund                                  | Refund Medusa, transacción negativa y journal              | Buena atribución al pedido dentro del flujo local.                                                                                  |
| Comisión devuelta                       | `commerce_operation.result.settlement.commission_returned` | Se registra en la rama posterior a liquidación.                                                                                     |
| Neto recuperado del vendedor            | Settlement/reversal y Stripe TransferReversal              | Implementado para transferencia atribuible y reconciliada.                                                                          |
| Revenue marketplace                     | No hay fuente consolidada                                  | No debe inferirse sumando pedidos o saldo Stripe.                                                                                   |
| Tarifas Stripe                          | Stripe                                                     | No se encontró consolidación local apta para reporting neto.                                                                        |
| Payout bancario                         | No demostrado por la tabla `payout`                        | En Mercur, ese registro representa una **transferencia al saldo conectado**, no necesariamente un ingreso en el banco del vendedor. |

El snapshot mínimo por venta debe conservar: moneda, componentes originales, descuentos, bases comisionables, tasa/tipo/regla, política aplicada, comisión redondeada, bruto y derecho neto del vendedor, asignación del pago compartido e identificadores de movimientos. Los refunds, reversals y costes deben añadirse como ajustes trazables.

No es necesario introducir un ERP o un sistema contable desproporcionado. Sí es necesario poder reconstruir estos importes sin consultar la regla comercial actual.

### Refund total y parcial

**Después de liquidar**, la implementación es especialmente cuidadosa:

1. Comprueba que la transferencia corresponde al pedido, vendedor, cuenta, moneda e importe.
2. Detecta transferencias huérfanas, duplicadas o reversiones desconocidas.
3. Persiste el plan.
4. Revierte primero la parte neta del vendedor.
5. Guarda la reversión.
6. Reembolsa al cliente mediante la primitiva nativa.
7. Registra transacción/crédito por pedido y verifica Stripe.
8. Si el resultado es incierto, conserva el bloqueo.

Para un bruto `G`, neto original vendedor `N` y refund acumulado `R`, calcula en centavos:

```text
comisiónDevueltaAcumulada(R) = redondear((G − N) × R / G)

comisiónDevueltaEnEsteRefund =
  comisiónDevueltaAcumulada(R + nuevoRefund)
  − comisiónDevueltaAcumulada(R)

netoVendedorRevertido =
  nuevoRefund − comisiónDevueltaEnEsteRefund
```

Esto evita que muchos refunds pequeños acumulen diferencias.

**Antes de liquidar**, se devuelve dinero al cliente y se registra su atribución al pedido, pero no se genera el mismo ajuste de comisión/derecho vendedor. No basta con liquidar posteriormente utilizando las líneas originales.

El refund actual es por importe, no por composición de artículos/envío/impuestos. Eso puede ser suficiente para devolver dinero, pero **no permite deducir automáticamente qué parte de un refund corresponde a mercancía, envío o impuestos**. Esa atribución debe definirse y persistirse para métricas detalladas.

Reembolsar no repone inventario ni acredita una devolución física. Esa separación es correcta. Cancelar sin captura puede liberar una autorización; no debe crear un refund ficticio. Cancelar una tienda no debe devolver el dinero asignado a otra tienda del mismo pago.

### Idempotencia: qué está resuelto y qué no

**Protecciones comprobadas:**

- UUID de solicitud y fingerprint: reutilizar una solicitud con otros datos se rechaza.
- Bloqueo por carrito y reserva duradera.
- Operaciones `processing`, `complete`, `uncertain`.
- Claves estables para captura final y reversión.
- Comprobación de saldos Stripe antes y después.
- Supresión del webhook de éxito correspondiente a la captura final local para evitar registrar otra captura.
- Reutilización del grupo de pedidos al repetir completion.
- Refrescos Connect que releen la cuenta y evitan reactivarla con un evento antiguo.

**Límites:**

- `order-edits` puede eludir la protección.
- No hay recuperación general de operaciones inciertas.
- No está cerrada la idempotencia integral de una liquidación normal con fallos entre transferencia, persistencia y enlaces.
- Las pruebas inspeccionadas no certifican todos los callbacks, disputas o movimientos externos posibles.

No se encontró evidencia de doble cargo o doble refund en los registros existentes. Eso no elimina los defectos anteriores.

## Validación cruzada con escenarios

### A. Venta con la comisión comercial observada

Supuestos explícitos: producto 100 USD, descuento de producto 5 USD, envío 10 USD, impuestos cero.

```text
Cliente:          100 − 5 + 10 = 105 USD
Base comisión:    100 USD
Comisión:         100 × 8% = 8 USD
Neto vendedor:    105 − 8 = 97 USD
Marketplace:      8 USD antes de tarifas Stripe
```

Las líneas nativas guardan comisión de 8 USD. El workflow nativo propone una transferencia de 97 USD.

**Falta demostrar** que una venta ordinaria recorre esa liquidación y queda reflejada íntegramente en los dashboards.

Si ya se transfirieron 97 USD:

| Operación                                | Cliente recibe | Se recupera del vendedor | Comisión devuelta |
| ---------------------------------------- | -------------: | -----------------------: | ----------------: |
| Refund parcial de 10 USD                 |          10,00 |                     9,24 |              0,76 |
| Refund posterior de los 95 USD restantes |          95,00 |                    87,76 |              7,24 |
| Total                                    |     **105,00** |                **97,00** |          **8,00** |

Es la política proporcional implementada, aplicada al bruto completo. No interpreta ese refund como “solo envío” o “solo producto”. Este escenario es un cálculo conceptual basado en código, no una venta nueva ejecutada.

### B. Precio habitual con centavos: defecto confirmado

La ejecución en memoria de `computeCommission()` con la tasa real devuelve:

```text
Producto:                 19,99 USD
Comisión nativa:            1,5992 USD
Payout interno:            18,3908 USD
Transferencia Stripe:      18,39 USD
Retención efectiva:        1,60 USD
```

**Backend/persistencia y Stripe no son idénticos en esa ruta de cálculo.** Además, `prepareSettlement()` pasa el payout por `financeAmount()`, que rechaza más de dos decimales. No se emitió esa transferencia para demostrar el defecto: se verificó la aritmética y la ruta de persistencia/conversión.

Este caso debe formar parte de la regresión de F02.

### C. Datos QA existentes: conciliación positiva, con alcance limitado

El fixture liquidado tiene:

```text
Bruto pedido:             12,00 USD
Base producto:            10,00 USD
Tasa QA:                 12%
Comisión:                  1,20 USD
Transferencia:            10,80 USD
```

Ese 12% es una regla de QA deshabilitada al inspeccionarla; **no es la tasa comercial vigente**. Su comisión equivale al 10% del bruto porque el envío no está incluido en la base.

Lectura de los registros:

```text
Refund 1:                 1,00
Reversal vendedor:        0,90
Comisión devuelta:        0,10

Refund/cancelación 2:    11,00
Reversal vendedor:        9,90
Comisión devuelta:        1,10
```

Stripe y persistencia coinciden en el total devuelto y revertido. Sin embargo, la línea de comisión original y el payout continúan existiendo: **sumar directamente esas tablas no equivale a revenue neto ni transferencias netas**.

### D. Cambio futuro de comisión

Una línea de 100 USD creada al 8% conserva inicialmente 8 USD. Si la tasa cambia y luego se ejecuta el refresh por una edición/devolución/evento admitido, se vuelve a resolver con las reglas actuales.

**No hay garantía de conservar los 8 USD originales como hecho histórico independiente.** No se modificó la tasa real para ejecutar este escenario; la conclusión proviene del código de refresh.

### E. Descuento con impuestos: error de presentación

Producto 100, descuento antes de impuestos 5, impuesto 10%, envío cero:

```text
Backend: 100 − 5 + 9,50 = 104,50
```

Medusa devuelve `discount_total=5,50`, incluyendo 0,50 de descuento fiscal. Carrito/confirmación muestran:

```text
100 − 5,50 + 9,50 = 104,00
```

El total mostrado sigue siendo 104,50. **El cobro no cambia, pero el desglose es inconsistente.** El resumen de cuenta ya contiene una solución coherente que puede reutilizarse.

## Hallazgos y estado por dominio

### 1. Storefront / cliente

Implementados registro/login, recuperación, Google/MFA, navegación, búsqueda con filtros y paginación, categorías, variantes, ofertas por vendedor, favoritos, carrito y pedidos.

Pendientes: **F05**, **F10**, **F11**. No se encontraron mocks operativos en estos recorridos.

No se considera obligatorio añadir cancelación o devolución autoservicio del cliente: ya existen operaciones desde vendor/admin y no se encontró un requisito que obligue a ese autoservicio.

### 2. Checkout y pagos

Existe checkout dirección→envío→pago, cobertura de envíos por vendedor, Stripe Elements, consulta del PaymentIntent existente y recuperación de completion.

La captura es manual y distinta de la autorización. Deben cerrarse **F05, F07 y F12**.

**NEEDS VERIFICATION:** nueva ejecución E2E de 3DS/retorno, abandono, sesión vencida y recuperación bajo fallos reales.

### 3. Pedidos

Existen pedidos divididos por tienda, detalle cliente, tracking, preparación parcial, envío, entrega, cierre y finanzas.

Bloqueador: **F04**. También debe quedar operable el tratamiento de autorización vencida y pedidos completados sin captura dentro de **F07**.

No se propone una nueva máquina de estados: deben preservarse las distinciones nativas entre logística y pago.

### 4. Vendor

Están conectados solicitud/aprobación, membresía, perfil, catálogo propuesto, moderación de cambios, imágenes, ofertas/precios, inventario, envíos y pedidos.

Faltan liquidación y explicación financiera de ventas/ganancias: **F07–F09**.

Registro genérico cerrado, catálogo compartido y almacén gestionado son decisiones existentes; no se marcan como funciones faltantes. No se exige aceptación/rechazo de cada pedido cuando el producto no ha definido ese flujo.

### 5. Admin

Existen autenticación, revisión de solicitudes/productos, tiendas, pedidos, tasa global y operaciones financieras.

Pendientes: **F08–F09**. Gestión de estados/logística desde el panel: **F13**, recomendada porque las APIs correspondientes ya existen.

No hay base para exigir ahora un módulo genérico de usuarios, atributos o configuraciones simplemente porque el menú anuncie superficies futuras. Las entradas deshabilitadas que anuncian “Próximo” no simulan una operación exitosa.

### 6. Stripe Connect

Hay alta/reanudación de onboarding, refresh y estados de cuenta. El backend restringe ventas según tienda y cuenta habilitadas.

**Cuenta activa no significa saldo disponible, transferencia realizada ni payout bancario.** Debe conservarse esa distinción en F07/F09.

### 7. Comisiones y flujo financiero

Es el área central de **F01–F03 y F07–F08**. La regla actual está comprobada; el ciclo económico completo todavía no.

### 8. Dashboards y métricas

Los dashboards activos muestran conteos operativos. El contador “pedidos” incluye pedidos sin captura; no pretende ser una cifra de ventas pagadas.

Pendiente **F09**. Analítica adicional: **F16**.

### 9. Inventario

Hay ownership, comparación de cantidad esperada, escrituras atómicas y bloqueos compartidos con reservas nativas. No es validación exclusivamente visual.

Existen pruebas y evidencia histórica de carreras PostgreSQL. **No se encontró un defecto de inventario confirmado independiente.**

Falta repetir las carreras relevantes en la regresión integral del código final: **F12**. Ver [README de inventario](../../packages/api/src/modules/inventory/README.md) y [QA Resend/inventario](../reports/vendor-qa-resend-inventory.md); no afirmar que nunca se hicieron pruebas reales.

### 10. Autenticación/autorización

Hay comprobación viva de membresía, tienda y roles; restricciones de recursos vendor y sesiones separadas.

Los problemas confirmados son **F05 y F06**. No se encontró un IDOR demostrado entre vendedores en los endpoints de pedido, fulfillment, inventario o imágenes revisados.

La explotación externa de los permisos Supabase sigue sin verificarse. Según Supabase, grants y RLS son capas diferentes: la autorización Medusa no sustituye esas restricciones. [Seguridad de Data API](https://supabase.com/docs/guides/api/securing-your-api).

Los informes históricos sobre revocación/reconstitución de bindings RBAC requieren contrastarse con la implementación vigente antes de declarar otra vulnerabilidad; no se sumaron como hallazgo confirmado.

### 11. Integraciones

Medusa/Mercur, Redis, PostgreSQL, Resend, Algolia y almacenamiento de imágenes tienen integración real y validaciones; no son simples dependencias declaradas.

No se verificó nuevamente entrega de correo, sincronización Algolia o almacenamiento externo durante la auditoría. Su prueba integrada pertenece a **F12**; dominios/remitentes definitivos y configuración de producción quedan fuera.

No arrancar Medusa o ejecutar seeders asumiendo que localhost implica infraestructura aislada: la configuración inspeccionada utilizaba servicios remotos y podía emitir correo real.

### 12. UX funcional

Hay confirmaciones, errores, loading y regiones `Suspense` locales en los flujos revisados.

Problemas concretos: **F10**, **F11** y la falta de salida operativa para estados inciertos **F08**. Esta auditoría no es una revisión estética.

### 13. Calidad técnica

Lint y tipos pasaron. Documentación y restos demo requieren **F14**; warnings y APIs internas, **F15**.

Los parches de dependencias están declarados en el workspace. Su existencia no prueba por sí misma una migración incompleta. No se encontraron stubs operativos `Not implemented` que justificaran otros hallazgos; las coincidencias de mocks/placeholders eran mayormente tests, UI de formularios o restos demo sin consumidor activo.

### 14. Tests

Resultados ejecutados durante la auditoría, no repetidos al persistir este documento:

| Área       | Lint              | TypeScript |          Tests |
| ---------- | ----------------- | ---------- | -------------: |
| Web        | PASS              | PASS       |       147 PASS |
| Admin      | PASS              | PASS       |        99 PASS |
| Vendor     | PASS              | PASS       |       138 PASS |
| API        | PASS, 50 warnings | PASS       |       858 PASS |
| Theme sync | —                 | —          |         8 PASS |
| **Total**  |                   |            | **1.350 PASS** |

Se usaron verificaciones sin emisión de TypeScript y sin caché para las suites correspondientes. Comandos efectivamente utilizados:

- Web: `pnpm --filter @usapeek/web lint`; `pnpm --filter @usapeek/web exec tsc --noEmit --incremental false`; `pnpm --filter @usapeek/web test` con `TSX_DISABLE_CACHE=1` en el proceso.
- Admin/vendor: `pnpm --dir apps/admin exec eslint . --no-cache` y equivalente vendor; `pnpm --dir apps/admin exec tsc --noEmit --incremental false` y equivalente vendor. Tests `tsx --no-cache --test` con la lista de archivos declarada en cada manifest; admin incluyó `tests/admin-smoke.test.mjs tests/*.test.ts`.
- API, desde `packages/api`: `pnpm exec tsc --noEmit --incremental false`; `pnpm exec eslint . --no-cache`; `pnpm exec cross-env TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules jest --silent --runInBand --forceExit --no-cache`. 68 suites y 858 tests.
- Tema: `pnpm --dir packages/theme-sync exec tsx --no-cache --test preference.test.ts`. Un intento inicial con un nombre de archivo inexistente no ejecutó tests; se corrigió el nombre y la suite indicada pasó.
- Se ejecutaron comprobaciones en memoria de los validadores de comisión y `computeCommission()`, sin escritura de tasas ni transferencias.

**No ejecutado:** builds, preparación de deployment ni integración destructiva de bases. Esos comandos generan archivos o mutan infraestructura y no correspondían a esta auditoría de solo lectura. Los builds históricos documentados no se presentan como una validación nueva. Los 858 tests API son la suite unitaria indicada, no un PASS nuevo de todos los scripts de deployment o HTTP.

Las pruebas existentes protegen, entre otros, settlement proporcional, atribución de refunds, captura final, middleware financiero, composición de hooks Mercur, retries de completion, ownership y concurrencia simulada. Falta probar integralmente las ramas enumeradas en F12.

## Dashboard mínimo y definiciones financieras

### Reglas comunes necesarias

Las métricas deben proceder del backend y utilizar:

- Una moneda por agregación; actualmente USD.
- Intervalos `[inicio, fin)` en una zona horaria de negocio definida.
- **Fecha efectiva del movimiento** para cobros, refunds, comisiones y transferencias.
- Capturas confirmadas, no simplemente pedidos `completed`.
- Refunds efectivos, excluyendo liberaciones de autorización.
- Ajustes separados: cancelar un pedido sin devolver dinero no debe borrar un cobro histórico.
- Separación entre compra/grupo y pedido de vendedor para evitar contar dos veces un pago compartido.

Los datos de QA y futuros datos live también necesitan separación explícita; no puede usarse el estado logístico como sustituto.

### MUST HAVE antes de cerrar desarrollo

Estas son definiciones propuestas para cerrar F09, **no métricas que ya estén funcionando**:

| Métrica                                | Fórmula / significado                                                               | Fuente necesaria y efecto de refunds                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Volumen cobrado**                    | Suma de capturas atribuidas a ventas, incluyendo envío e impuestos                  | Capturas + asignación por pedido. No desaparece por refund posterior.                                       |
| **GMV de mercancía cobrada**           | Productos efectivamente cobrados, después de descuentos, excluyendo envío/impuestos | Snapshot de componentes y asignación capturada. No usar `order.total` como sustituto sin cambiar el nombre. |
| **Pedidos pagados**                    | Pedidos de vendedor distintos con captura positiva                                  | Asignaciones de captura. Excluye autorizados sin captura. Mantiene histórico tras refund.                   |
| **Reembolsos efectivos**               | Suma de dinero devuelto al cliente en el período                                    | Refunds conciliados. Excluye autorización liberada.                                                         |
| **Volumen neto de cobros**             | Capturas del período − refunds efectivos del período                                | Libro de movimientos. Puede ser negativo si se devuelven ventas anteriores.                                 |
| **Gross Marketplace Commission**       | Comisión original atribuida a importes capturados                                   | Snapshot original; excluye pedidos nunca cobrados.                                                          |
| **Comisión revertida**                 | Suma de ajustes de comisión asociados a refunds                                     | Ajustes persistidos, antes y después de liquidación.                                                        |
| **Net Marketplace Commission**         | Comisión bruta − comisión revertida                                                 | No equivale todavía a beneficio después de costes.                                                          |
| **Resultado marketplace tras tarifas** | Comisión neta − costes Stripe atribuibles, ajustados por sus devoluciones           | Movimientos Stripe conciliados. Si faltan tarifas, mostrar “sin conciliar”, nunca cero inventado.           |
| **Vendor Earnings**                    | Bruto capturado del vendedor − refunds atribuidos − comisión neta                   | Mismo ledger, filtrado por vendedor autorizado. Incluye componentes que el modelo asigna al vendedor.       |
| **Transferido neto**                   | Transfers − reversals                                                               | Persistencia + Stripe, por vendedor/pedido.                                                                 |
| **Pendiente de liquidar**              | Derecho neto vendedor − transferido neto                                            | Si resulta negativo, representa importe por recuperar; no ocultarlo mediante un cero.                       |

Para **GMV neto de mercancía**, falta atribuir qué componente de cada refund corresponde a productos. Los refunds actuales por importe no permiten reconstruirlo con certeza. Debe fijarse una política de asignación persistida, sin que eso obligue a desarrollar ahora un sistema completo de devoluciones por artículo.

“Fondos disponibles” y “payout bancario realizado” requieren datos adicionales de Stripe. No deben calcularse como `Vendor Earnings` ni deducirse de una cuenta Connect activa.

Los stocks de saldo (derecho pendiente/transferido neto acumulado) se interpretan a una fecha de corte; no confundirlos con los flujos de movimientos de un período. Documentar ese contrato al implementar métricas, usando las mismas fuentes.

### NICE TO HAVE

| Métrica                       | Definición                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| AOV de compra                 | Volumen capturado / compras compartidas distintas capturadas. Si se usa pedido vendor como denominador, debe tener otro nombre explícito. |
| Tasa efectiva                 | Comisión bruta / base comisionable capturada; no mezclarla con comisión/GMV sin aclaración.                                               |
| Rankings vendedores/productos | Mercancía cobrada neta según atribución de refunds, usando la misma fuente financiera.                                                    |
| Comparación temporal          | Períodos equivalentes: 30 días frente a los 30 anteriores.                                                                                |
| Rango personalizado           | Útil cuando los filtros predefinidos ya funcionan y el negocio lo necesita.                                                               |

Para cerrar, basta un selector sencillo: hoy, últimos 7 días, últimos 30 días y mes actual. La comparación y el rango personalizado pueden esperar.

## Development Completion Checklist

Ordenada por dependencia. No incluye despliegue definitivo ni tareas puras de producción. Esta checklist conserva el diagnóstico inicial; el estado de ejecución vive en `development-progress.md`.

1. **[ ] F01 — Congelar la venta financiera original.** Tasa, base, componentes, comisión y derecho del vendedor; ajustes posteriores separados.
2. **[ ] F02 — Unificar redondeo.** Persistencia, transferencia y refunds idénticos al centavo.
3. **[ ] F03 — Validar reglas y reparto en backend.** Incluir límites, tasas fijas y comportamiento explícito ante ausencia/cero.
4. **[ ] F04 — Cerrar escritores que eluden la protección financiera.** Incluir o bloquear `order-edits`.
5. **[ ] F05 — Aislar carrito y comprobantes entre identidades.** Proteger también transición invitado→cuenta.
6. **[ ] F06 — Corregir permisos de acceso directo a tablas internas.** Verificar exposición y añadir regresión del esquema.
7. **[ ] F07 — Completar el recorrido operativo de liquidación.** Manual es suficiente; incluir refunds anteriores a transferencia, límites de captura y vencimientos.
8. **[ ] F08 — Completar recuperación general.** Conciliar antes de continuar pasos pendientes; conservar auditoría.
9. **[ ] F07 — Cerrar fuentes de costes y compatibilidad financiera.** Distinguir comisión, dinero vendor y tarifas; resolver las restricciones estructurales TEST sin activar pagos reales ahora.
10. **[ ] F09 — Exponer desglose financiero por pedido y vendedor.** Debe explicar los agregados.
11. **[ ] F09 — Implementar dashboards mínimos.** Capturas, refunds, comisiones, earnings y transferencias, con filtros consistentes.
12. **[ ] F10–F11 — Resolver catálogo truncado y desglose de checkout.**
13. **[ ] F12 — Ejecutar regresión integral aislada.** Checkout, pago, órdenes, inventario, sesiones, permisos y fallos intermedios.
14. **[ ] Verificar UX funcional bajo respuestas lentas y errores.** Solo regiones dependientes cargan; errores recuperables sin repetir movimientos.
15. **[ ] Ejecutar los checks de cierre del código resultante.** Lint, tipos, tests y builds cuando se autorice implementación.
16. **[ ] Confirmar ausencia de mocks operativos y conciliaciones pendientes en las pruebas finales.**

Las pruebas de cada P0 deben incorporarse junto a su futura corrección; no dejar toda la validación para el último paso.

## Definition of Done financiera

| Criterio                                            | Estado durante la auditoría                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Cada venta calcula correctamente la comisión        | **No completo:** redondeo y reglas inválidas pendientes.                                         |
| Utiliza exclusivamente datos confiables del backend | **Parcial:** cálculo server-side; permisos directos de DB pendientes.                            |
| Porcentaje asociado históricamente a la venta       | **No:** líneas reemplazables.                                                                    |
| Marketplace conserva exactamente lo correspondiente | **No garantizado:** ciclo general y centavos pendientes.                                         |
| Vendor recibe exactamente lo correspondiente        | **No garantizado:** liquidación general incompleta.                                              |
| Refund total                                        | **Demostrado en fixtures TEST; cierre general pendiente.**                                       |
| Refund parcial                                      | **Demostrado en fixtures TEST; cierre general pendiente.**                                       |
| Refund ajusta comisión                              | **Parcial:** rama posterior a liquidación sí; anterior incompleta.                               |
| Retries/webhooks no duplican movimientos            | **Parcial:** protecciones y pruebas existentes; falta cobertura integral y cierre de escritores. |
| Valores reconciliables con Stripe                   | **Demostrado para los registros inspeccionados; no como operación general.**                     |
| Admin muestra GMV                                   | **No.**                                                                                          |
| Admin muestra marketplace revenue                   | **No.**                                                                                          |
| Admin diferencia GMV de ingresos propios            | **No implementado; no hay cifras financieras falsas activas.**                                   |
| Vendor muestra ventas, comisión y ganancias         | **No.**                                                                                          |
| Métricas descuentan refunds correctamente           | **No hay agregaciones implementadas.**                                                           |
| Cambiar comisión futura preserva histórico          | **No garantizado.**                                                                              |
| Evidencia/tests de cálculos críticos                | **Parcial:** amplia suite y QA existente, con los huecos señalados.                              |

**Resultado: FAIL.** El PASS final se registrará con evidencia nueva en progreso; no se reescribe este resultado histórico.

## Debe completarse antes de cerrar desarrollo

**P0:** histórico de comisión, redondeo, validaciones financieras backend, protección de `order-edits`, aislamiento de carrito/cuentas y permisos de tablas internas.

**P1:** liquidación operativa completa, recuperación de resultados inciertos, dashboards financieros verificables, continuidad del catálogo, desglose monetario correcto y regresión integral reproducible.

El objetivo es poder demostrar una venta ordinaria —incluidos fallos y refunds— desde el comprador hasta el derecho y pago del vendedor, la comisión neta y su representación en los paneles.

## Puede esperar a después

**P2:** ampliar operaciones administrativas en UI cuando ya exista una vía soportada, limpiar documentación/restos demo y reducir deuda de warnings/APIs internas.

**P3:** rankings, AOV y comparativas avanzadas, rangos personalizados y automatización financiera sobre un flujo manual ya seguro.

**Etapa posterior de producción:** dominios, DNS, despliegue definitivo, observabilidad de producción, escalado, backups, configuración definitiva de remitentes y activación/verificación de credenciales live. Esas tareas no corrigen los bloqueadores funcionales identificados aquí.

## Referencias de continuidad

- [Flujo financiero por pedido](../order-finance.md).
- [QA de extensión financiera del 12/09](../reports/qa-order-finance-extension-2026-09-12.md): evidencia histórica de fixtures y recuperaciones excepcionales, no permiso para repetirlas.
- [QA de seguridad de pagos del 12/09](../reports/qa-payment-safety-2026-09-12.md).
- [Flujo logístico de pedidos](../orders-flow.md).
- [Documentación instalada Mercur 2.3.3: comisiones](../../node_modules/@mercurjs/docs/content/platform/commission/concepts/order-commission-lines.mdx).
- [Documentación instalada Mercur 2.3.3: liquidación](../../node_modules/@mercurjs/docs/content/platform/payout/concepts/payout-pipeline.mdx).
- [Plan por fases](development-implementation-plan.md).
- [Progreso/handoff entre sesiones](development-progress.md).

Las lecturas externas, estados TEST, conteos de pruebas y nombres de archivos corresponden al momento auditado. La siguiente sesión debe revalidar código, dependencias, entorno y permisos antes de usar esa evidencia para una modificación.
