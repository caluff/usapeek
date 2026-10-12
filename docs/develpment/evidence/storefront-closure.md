# Storefront closure — F05, F10, F11

Inicio: 2026-09-19; cierre de validación retomado el 2026-09-22. Rama de trabajo: `codex/storefront-closure`, desde
`516c4dc60cef6e25beee53e9e6ad5274a1a5af54`. Alcance autorizado: F05 (Phase 2/2B),
F10 (Phase 5/5A), F11 (Phase 5/5B). Sin cambios de dependencias, nuevas migraciones,
proveedores financieros ni despliegue. El overlay inicial de 102 archivos queda
fuera de los commits de esta tarea.

## F05 — Identidad del carrito y del comprobante

El límite de sesión común a contraseña, MFA, registro y Google adopta un carrito
invitado mediante el método nativo `store.cart.transferCart` antes de publicar la
sesión. Conserva el mismo carrito y su cookie ante fallos transitorios. Logout
elimina las cookies de carrito y comprobante. Un carrito invitado pendiente en
una sesión ya autenticada se adopta también antes de las acciones de checkout,
sin exigir logout. Si MFA ya consumió su desafío y falla la finalización, se
reinicia el acceso con un mensaje específico conservando el carrito.

El comprobante guarda `{ cartId, orderIds }`; el SDK envía el carrito de origen
en `x-marketplace-cart-id`. Los formatos antiguos fallan cerrados. El backend
comprueba el vínculo nativo `order_cart`, el carrito completado y su cliente;
un ID de pedido aislado no permite recuperar un comprobante invitado.

El backend valida al actor autenticado en lecturas y mutaciones de carrito,
opciones de envío, colecciones/sesiones de pago y lectura de pedidos. Las rutas
delegan en handlers/workflows nativos. Las actualizaciones, transferencias y
completion revalidan la propiedad bajo sus locks; una exclusión adicional por
carrito conserva esa propiedad durante los handlers HTTP y sus refetches. La
validación de completion compone el único hook existente, con los hooks de
Mercur cargados y contexto de actor de la petición, nunca del payload comprador.

Un email que coincide con una cuenta registrada sigue permitiendo checkout
invitado: se usa un cliente `has_account: false` independiente, sin grupos ni
perfil de la cuenta. Los wrappers conservan validadores, refresh de precios,
inventario y compensaciones nativos. No se modifican dependencias ni se añade
otro handler a un hook ocupado.

La revisión adicional identificó que validar únicamente el pedido raíz no basta
cuando `fields` permite recorrer relaciones inversas. Las proyecciones de
carritos, colecciones de pago, opciones de envío, pedidos, grupos y completion
usan un conjunto exacto de campos
seguros, con los datos requeridos por la cuenta y el comprobante. Los recorridos
hacia pedidos de otros compradores, por ejemplo `region.orders`, se rechazan
antes del handler nativo. Los permisos y filtros de listado nativos se conservan.
También se bloquean pivotes que una lista de nombres prohibidos no cubre, como
`customer.groups.customers.email`, `items.offer.seller.customers.email` y
`items.variant.product.reviews.order.email`. Se preservan los campos nativos y
los contratos explícitos que usa el storefront, sin depender de feature flags.

Se reprodujo la fuga con HTTP real antes de corregirla: el pedido propio y el
reintento de completion devolvían ID, email y dirección de otro comprador de la
misma región. La regresión final cubre además los listados de pedidos y grupos
y el detalle de grupo, con consultas legítimas de cuenta y comprobante.

Las cuatro rutas Store de transferencia de pedidos (`request`, `cancel`,
`accept`, `decline`) quedan explícitamente deshabilitadas por el límite de
producto acordado con el coordinador. No hay clientes en las aplicaciones que
las usen. El workflow nativo de solicitud permite solicitar un pedido ajeno y
su handler devuelve los datos del pedido antes de aceptar la transferencia.
La protección se ejecuta antes de ese flujo; la transferencia nativa del
**carrito invitado** permanece disponible y cubierta por pruebas.

Las validaciones existentes de vendedores y productos para sesiones de pago se
ejecutan dentro del lock de identidad, después de comprobar otra vez al comprador
y antes del handler nativo. Esto impide que una petición que perdió la propiedad
avance a esos controles o al proveedor. Una suite específica comprueba los dos
rechazos de disponibilidad, el cambio de comprador y la delegación exitosa.

