# Investigación de rendimiento: carrito y checkout

> **Informe histórico.** Sus resultados corresponden únicamente a la revisión, fecha y entorno descritos en el cuerpo original. No certifica el estado actual ni el cierre financiero. Consultar la [auditoría de cierre](../develpment/development-completion-audit.md), el [progreso](../develpment/development-progress.md) y las [guías vigentes](../README.md).

Fecha: 8 de septiembre de 2026. Código desplegado: `6ed1756`.
API: Railway `61bbdf4a-8a46-41eb-907d-ea8a0d523dc3`.
Store: Railway `fc2e3eb8-1e7a-40aa-bd92-c7f621c773ae`.

Mediciones y fingerprints SQL sin valores ni credenciales:
[cart-performance-2026-09-08-data.json](./cart-performance-2026-09-08-data.json).

## Resultado

La lentitud se reprodujo: agregar desde una sesión sin carrito tardó **14,53 s**
y agregar con carrito existente **10,43 s**. La mayor parte está en las
operaciones de API. La invalidación del layout completo agrega otros **2,2–2,4 s**
aunque el artículo ya se haya guardado.

Durante la ventana del POST aislado de agregar en producción se observaron
**89 sentencias de negocio**, con **15,98 ms de ejecución acumulada dentro de PostgreSQL**. El
endpoint tardó **7.951 ms**. La API está en Railway `us-east4-eqdc4a` y la conexión
real de PostgreSQL apunta al pooler de Supabase `us-west-2`. La combinación de
muchos recorridos de datos y separación de regiones es una explicación fuerte
del tiempo de espera. No hay trazas suficientes para repartir exactamente esos
7.951 ms entre red, pool, Redis y procesamiento del framework.

## Método y límites

- Navegador real contra el store publicado, como invitado y sin throttling.
- `performance.now()`, Resource Timing y observador de cambios de UI para medir
  clic, estado pendiente y resultado visible. Los tiempos de espera del script
  de automatización no se contabilizan como latencia del usuario.
- Logs HTTP de Railway para duración individual de las llamadas a la API.
- Peticiones directas con el SDK instalado para aislar el POST y comparar
  proyecciones del carrito, sin cambiar el código del sitio.
- Diferencias de `pg_stat_statements` entre dos snapshots, sin resetear
  estadísticas. Los fingerprints se agruparon correctamente antes de restar.
- Inspección del código local, Mercur 2.3.3, Medusa/SDK 2.18.0 y Next 16.3.4.
- Una muestra de navegador por escenario, tres comparaciones de proyección y
  muestras históricas: esto no es una prueba de carga ni permite calcular p95.
- Los relojes del navegador y Railway no estaban sincronizados exactamente;
  se comparan duraciones monotónicas y ventanas ordenadas dentro de cada fuente.
- La ventana SQL aislada incluye mantenimiento y consultas periódicas del
  worker. Se separaron las consultas de negocio de `workflow_execution`,
  autenticación del pooler y comandos de conexión. No se observó otra petición
  comercial en la ventana, pero estas estadísticas no son spans por petición.

## Agregar al carrito: desglose observado

| Tramo | Carrito nuevo | Carrito existente |
|---|---:|---:|
| Obtener región | 353 ms | — |
| Crear carrito | 3.619 ms | — |
| Leer carrito antes de mutar | — | 1.122 ms |
| POST de agregar artículo | 7.966 ms | 6.943 ms |
| Ventana de consultas de recarga posterior | 2.383 ms | 2.163 ms |
| Clic → resultado visible | **14.533 ms** | **10.429 ms** |
| TTFB de Server Action en navegador | 12.146 ms | 8.270 ms |
| Respuesta Server Action completa | 14.517 ms | 10.414 ms |

La ventana de recarga se mide desde el fin del POST de agregado hasta el fin de
la última consulta de ofertas. Incluye el pequeño despacho entre ambas fases;
las consultas internas corren parcialmente en paralelo. No sumar todas sus
duraciones como si fueran secuenciales.

