# Phase 1 — Financial Foundation (F01–F03)

Fecha: 2026-09-19. Rama: `codex/financial-foundation`, base `516c4dc60cef6e25beee53e9e6ad5274a1a5af54`.

## 1A — Defectos reproducidos

`pnpm --filter @usapeek/api test:unit --runTestsByPath src/lib/order-finance/__tests__/commission-native-defects.unit.spec.ts`: **14 PASS** contra el algoritmo, validadores y workflows instalados de Mercur 2.3.3. Repositorios/proveedor simulados; sin PostgreSQL ni llamadas Stripe.

- USD 19,99 al 8% produce comisión nativa 1,5992 y entrada de payout 18,3908.
- Un refresh posterior al cambio 8→12 elimina la línea original y crea otra de 2,3988.
- Sin regla se devuelve una lista vacía; schemas, workflows y cálculo nativos aceptan tasas negativas, cero, >100% y fijos negativos.

El 8% es exclusivamente un dato de prueba; la implementación resuelve reglas configuradas. No cambia la base anterior a descuentos.

## Contrato de salida

La fuente estable es `lib/order-finance/snapshot.ts`, esquema `OriginalSale`, persistida en `commerceAutomation.finance_sale_snapshot` con clave igual al pedido. Guarda grupo, carrito, vendedor, moneda USD, versión/política, componentes originales, anclas, base, tipo, tasa, código/ID/reglas, flags de impuestos/envío, comisión redondeada, bruto y derecho vendedor. La asignación conserva colección y sesión de pago; el pago nace inmediatamente después y sus movimientos mantienen sus propios identificadores. Los lectores comprueban que pertenece a la sesión congelada.

El hook síncrono nativo `beforePaymentAuthorization` crea el original y las líneas antes de autorizar el pago. El cálculo y los metadatos de reglas se leen mediante el resolutor Mercur en una transacción `REPEATABLE READ`. Los reintentos con original completo lo reutilizan. La compensación de checkout descarta exclusivamente inserciones propias si la venta aborta.

La comisión se cuantiza a centavos USD antes de persistir: suma por pedido, half-up, residuos por mayor fracción y empate por ancla estable. Las líneas pequeñas pueden recibir cero centavos por esa distribución; sus **tasas y la comisión total del pedido siempre son positivas**. USD 0,01 al 8% se bloquea porque redondea a comisión total cero. Los importes de pago/reparto deben ser USD exactos, no negativos y seguros; una colección o bruto fraccionario no compatible se bloquea para revisión, sin inventar una asignación nueva.

Los updates de reglas se validan sobre el estado completo, también por workflow directo. Porcentajes admitidos `(0,100]`; fijos positivos y precisos con moneda explícita. El reparto original rechaza comisión superior al bruto; no impone un límite fijo por subtotal cuando otros componentes financian el reparto.

Las líneas nativas quedan insert-only y los refresh sin originales se bloquean. El original JSON rechaza UPDATE en PostgreSQL. Legacy sin snapshot completo se conserva, pero captura/refund/cancelación y payout quedan bloqueados para conciliación; no se consulta la regla actual para inventar historia.

Refunds y reversals permanecen como operaciones/ajustes separados en el journal existente. La política original es proporcional acumulativa sobre bruto; `proportionalSettlement` agota exactamente comisión y derecho originales. La persistencia del ajuste anterior a transferencia y el circuito operativo de liquidación corresponden a Phase 3.

## Compatibilidad nativa

La extensión local de comisión reutiliza modelos, migraciones y resolución nativos. El hook de nacimiento existe en runtime Mercur 2.3.3 aunque falta en su tupla TypeScript; un test de composición protege ese límite. Un parche mínimo expone `createPayoutWorkflow.hooks.validatePayout` antes del proveedor. Su handler verifica original, identidad, precisión y derecho; bloquea ajustes/operaciones pendientes que Phase 3 debe conciliar. No activa jobs, proveedores, monedas ni modo live.

## Verificación