Los locks de identidad y de email invitado no tienen TTL: una operación lenta o
su compensación no puede perder la exclusión a mitad del trabajo. Usan un
propietario UUID: el lock HTTP se libera en `finally` y el de email mediante los
steps nativos de liberación/compensación. Un timeout de adquisición devuelve
conflicto sin repetir la mutación. Si muere el proceso, la recuperación operativa
de un lock huérfano requiere verificar primero que ese propietario ya no ejecuta
la operación. No se implementó una liberación automática por tiempo.

Diagnóstico y recuperación operativa, si se observa ese conflicto persistente:

1. Las claves lógicas se definen en
   `packages/api/src/api/store/cart-ownership/route-guard.ts`
   (`store-cart-owner:<cartId>`) y
   `packages/api/src/workflows/store-cart-ownership.ts`
   (`guest-cart-customer:<sha256 del email normalizado>`). El proveedor Redis
   instalado usa el prefijo `medusa_lock:` con la configuración actual. Inspeccionar
   únicamente el valor UUID y TTL de la clave afectada; un TTL -1 es esperado y
   no demuestra que el lock sea huérfano. No registrar el email en claro.
2. Detener nuevos intentos sobre el recurso e investigar la petición/workflow y
   su compensación en todas las instancias. El UUID no incluye PID ni prueba por
   sí solo que el dueño murió. Si no se puede acreditar que ninguna instancia
   continúa la operación, no liberar el lock; coordinar una ventana de mantenimiento
   con las instancias detenidas y revisar cualquier ejecución pendiente.
3. Solo tras esa comprobación, liberar la clave lógica exacta mediante
   `container.resolve(Modules.LOCKING).release(key, { ownerId })`, con el UUID observado. El proveedor
   instalado compara el propietario y elimina atómicamente; si ya cambió, no
   libera al nuevo dueño. No usar borrados por prefijo, `releaseAll`, `FLUSHDB`
   ni reintentos automáticos de la mutación. Verificar el estado del carrito antes
   de permitir el reintento normal.

Este procedimiento se contrastó con la implementación instalada de
`@medusajs/locking-redis` 2.18.0; no se ejecutó una recuperación de producción ni
se añadió una herramienta operativa que pueda borrar locks.

La suite HTTP opt-in usa el runner Medusa completo con PostgreSQL/Redis TLS
desechables y correos `.invalid`; bloquea configuración de proveedores externos
antes de registrar hooks. Sus fixtures de pedidos usan workflows y vínculos
nativos, no pagos. Una línea personalizada de precio cero comprueba retención
sin acreditar el ciclo de inventario/precio de una oferta comprable.

## F10 — Continuación del catálogo

El catálogo mostraba sus primeros 12 productos sin un camino explícito para
recorrer el resto. Ahora pagina el mismo endpoint nativo con `limit: 12`, offset
validado y orden único explícito `id`, conservando categoría y región. Mantiene
los productos publicados sin ofertas: su continuidad no depende del índice de
búsqueda, cuya política comercial es diferente. Una página fuera de rango
permite volver a la última disponible. Los enlaces de búsqueda también conservan
consulta, categorías, vendedores, precios y orden al paginar o recuperar rango.

No se añadieron datos de catálogo fijos ni otro endpoint. El contenido conserva
los límites locales de Suspense y los estados de carga, vacío y error. La
paginación por offset tiene orden estable para un catálogo sin cambios; no
constituye un snapshot transaccional entre páginas si se insertan o eliminan
productos concurrentemente.

Verificación ejecutada:

- Pruebas incluidas en el gate web: el SDK real con transporte simulado recorre
  31 productos sin ofertas en páginas de 12, 12 y 7, sin omisiones; verifica
  offsets 0/12/24, categoría, región, orden, página 999 recuperada a 3 y reintento.
- Navegador de la versión final, verificado por el coordinador sobre los mismos
  commits F10/F11 integrados en `develop`, con Next en 3108 y API simulada en
  9108: PASS. Páginas 1/2/3 muestran 1–12, 13–24 y 25–31; página 999 recupera
  página 3 conservando categoría. Error 503 local y reintento conservan página 2
  y categoría; el estado vacío permanece local.
- Respuesta demorada 5 segundos: encabezado, navegación, hero y pie visibles
  mientras carga la grilla; después aparecen los productos. Móvil de 390 px
  estable y sin errores de consola observados.
- Reproductor local fuera del repositorio:
  `C:/Users/dcalu/.codex/tmp/marketplace-closure-20260919/f10-fixtures.mjs`.
  No forma parte del código de producción.

La prueba de navegador usa una API simulada: **no acredita un E2E con Medusa o
Algolia reales**.

## F11 — Desglose de descuentos e impuestos