La recarga hace cinco GET: categorías, región, producto, carrito y ofertas. El
GET de ofertas depende del producto/región, por lo que alarga la ruta crítica.
El navegador también hace prefetch de enlaces: fueron solicitudes pequeñas
en paralelo, no la causa de los ocho segundos del POST.

No hubo long tasks durante la segunda interacción. La primera registró una
tarea de 50 ms durante la carga inicial, anterior al clic.

La llamada aislada al endpoint publicado tardó 8.573 ms vista desde el cliente y
7.951 ms dentro del HTTP de Railway, devolviendo 2.251 bytes. Una llamada
equivalente a la API local conectada a la misma base tardó 22.022 ms. La muestra
local se mantiene separada y no se presenta como latencia de producción.

## Trabajo repetido y sobrelectura

### Invalidación global del frontend

`apps/web/features/cart/actions.ts:97` llama a
`revalidatePath("/", "layout")` después de todas las mutaciones. En el producto
esto reconstruye datos que no cambiaron por agregar al carrito: ficha, categorías
y región, además de ofertas y carrito. El resultado visible del botón se demoró
hasta terminar esa recarga en ambas mediciones.

`ProductPurchase` usa `useActionState`; no hace `router.refresh()` ni navegación
automática. La demora de ese botón no debe atribuirse a una navegación que no
existe en su código.

### Lectura completa para necesidades pequeñas

`apps/web/features/cart/data.ts:10` define `CART_FIELDS` con variantes, opciones,
ofertas, región/países, direcciones, envíos y sesiones de pago. Se utiliza incluso
para validar el carrito antes de agregar y para mostrar el contador de cabecera,
que solamente consume `items.quantity`.

Comparación alternada de tres lecturas por proyección, mismo carrito y SDK:

| Proyección | API muestra 1 | API muestra 2 | API muestra 3 | JSON serializado |
|---|---:|---:|---:|---:|
| `CART_FIELDS` completo | 2.205 ms | 1.276 ms | 1.173 ms | 5.047 bytes |
| ID, moneda, finalización y país de región | 470 ms | 449 ms | 432 ms | 214 bytes |
| ID y cantidades para contador | 371 ms | 347 ms | 344 ms | 74 bytes |

Los bytes son del objeto JSON serializado después de leerlo; no son una medición
del tamaño comprimido en el cable. La primera lectura completa incluye posible
calentamiento. Incluso comparando solo las muestras posteriores, la proyección
reducida ahorra unos 0,7–0,8 s por lectura en esta prueba. No se cambió la
proyección en el código operativo.

Las mutaciones devuelven carritos completos que las acciones descartan y luego
vuelven a leer durante el render. En el POST de agregar, el route nativo Mercur
fuerza **130 campos** y no utiliza `req.queryConfig.fields`; pasar `fields=id`
desde el frontend no basta para reducir ese refetch específico.

### Repeticiones dentro del backend

Secuencia comprobada de agregar:

1. Validación propia de producto pausado: consulta oferta.
2. Route Mercur: vuelve a consultar oferta y variante.
3. Workflow Medusa: lock del carrito y lectura del carrito.
4. Hook Mercur: otra lectura de oferta/inventario y validación de disponibilidad.
5. Variantes, precios, líneas actuales e inventario; escritura de la línea.
6. Refresh: contexto de precios Mercur, carrito, impuestos/envíos, promociones y
   enlaces de líneas/ofertas. Varios pasos recuperan nuevamente el carrito.
7. Evento, desbloqueo y refetch final completo en el route.

La rama inspeccionada tiene al menos tres consultas de grafo de oferta y seis
de carrito. Una llamada de grafo puede generar varias SQL; esos números no son
el total de sentencias SQL.

En el POST aislado observado, las consultas que tocaron cada tabla fueron:

| Tabla/área | Consultas |
|---|---:|
| Líneas del carrito | 10: nueve lecturas y un UPDATE |
| Carrito | 6 |
| Producto | 6 |
| Oferta | 5 |
| Envíos, impuestos, ajustes, promociones y créditos | 4 por área |
| Colección de pago, categorías, etiquetas y perfiles de envío | 3 por área |

