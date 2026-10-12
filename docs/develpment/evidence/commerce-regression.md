# Regresión F12: carrito e inventario reales

## Alcance

Subtarea coordinada con la tarea raíz de cierre F01–F12. Regresión y correcciones;
no certifica Phase 6, checkout Stripe ni Financial Readiness. No crea pedidos,
pagos, capturas, reembolsos, liquidaciones o transferencias.

Base de implementación: `ef2ff9f`, rama `codex/commerce-regression`. Se integró
`8af1f08` de F05 como `dd01a41` antes de corregir las rutas de carrito.
Medusa **2.18.0**, Mercur **2.3.3** y las extensiones/parches instalados.
Se preserva el overlay de instrucciones/UI del usuario, fuera de los commits.

## Contrato comprobable

La suite `packages/api/integration-tests/http/commerce-regression.spec.ts` usa el
servidor HTTP real del runner Medusa, PostgreSQL y Redis aislados. No sustituye
inventario, consultas, locks, precios ni rutas por mocks.

- Dos reservas nativas disputan una sola unidad: exactamente una reserva puede
  persistir. No equivale a completar dos checkouts ni prueba cargos Stripe.
- Dos ajustes absolutos con la misma cantidad esperada: uno gana y el otro
  informa conflicto, sin sobrescribir silenciosamente el ganador.
- Una reducción absoluta compite con una reserva: solo sobrevive una operación
  cuando ambas juntas excederían el inventario.
- Un delta nativo concurrente con un ajuste absoluto no desaparece. Se admite
  cualquiera de los dos órdenes seriales válidos.
- Cambiar/liberar reservas modifica la cantidad reservada y conserva stock
  físico. Un ajuste por debajo de las reservas se rechaza.
- HTTP add/update valida la cantidad resultante del carrito y la disponibilidad
  real de la oferta; remover una línea no libera reservas ajenas.
- Lectura del carrito conserva su precio guardado; la actualización de cantidad
  consulta el precio vigente. Son comportamientos observados en los workflows
  instalados, no una política nueva de congelación de precios en checkout.
- Publicación global y pausa por vendedor se prueban por separado. El usuario
  puede quitar productos cuya venta dejó de estar disponible.
- Un comprador no debe poder sustituir el precio backend enviando `unit_price`.
- Los carritos pendientes con ofertas y precios personalizados anteriores al fix
  no pueden iniciar pagos ni completarse. Se pide quitar/reagregar el producto;
  no se reescriben sus precios ni se invalidan recibos ya completados.

Las carreras mantienen brevemente un `SELECT ... FOR UPDATE` en una conexión
independiente, arrancan los dos escritores reales y esperan hasta comprobar dos
sesiones bloqueadas en PostgreSQL. Después liberan la barrera y leen las filas
persistidas. Los resultados esperados son constantes del escenario; no se
calculan invocando la implementación bajo prueba.

## Fixture compartido

`packages/api/integration-tests/helpers/native-checkout-fixture.ts` prepara
catálogo, stock, precios, comisión positiva, identidades, región, canal y envíos.
Contiene dos vendedores, dos compradores independientes y un administrador;
devuelve sus IDs para Phase3. Los consumidores
deben pasar por las rutas reales para crear carrito, completar compra y operar
dinero. La preparación no precrea esas ventas ni resultados financieros.
Configura USD, envío manual de 5 y precios de 19.99; la comisión del 10% se limita
a los productos creados. Acepta hasta 31 productos. Se invoca una vez por base
restaurada porque asigna Estados Unidos a su región. Las credenciales retornadas
son temporales y se usan en memoria o en el archivo externo privado autorizado,
nunca en el repositorio, logs o evidencia pública. Entregado en `b29249c`, con
ajustes de tipos generados en `65debaf` y `03ed08c`.

`integration-tests/helpers/seed-native-checkout-fixture.ts` permite preparar una
base persistente `closure_browser_*` para QA posterior. No se ha ejecutado. Exige
opt-in `NATIVE_CHECKOUT_FIXTURE=disposable-local`, `NATIVE_CHECKOUT_PRIVATE_OUTPUT=verified`,
`NATIVE_CHECKOUT_RUN_ID`, `NATIVE_CHECKOUT_SCENARIO`, y dos rutas absolutas externas
en `NATIVE_CHECKOUT_MANIFEST_PATH` y `NATIVE_CHECKOUT_CREDENTIALS_PATH`. Acepta
`NATIVE_CHECKOUT_PRODUCT_COUNT` (2 por defecto, hasta 31) e
`NATIVE_CHECKOUT_INVENTORY_QUANTITY` (5 por defecto).

Los archivos se crean exclusivamente, sin sobrescribir; las credenciales se
guardan separadas del manifiesto. El launcher debe verificar la ACL privada del
directorio en Windows antes de marcarla como verificada. La tarea raíz preparó
`browser-native-private` con permisos solo para el usuario actual y SYSTEM.
Con el nombre de base, sus migraciones y la reserva de infraestructura ya
coordinados, se ejecuta desde la raíz:

```powershell
pnpm --dir packages/api exec medusa exec ./integration-tests/helpers/seed-native-checkout-fixture.ts
```

## Verificación

2026-09-19: `pnpm install --frozen-lockfile --ignore-scripts` PASS. Sin actualizar
dependencias ni copiar `.env`.

2026-09-22: importer externo revalidó identidad/estado de contenedores, certificado
TLS, bindings loopback y configuración por proceso. PASS sin escrituras DB.
PostgreSQL usa 55432 y Redis TLS 56379/DB15; el runner crea/restaura/elimina bases
aleatorias `closure_commerce_*`. DB15 requiere reserva de la tarea raíz.

2026-09-22, fuente corregida: `pnpm test:api` PASS, **83 suites / 1114 pruebas
unitarias** y **3 pruebas de despliegue**. Incluye carga de hooks nativos de Mercur,
rechazo previo a autorización/reservas/órdenes y reintentos de completion.
`pnpm lint:api` PASS, 0 errores y 56 advertencias de fuente existente/F05;
`pnpm typecheck:api` PASS, también después de regenerar los tipos del grafo.
`pnpm build:api` PASS.
Overlay: 102 archivos comprobados por SHA-256, 0 modificaciones.

Ejecución final real con las correcciones: **16 PASS / 16 casos**, una suite,
126.745 segundos, salida 0. Incluye las carreras PostgreSQL, disponibilidad,
actualización del precio vigente, rechazo de precios enviados por el comprador
en creación/alta/actualización, publicación, pausa del vendedor y protección de
carritos anteriores con precio personalizado. Las consultas SQL comprobaron
que los rechazos no crearon sesiones de pago ni pedidos ni reescribieron precios.
DB15 se liberó explícitamente al terminar. Logs externos:
`commerce-run-04.log`, `commerce-unit-source-02.log`, `commerce-lint-final.log`,
`commerce-types-generated-02.log` y `commerce-build-generated-02.log`, dentro de
`C:/Users/dcalu/.codex/tmp/marketplace-closure-20260919/`.

## Defectos reproducidos y corregidos

Tercera ejecución, anterior a las correcciones: **9 PASS / 3 FAIL / 12 casos**,
113.273 segundos.
Pasaron las cuatro carreras y el ciclo de reservas, disponibilidad HTTP,
adiciones concurrentes al mismo carrito, rechazo al agregar un producto
despublicado y pausa del vendedor con reducción/remoción permitidas.

Dos defectos de producto quedaron reproducidos:

- La oferta continúa listada a 19.99 USD, pero enviar `unit_price: 0.01` retorna
  HTTP 200. PostgreSQL guarda `unit_price=0.01`, `quantity=1` y
  `is_custom_price=true`; el carrito devuelve total 0.01.
- Cambiar el producto a `draft` después de agregar una unidad no bloquea el
  aumento posterior a dos unidades: la ruta devuelve HTTP 200.

El tercer fallo era una aserción incorrecta de la prueba: `is_custom_price` no
está en la proyección HTTP predeterminada. Se trasladó a lectura SQL y el caso de
cambio de precio pasó completo en la ejecución final. Los dos primeros
intentos detectaron y corrigieron problemas del fixture RBAC/enlaces antes del
carrito. No se omitió ni convirtió en PASS ningún defecto de producto.

Comando reproducible, desde la raíz del worktree y después de obtener DB15:

```powershell
. 'C:/Users/dcalu/.codex/tmp/marketplace-closure-20260919/infrastructure/Import-ClosureTestEnvironment.ps1'
$env:COMMERCE_REGRESSION_TESTS = 'disposable-local'
pnpm --dir packages/api test:integration:http --runTestsByPath integration-tests/http/commerce-regression.spec.ts --no-cache
```

La tarea raíz autorizó corregir los defectos reproducidos. La nueva barrera
Store rechaza campos de precio en cuerpos originales/validados de creación,
alta y actualización de líneas, sin cambiar los workflows internos/admin. La
validación de venta consulta la publicación actual y se repite bajo el lock de
propiedad al actualizar. Creación de colección, sesiones y completion validan
publicación y precios personalizados previos antes de nuevos efectos; el hook
existente vuelve a comprobarlos en la completion nativa/webhook. No se registra
un segundo handler en hooks ocupados por Mercur.

## Límites y pendientes

El cambio de precio después de autorización, rechazo por
Stripe/configuración, vendedor suspendido y circuito económico completo siguen
fuera de esta evidencia. Un rechazo por proveedor no configurado no demuestra
ninguna de esas garantías.

Migraciones nuevas: ninguna. El runner aplica las
migraciones existentes únicamente en su base desechable.