Carrito/checkout y comprobante descontaban `discount_total` del subtotal mientras
mostraban `tax_total`, que ya contiene el impuesto después del descuento. Ahora
la fila usa `discount_total - discount_tax_total`, igual que el desglose existente
de cuenta. Se preservan `total`, impuestos, moneda y unidades nativas de Medusa;
no se recalculan pagos ni se modifica el backend.

Si el redondeo independiente de las filas deja una diferencia frente al total
nativo, se muestra `Ajuste por redondeo` con la precisión de la moneda. Solo se
aplica cuando la suma de los importes sin redondear concilia con ese total: no
oculta cargos faltantes ni discrepancias reales. Checkout espera a tener envío
e impuestos resueltos. Comprobante y cuenta incluyen créditos una vez y separan
el reembolso informativo.

Verificación ejecutada:

- Pruebas incluidas en el gate web: renderizan los tres componentes reales de
  carrito/checkout, comprobante y cuenta con fixtures controlados; comprueban
  importes visibles, suma y ausencia de mutación de datos.
- Caso principal: productos 100, descuento total 5.50, impuesto del descuento 0.50,
  impuesto final 9.50 → descuento visible 5 y total nativo 104.50.
- Caso fraccionario: productos 9.090909, descuento neto 0.9454545 e impuesto
  0.8145454 → filas 9.09 − 0.95 + 0.81 + ajuste 0.01 = total nativo visible 8.96.
- Casos adicionales: ajuste negativo, envío fraccionario, créditos, reembolsos,
  monedas de cero/tres decimales, cargos pendientes, discrepancias reales,
  descuento de productos/envío gravados y campos opcionales omitidos.

El coordinador comprobó además en navegador carrito, checkout, comprobante y
detalle de cuenta: los casos 104.50 y 8.96 concilian en los cuatro resúmenes,
incluido el ajuste de 0.01. Comprobante móvil de 390 px sin desbordamiento ni
errores de consola. Esta verificación usa API y sesión de cuenta simuladas y no
acredita autenticación, un cobro Stripe TEST ni una compra E2E. El registro
independiente del coordinador está en
[storefront-browser-20260922.md](./storefront-browser-20260922.md).

## Checks web compartidos

Sobre los cambios F05/F10/F11 presentes en este worktree:

- `pnpm lint:web`: PASS.
- `pnpm typecheck:web`: PASS.
- `pnpm test:web`: PASS, 186/186 pruebas.

Los primeros intentos paralelos de lint/test no alcanzaron los checks: pnpm 12
intentó actualizar el mismo árbol de dependencias y Windows rechazó el acceso
concurrente. Los mismos comandos se repitieron en serie y finalizaron bien.
No se modificó el lockfile ni se trasladó el almacén para resolverlo.

## Integración HTTP F05

Ejecución final del 2026-09-22:

```powershell
. 'C:/Users/dcalu/.codex/tmp/marketplace-closure-20260919/infrastructure/Import-ClosureTestEnvironment.ps1'
$env:CART_OWNERSHIP_TESTS = 'disposable-local'
pnpm --dir packages/api test:integration:http --runTestsByPath integration-tests/http/cart-ownership.spec.ts
```

Resultado: **22/22 PASS**, runner Medusa real. Cubre separación A/B/invitado,
transferencia legítima conservando carrito, validación nativa, compensación y
reintento, cinco carreras que pierden la propiedad tras una transferencia real,
email invitado coincidente con una cuenta, comprobantes y carrito completado,
cinco superficies de proyección de pedidos, las cuatro acciones de transferencia
de pedidos, proyección de carrito y proyección de pagos/envíos sin efectos.

El importador verificó identidad de contenedores, etiquetas, CA y puertos locales.
Las conexiones TLS a PostgreSQL en 55432 y Redis en 56379 pasaron `SELECT 1` y
`PING` antes del runner. La suite usó bases aleatorias `cart_owner_test_*`, aplicó
las migraciones existentes y sincronizó vínculos en esas bases desechables. No
creó migraciones ni ejecutó migraciones sobre bases compartidas o de producción.
Redis DB15 quedó liberado al terminar para la validación conjunta del coordinador.

Registro externo:
`C:/Users/dcalu/.codex/tmp/marketplace-closure-20260919/f05-http-final.log`.
El teardown emitió mensajes de conexiones cerradas y Jest finalizó con
`--forceExit`, según el script existente; la suite terminó con código 0. Estas
pruebas no acreditan cobros, inventario de ofertas compradas ni autenticación
MFA/Google en navegador. Los cambios de sesión web están cubiertos por pruebas
con SDK simulado, incluidos fallo transitorio y desafío MFA ya consumido.

## Checks API y preservación del trabajo previo