- `pnpm install --frozen-lockfile`: PASS. Overlay de 102 archivos copiado y verificado antes de trabajar.
- `pnpm --filter @usapeek/api exec medusa db:generate commerceAutomation`: PASS; `Migration20260919221631.ts` y snapshot de esquema.
- `pnpm --filter @usapeek/api db:migrate`: PASS en `closure_sandbox`, PostgreSQL local TLS aislado preparado por coordinador. Ninguna migración remota.
- Regresión extensión: 9 fallos esperados contra el sujeto nativo antes de corregir; 30 pruebas enfocadas PASS con la extensión.
- `pnpm test:api`: **943 unitarios PASS, 72 suites; 3 pruebas de empaquetado PASS**. Incluye fixtures financieros, validación y conservación de líneas, carga conjunta de hooks Mercur/locales, orden del hook antes de autorizar, compensación tras fallo de autorización y guard de payout antes del proveedor. Son workflows nativos reales con I/O simulado.
- Snapshot/lectura/hooks enfocados: **49 PASS**, incluidos total cero, líneas pequeñas con reparto positivo y sesión de pago equivocada.
- `pnpm lint:api`: PASS; el build final vuelve a ejecutar lint con **0 errores y 50 warnings existentes**. Se corrigió el warning añadido en lectura financiera.
- `pnpm build:api`: PASS con configuración efímera del importer local y proveedores externos deshabilitados. Un primer intento sin importer falló por `DATABASE_URL` ausente; no se omitió la validación de configuración.
- La primera integración obtuvo 5 PASS / 4 FAIL por aserciones de errores serializados y una expectativa desactualizada de límite por componente; corregidas. Segunda ejecución: **9 PASS**, 38 segundos, en PostgreSQL/Redis locales TLS, mediante `FINANCIAL_FOUNDATION_TESTS=disposable-local pnpm --filter @usapeek/api test:integration:http --runTestsByPath integration-tests/http/financial-foundation.spec.ts` después del importer. El runner crea/migra/restaura/elimina sus propias bases aleatorias; Redis DB15 se reservó sin otras suites simultáneas.
- La integración usa autenticación y RBAC reales para POST admin de creación/actualización de comisiones. También comprueba SQL inmutable/idempotente, refresh nativo 8→12, reparto multivendor y workflow de congelación/reintento con Query graph y links reales. Sus pedidos/colecciones/sesiones son fixtures nativos; **no es checkout HTTP completo**. Los refunds acumulativos comprueban la política contra el original persistido; no ejecutan refunds del proveedor.
- `pnpm typecheck:api`: PASS después del build/codegen. La proyección de los fixtures HTTP se valida con un esquema derivado del contrato existente para resolver la nulabilidad de Query graph sin casts ni defaults.

Stripe TEST efectivo, transferencias, refunds remotos y navegador: **no ejecutados**. Las pruebas de proveedor están simuladas o usan exclusivamente el proveedor local de Medusa. El circuito financiero completo y Financial Readiness permanecen pendientes de las fases posteriores.

## Alcance y preservación

Sin push, merge ni cambios UI, F04, F05, F06 o progreso global. El control SHA256 final conserva exactamente 101 de los 102 archivos del overlay; el único delta autorizado es el hash del parche Mercur en tres posiciones del lockfile. Lockfile permanece sin commit; el coordinador integrará únicamente ese cambio mediante pnpm: `0bf4fb78b23ed0824482b81937125301cd0b1396fe3ee34ca490985383cc1709` → `82c2c4800dbcbb6f246135dfe1242a15be5b7ba78d192ded4ab96ed223406a5a`. No cambiaron versiones ni dependencias. No se copiaron credenciales ni `.env` remoto.

## Revisión P2 — actualizaciones superpuestas

Se reprodujo un fallo de composición: sobre una regla fija USD 1, un lote con `type: percentage` y después `value: 101` sobre la misma regla validaba cada entrada contra el estado anterior. Cuatro regresiones fallaron antes del cambio: selector/selector, selector/ID, ID/selector e ID/ID.

La validación ahora acumula los IDs efectivos resueltos dentro de la transacción serializable y rechaza cualquier repetición antes de invocar la mutación nativa. Los lotes con reglas distintas siguen admitidos. No cambia la resolución nativa de selectores ni incorpora escrituras parciales.

- Extensión: 35 pruebas enfocadas PASS, con las cuatro regresiones y un lote válido disjunto.
- Integración PostgreSQL/HTTP: **10 PASS**, 30 segundos, con guardas del entorno aislado y reserva exclusiva de Redis DB15. La nueva prueba comprueba rechazo y persistencia intacta mediante módulo real y workflow nativo, además del lote disjunto exitoso. Esta ejecución también verifica la proyección de fixtures añadida tras el codegen anterior.
- `pnpm typecheck:api`, `pnpm lint:api` y `pnpm build:api`: PASS; 0 errores y los mismos 50 warnings de lint. Empaquetado: 3 PASS.
- En este worktree Windows, `pnpm test:api` después de un build descubrió también copias JS bajo `.medusa/server`; se interrumpió tras fallos de esas copias al resolver rutas relativas de parches. La verificación de fuentes se ejecutó con `pnpm --filter @usapeek/api test:unit --testPathIgnorePatterns '\.medusa'`: **948 PASS en 72 suites**, sin modificar la configuración compartida de Jest ni contar los duplicados.
