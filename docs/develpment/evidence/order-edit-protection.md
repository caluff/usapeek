# F04 — Protección de ediciones nativas

Fecha: 2026-09-19. Implementación local, regresión unitaria e integración HTTP con persistencia y autorización nativa verificadas.

No hay consumidores activos de `order-edits` en los paneles. Las rutas nativas podían modificar pedidos, reservas y colecciones fuera del bloqueo financiero, y las ediciones libres también podían invalidar asignaciones originales. Se deshabilitan sus mutaciones para pedidos marketplace, conservando el flujo nativo de pedidos sin grupo marketplace.

`order-finance-middlewares.ts` incluye ahora `order-edits` en el matcher POST/DELETE. La creación resuelve `body.order_id`; las subrutas usan el parámetro como **order ID**, tal como lo hacen los handlers instalados de Medusa 2.18/Mercur 2.3.3. No se interpreta como `order_change`. La pertenencia se consulta con `order_cart → order_group`, sin caché. Se rechaza sin tomar/alterar reservas del journal, tanto con grupo libre como con operación pendiente o conciliación.

El cambio no registra hooks ni sustituye validación, autenticación, RBAC o ownership nativos. Las acciones de finanzas dedicadas y los writers logísticos conservan su flujo. Entradas inválidas sin ID siguen llegando a validación nativa.

La regresión prueba las 11 combinaciones de método/ruta bajo cada prefijo admin/vendor, el matcher registrado, el ID real consultado, normalización/codificación, grupos ocupados, no-marketplace y ausencia de mutación. Suite:

```sh
pnpm --filter @usapeek/api test:unit --runTestsByPath src/lib/order-finance/__tests__/middlewares.unit.spec.ts
```

Resultado: **47 tests PASS** (incluyen regresiones previas de writers financieros). Son pruebas unitarias con query/journal simulados; no prueban todavía el orden efectivo de middlewares ni autorización HTTP del sistema integrado.

## Integración HTTP real

`integration-tests/http/order-edit-protection.spec.ts`, con PostgreSQL/Redis TLS desechables y todos los proveedores externos deshabilitados:

```powershell
$env:ORDER_EDIT_PROTECTION_TESTS = 'disposable-local'
pnpm --filter @usapeek/api test:integration:http --runTestsByPath integration-tests/http/order-edit-protection.spec.ts
```

Resultado final: **6 PASS**. La matriz de 11 rutas × admin/vendor × grupo libre/reservado/en revisión verifica **66 rechazos HTTP 400 `not_allowed`** y conserva el snapshot SQL de 13 tablas, incluidos pedidos, dos reservas, dos comisiones, una colección compartida y journal. Se usan autenticación, RBAC, pasos y enlaces nativos, sin simular la capa HTTP.

Anónimo recibe 401. El guard marketplace rechaza uniformemente también a un admin de lectura y un vendor ajeno, antes del RBAC específico. Los controles positivos sin grupo prueban que el flujo nativo sigue activo: admin sin permiso recibe 403; vendor ajeno recibe 404 en creación/eliminación; admin y propietario crean y cancelan una edición con 200. Typecheck API posterior: PASS.

La suite posee y elimina únicamente su base/plantilla aleatoria. No ejecuta pagos ni toca datos compartidos. Pendiente la regresión conjunta después de integrar los cambios de identidad y snapshot financiero; estos resultados corresponden al hito F04 sobre `develop` anterior a esa integración.