Las cuentas por tabla se solapan cuando una sentencia hace JOIN. La ventana
completa tuvo 111 sentencias/17,87 ms; el subconjunto de negocio identificado,
89/15,98 ms. La sentencia de negocio más lenta fue el UPDATE de línea: 6,11 ms.
Estos datos descartan una ejecución SQL de varios segundos en esta muestra;
no miden espera en red, adquisición de conexión ni procesamiento fuera de DB.

Parte de las lecturas repetidas valida estados antes y después de escribir y
debe preservarse. Las oportunidades son compartir datos dentro de una ejecución
y evitar reconstrucciones que no aportan información nueva, conservando las
validaciones nativas de stock, precio, producto pausado y compensaciones.

Fuentes principales: `packages/api/src/lib/catalog/sale-pause.ts`,
`@mercurjs/core/.medusa/server/src/api/store/carts/[id]/line-items/route.js`,
hooks Mercur `validate.js`, `set-pricing-context.js`,
`before-refreshing-payment-collection.js`; workflows Medusa `add-to-cart.js`,
`refresh-cart-items.js` y `update-cart-promotions.js`.

## Checkout

**Bloqueo funcional adicional:** guardar el envío falla en producción con
`Map.groupBy is not a function`. Se reprodujo dos veces, también verificando
que el radio estuviera seleccionado antes de pulsar continuar. El segundo
intento tardó 4.654 ms hasta mostrar el error; no llegó a enviar el POST de
shipping-methods. Ese tiempo no representa un guardado exitoso.

El origen es código propio: `apps/web/features/cart/presentation.ts:30` usa
`Map.groupBy` al agrupar opciones. `selectedShippingOptions` lo ejecuta dentro
de la Server Action después de leer carrito y opciones. Railway construyó el
store con **Node 20.20.2**, como muestran sus logs; la versión local es
**Node 24.18.0**. El rango `engines.node: >=20.9.0` permite un runtime que no
dispone de esa función. El navegador sí puede mostrar opciones porque su motor
soporta la función, pero la validación en servidor falla. El SDK no es el origen.

La verificación anterior del pedido utilizó finalización nativa y no detectó
esta incompatibilidad del paso de envío en producción. La corrección mínima
propuesta es agrupar con `new Map()` y un bucle, manteniendo tipos y orden; debe
validarse con el runtime mínimo declarado. No se aplicó durante esta auditoría.
Por este bloqueo no se obtuvo una medición exitosa actual desde guardar envío
hasta iniciar pago. Las observaciones posteriores sobre pago son de código e
historial, no de una compra completa nueva.

Guardar dirección → opciones de envío visibles tardó **15.134 ms**:

- Lectura previa del carrito: 1.018 ms.
- POST de dirección: 9.175 ms.
- Después del POST: cuatro GET de carrito, tres GET de categorías y tres GET
  de opciones de envío; estas últimas tardaron 2.515, 2.707 y 2.650 ms.
- El navegador registró tres solicitudes RSC al paso de envío, además de la
  respuesta RSC de la acción y prefetch de enlaces.

`address-step.tsx:38` y `shipping-step.tsx:57` combinan
`revalidatePath` en servidor con `router.replace` y `router.refresh` en cliente.
Las peticiones repetidas se observaron realmente al guardar dirección; no son
solo una posibilidad deducida del código. Corren parcialmente en paralelo y
compiten por los mismos recursos, por lo que no se suman sus duraciones.

Preparar pago tiene una cascada de tres a cinco llamadas SDK:
GET carrito → GET opciones de envío → GET proveedores → creación de colección
si falta → creación de sesión. Envíos y proveedores pueden consultarse en
paralelo después de conocer el carrito. Hay una reutilización correcta de la
sesión compatible: no se crea un PaymentIntent nuevo en cada consulta.