- `pnpm typecheck:api`: PASS.
- `pnpm lint:api`: PASS, 0 errores y 55 advertencias. Cinco corresponden a
  convenciones de nombres de los nuevos workflows/step de ownership; las demás
  pertenecen al código previo. No se aplicaron correcciones automáticas generales.
- `pnpm test:api`: PASS, 77 suites, **969/969 pruebas unitarias y 3/3 de
  preparación de despliegue**. La prueba previa de composición de envíos había
  agotado 30 segundos en dos intentos; la ejecución completa final la superó en
  9.75 segundos sin modificar su fuente.
- `pnpm build:api`: PASS. Compilación del backend con configuración efímera del
  entorno local y proveedores externos deshabilitados; el comando nativo usa
  `skipDbConnection`. El Admin embebido queda deshabilitado según la configuración
  existente. No se inició un servidor, se migró una base ni se desplegó el resultado.
- Las nueve suites unitarias específicas de ownership/proyección están incluidas
  en ese gate. Cubren composición con los hooks Mercur instalados, inventario de
  rutas nativas, contratos reales de campos y bloqueo durante handlers lentos.
- Manifiesto inicial comprobado por SHA256 después de la integración HTTP:
  **102/102 archivos idénticos**, ninguno incluido en el índice de este cambio.

Los fallos intermedios de integración y fixtures se corrigieron y volvieron a
comprobar. La prueba previa que reprodujo la fuga de pedidos falló en sus dos
casos antes de añadir la protección. Los registros externos quedan en
`C:/Users/dcalu/.codex/tmp/marketplace-closure-20260919/`; no se versionan datos
de ejecución ni credenciales.

La suite completa corrió sin `.medusa/server/src` presente, por lo que no contó
pruebas compiladas. Después se aplicó en este worktree únicamente la regla
`testPathIgnorePatterns` del commit coordinador `ef2ff9f`, para excluir esas copias
en futuras ejecuciones después del build. Ese cambio pertenece al coordinador y
queda fuera de los commits de storefront.

## Entrega al coordinador

Commits propios en `codex/storefront-closure`, en orden:

| Commit | Cambio |
| --- | --- |
| `cb47021` | Continuación inicial y conservación de filtros de búsqueda. |
| `e447c48` | Descuento sin su componente de impuesto. |
| `86021e1` | Contrato final de catálogo: paginación nativa que conserva productos sin ofertas. |
| `658e6bd` | Conciliación visible según precisión de moneda. |
| `fb520b7` | Sesión, adopción del carrito y comprobante ligados al comprador. |
| `236ffca` | Ownership backend, proyecciones seguras y regresiones HTTP/unitarias. |

El coordinador confirmó la integración de F05 en `develop` como `90a1f12` y
`8af1f08`, conservando sus middlewares de comisiones, y volvió a pasar lint,
tipos y las 186 pruebas web. F10/F11 ya estaban integrados y cuentan con la
verificación visual enlazada arriba. Los gates conjuntos de API y F12 siguen
bajo responsabilidad del coordinador; este documento no los declara aprobados.

Sin push, despliegue, cambios de proveedores ni nuevas migraciones. El cierre
de esta tarea no acredita compra comercial completa, Stripe TEST efectivo ni
Financial Readiness. El diagnóstico de locks anterior es un límite operativo
que debe conservarse al integrar.

## F05 — Correcciones durante QA nativo del 2026-09-22

El QA real detectó que guardar la dirección rechazaba un carrito válido US/USD.
La comparación HTTP con el SDK instalado y un carrito de subtotal 39.98 confirmó:
`CART_FIELDS` conserva moneda y total; `${CART_FIELDS},customer_id` omite esos
campos nativos; `${CART_FIELDS},+customer_id` conserva `currency_code: usd`,
`total: 39.98` y los países de la región. El commit fuente `f81e1ab` corrigió las
dos consultas de `currentCart`, lectura y adopción autenticada. La selección
explícita usada al editar cantidades sigue siendo reducida y la guarda US/USD
permanece intacta. Cinco regresiones ejecutan la función real contra el parser
y proyector Medusa instalados; antes fallaban los casos de invitado y adopción,
y después pasaron. Lint, tipos y **191/191 pruebas web PASS**.

Un repro independiente con React 19.2.8 y StrictMode, montando `AddressStep` y
`UsPhoneInput`, acreditó otro defecto: leer `event.target.value` dentro del
updater diferido puede perder el correo cuando el elemento cambia antes de
procesar la cola. Antes del cambio, el nombre quedaba como QA y el correo vacío;
después, ambos valores se conservaron. `61ff9cd` captura el texto de
`event.currentTarget.value` durante el evento para correo, dirección y provincia,
y evita crear otro estado para valores idénticos. Dos regresiones cubren valores
capturados, conservación conjunta de teléfono/correo y actualizaciones sin cambio.
`7ddc65b` completa el ajuste de tipos del harness. Gates finales sobre ambos
commits: **lint:web PASS, typecheck:web PASS y test:web 193/193 PASS**.

El coordinador confirmó visualmente, en una pestaña nueva del QA nativo, que
correo y teléfono ficticios persistían. Guardar la dirección pasó mediante HTTP
real y navegó a `/checkout?step=shipping`; se seleccionaron y guardaron dos envíos
de 5, con total 49.98. No se observaron nuevos errores `Maximum update depth`
en ese retest. El error anterior del teléfono sí existió en los logs; no se
modificó `UsPhoneInput` ni se declara resuelto todo posible ciclo de su librería.
Las lecturas AX/evaluate que devolvían vacío mientras la captura mostraba el texto
no se usan como evidencia de pérdida del valor.

Integración de formulario/prueba: root `45f96ec` + `87e4507`, QA `c7be53e` +
`ffb3720`. Los logs `f05-action-fields-*` y `f05-address-state-*`, y el repro
`f05-phone-repro/repro.cjs`, permanecen en el directorio temporal común. El renderer
se instaló únicamente en ese directorio externo; no cambió dependencias del repo.
El overlay conserva **102/102 hashes originales**. Esta tarea no hizo escrituras
directas de datos ni editó API, Stripe, migraciones o primitivas compartidas. El estado de Connect y
la prueba de pago continúan en la evidencia global del coordinador:
[native-checkout-browser-20260922.md](./native-checkout-browser-20260922.md).

## F05 — Estado del pago en el comprobante, 2026-09-26

El coordinador reportó una compra de prueba autorizada con captura manual y dos
pedidos de 24.99 cuyo comprobante mostraba «Sin pagar». La revisión de fuentes
confirmó que `getPaymentStatusLabel` sólo devuelve esa etiqueta para `not_paid`;
su fallback es «Estado por confirmar». La proyección segura permite los campos
nativos de pago y no elimina campos válidos.

El defecto estaba en las delegaciones F05 de `GET /store/orders` y
`GET /store/orders/:id`: usaban los handlers Medusa en lugar de los de Mercur.
En Mercur 2.3.3, la colección compartida permanece en el carrito; los pedidos
divididos no tienen un enlace directo a ella. El workflow Medusa obtiene
`payment_collections: []` y calcula `not_paid`. Los handlers Mercur instalados
ya incorporan `cart.payment_collection`, normalizan `payment_collections`,
recalculan el estado y eliminan `cart` de la respuesta. Esto coincide con la
documentación instalada `@mercurjs/docs/content/learn/order-groups.mdx`.

La corrección cambia únicamente los dos imports de producción. Conserva la
autorización del comprobante, el filtro por cliente del historial, la exclusión
de borradores, la paginación y la validación exacta de campos. No crea enlaces
order/payment_collection ni amplía los campos que puede solicitar el cliente.

La nueva suite `store-order-payment-status.unit.spec.ts` ejecuta los handlers y
el normalizador reales, sustituyendo sólo los workflows que consultan datos.
Cubre autorización compartida con campos predeterminados y selección explícita,
dos pedidos en el historial, conservación de pedidos con pago directo y rechazo
de expansiones hacia otros compradores. Antes del cambio fallaron seis de diez
casos; los cuatro casos de rechazo de campos ya pasaban. Las pruebas de
delegación de `order-projection.unit.spec.ts` apuntan ahora al handler Mercur.

Gates ejecutados en este checkout: `pnpm typecheck:api` PASS, `pnpm lint:api`
PASS con 0 errores y las 55 advertencias previas, `pnpm test:api` PASS con
**78 suites, 979/979 pruebas unitarias y 3/3 de despliegue**, y `pnpm build:api`
PASS. El primer intento de build se detuvo por ausencia de `DATABASE_URL`;
el definitivo usó configuración efímera ficticia, proveedores deshabilitados y
el `skipDbConnection` del comando nativo, sin archivo `.env`. No se modificó
ningún frontend ni dependencia. El overlay conserva **102/102 hashes**.

El estado normalizado sigue representando la colección compartida según el
contrato nativo. Este cambio no introduce un cálculo de asignación financiera
por vendedor. El retest HTTP/visual del comprobante existente corresponde al
coordinador; esta tarea no accedió a la API 9010, Redis DB 15 ni Stripe, ni ejecutó
migraciones o escrituras de datos. Los logs locales `f05-order-payment-*` quedan
en el directorio temporal común.