Las validaciones de producto pausado y vendedor habilitado repiten la búsqueda
`cart_payment_collection` y la lectura del carrito en preflight de pago. Leen
el estado Stripe almacenado en DB; no consultan Stripe por HTTP en esos pasos.

Histórico disponible: cuatro GET de envío, 2.447–2.571 ms; siete GET de
proveedores, 274–315 ms. Completar el carrito ya completado en la verificación
anterior tardó 3.955 ms. Esa última cifra corresponde a un reintento, no al coste
de crear un pedido nuevo. No se confirmó ningún pago en esta investigación.

## Infraestructura, caché y descartes

- API y web están en la misma región; la conexión PostgreSQL pasa por un pooler
  de Supabase en `us-west-2`, distinto de esa región. Se verificó el hostname
  utilizado en producción, no la ubicación física del servidor PostgreSQL.
  No se midió el RTT desde el contenedor porque SSH no tiene claves configuradas.
- Pool configurado con `min: 0`, `max: 4`, `idleTimeoutMillis: 30000`: el arranque
  tras inactividad puede requerir conexiones nuevas. La primera lectura suele
  ser más lenta, pero esta prueba no separa el coste de conexión del resto.
- CPU de API en la ventana consultada: media 0,0093 y máximo 0,223 cores; web
  media 0,00066 y máximo 0,033. No hay evidencia de saturación de CPU.
- No se observaron esperas activas de locks en PostgreSQL en las inspecciones.
  Eso no demuestra ausencia de toda contención transitoria.
- Redis aumentó tres comandos durante la ventana del POST aislado, incluido
  un INFO diagnóstico. No hay evidencia de una avalancha de comandos Redis.
  Su región no quedó identificada.
- No hay prueba de que `drainDelay: 60` retrase 60 segundos el carrito ni de
  que cada paso del workflow persista un checkpoint Redis.
- Los SDK usan `no-store` y `AbortSignal`. Next no aplica su deduplicación
  automática de fetch cuando se pasa señal; permanecen las funciones que
  explícitamente usan `React.cache` dentro del render actual.
- Cabecera y contenido sí comparten `getCheckoutCart` dentro del mismo render;
  metadata y ficha comparten `getStorefrontProduct`. No se cuentan como
  duplicaciones. Las repeticiones medidas ocurren entre fases/renders.
- El límite de 30 s del carrito es por petición, no para toda la Server Action.
- `PERFORMANCE_TRACE_ENABLED` está ausente en producción. El trazador existente
  mide `graph/index`, pero no consultas directas de módulos, remoteQuery,
  Redis, espera de pool o todos los pasos de workflows. Para atribuir el resto
  de los ocho segundos con precisión se necesitan spans de esas operaciones.

## Orden recomendado para corregir

0. Corregir la incompatibilidad `Map.groupBy` que bloquea el paso de envío,
   y ejecutar pruebas con el runtime real de despliegue.
1. Reducir invalidación al estado del carrito y eliminar el refresco adicional
   después de navegar entre pasos. La recarga del PDP agrega 2,2–2,4 s medidos;
   checkout multiplica consultas costosas durante la transición.
2. Usar proyecciones específicas para validación y contador; reutilizar la
   respuesta de mutación cuando permita actualizar la interfaz correctamente.
   Ajustar el refetch Mercur solo tras verificar su contrato nativo.
3. Instrumentar esperas por operación y evaluar colocar API y DB en la misma
   región. No prometer una reducción exacta ni mover infraestructura sin medir
   las dependencias y preparar la migración.
4. Reducir lecturas repetidas dentro de una composición de workflow, compartiendo
   el carrito/oferta ya recuperados cuando su estado siga siendo válido.
5. Paralelizar lecturas independientes de checkout. Para cachear regiones o
   categorías entre peticiones, definir primero invalidación entre aplicaciones.

No se aplicaron optimizaciones, migraciones ni cambios de configuración durante
esta investigación. Los cambios versionables son este informe y sus mediciones.
Al terminar se vació exclusivamente el carrito de prueba mediante el SDK nativo.
No se creó una sesión de pago ni un pedido durante esta investigación.
