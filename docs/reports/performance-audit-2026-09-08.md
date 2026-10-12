# Auditoría de rendimiento — 2026-09-08

> **Informe histórico.** Sus resultados corresponden únicamente a la revisión, fecha y entorno descritos en el cuerpo original. No certifica el estado actual ni el cierre financiero. Consultar la [auditoría de cierre](../develpment/development-completion-audit.md), el [progreso](../develpment/development-progress.md) y las [guías vigentes](../README.md).

## Resultado ejecutivo

El principal cuello de botella observado es la multiplicación de viajes remotos
por petición, amplificada por etapas HTTP secuenciales. No es principalmente el
renderizado de React ni la ejecución de una consulta SQL pesada.

Existe además un defecto verificable en la combinación instalada de Medusa:
la función de permisos declara opciones de caché pero omite activarla. La
autorización de rutas y campos vuelve a consultar los mismos permisos.

Redis tiene consumo de fondo incluso sin HTTP. Es un problema de coste operativo
separado: no hay evidencia para atribuirle por sí solo toda la latencia de las UI.

No se modificó código, configuración, dependencias ni datos de negocio. Este
informe es el único archivo creado por esta auditoría. Se utilizaron inicios de
sesión de QA, lecturas HTTP, estadísticas y transacciones PostgreSQL read-only.
No se enviaron correos, cobros, uploads ni formularios de negocio.

## Método y alcance

- Servidores existentes de desarrollo: web 3000, admin 7000, vendor 7001, API 9000.
- Next.js 16.3.4, Mercur 2.3.3, Medusa 2.18.0; BullMQ resuelto 5.13.0.
- API local en Windows; hostname del pooler PostgreSQL indica `us-west-2`.
- Código del workspace y dependencias efectivamente resueltas por la API. La
  copia raíz de Mercur no es intercambiable con `packages/api/node_modules`.
- Chromium aislado, Navigation Timing, solicitudes document/fetch/XHR y logs
  HTTP ya existentes. Las mediciones controladas usan navegación de documento.
- Diferencias de `pg_stat_statements`, SELECT 1, EXPLAIN ANALYZE de SELECTs
  pequeños, una instantánea de conexiones y el script existente
  `packages/api/scripts/profile-vendor-readiness.cjs`.
- Redis: tres PING, INFO stats y un intento de INFO commandstats, sin MONITOR,
  KEYS, SCAN, resets ni procesos Medusa adicionales.
- Son muestras diagnósticas, no un benchmark de producción ni percentiles p95.

## Mediciones actuales

| Operación | Tiempo observado | Fuente / precisión |
|---|---:|---|
| Store anónimo `/` | 3.015 s | Navegador, documento completo; TTFB 216.5 ms |
| Vendor catálogo | 5.6–6.2 s | Logs actuales; muestra navegador 6.239 s |
| Vendor detalle producto | 14.605 s | Navegador; TTFB 426.3 ms, HTML completo 14.581 s |
| Vendor inventario | 7.7–9.1 s | Logs existentes de esta sesión |
| Vendor almacén | 8.1 s | Log existente de esta sesión |
| Vendor envíos | 6.0–7.0 s | Logs existentes de esta sesión |
| Vendor ajustes | 3.6–4.5 s | Logs existentes de esta sesión |
| Admin solicitudes | 4.090 s | Navegador; TTFB 1.056 s |
| Acción cliente del indicador admin | 3.781 s | POST adicional, parcialmente solapado con documento |
| PostgreSQL SELECT 1 | 214 / 212 / 212 ms | Conexión ya establecida, tres lecturas |
| PostgreSQL conexión nueva | 835 ms | Script read-only, una conexión |
| Redis PING | 147 / 148 / 148 ms | Conexión ya establecida |

El log de la navegación de detalle controlada atribuye 26 ms a Next.js, 6 ms al
proxy y unos 14.5 s al código de aplicación, que incluye sus esperas remotas.
Esa categoría no es una medición de CPU JavaScript.

### Ruta crítica del detalle de producto

Ocho HTTP Next → API. Cada línea de una misma rama paralela se solapa; no sumar
todos los tiempos de la tabla como si fueran secuenciales.

```text
Navegador → Next: un GET de documento, sin fetch/XHR de negocio adicional
  └─ GET sellers                         0.230 s
      ├─ categorías                      3.178 s
      └─ GET products?id=X (preflight)    5.154 s
          ├─ detalle producto            4.298 s
          └─ catalog-options             3.860 s
              [se espera el resultado compuesto del detalle]
              ├─ ofertas                 4.581 s
              ├─ perfiles de envío       4.067 s
              └─ almacén                 3.578 s
```

Camino crítico aproximado: 0.230 + 5.154 + 4.298 + 4.581 = **14.263 s**,
frente a 14.605 s observados en navegador. Esto localiza la mayor parte de la
espera en cuatro etapas remotas concretas.

Por debajo, cada endpoint seller-scoped pasa por membresía Mercur,
inicialización de roles, guard de acceso vigente y permisos de ruta/campos.
Estas operaciones consultan PostgreSQL y algunas lecturas graph utilizan Redis.
Stripe, Resend y S3 no forman parte de este camino de lectura inspeccionado.

### SQL de la ventana del detalle

Se observaron **140 ejecuciones y 55.524 ms de ejecución SQL acumulada** durante
la ventana. Los logs muestran las ocho peticiones esperadas, sin otros HTTP en
esa ventana. `pg_stat_statements` es global: estos son deltas correlacionados,
no spans SQL con trace-id; podrían incluir actividad de fondo.

Repeticiones destacadas:

| Consulta/familia normalizada | Veces |
|---|---:|
| CTE `role_hierarchy` | 12 |
| Asociaciones de políticas del mismo rol | 12 |
| Lectura del identificador del mismo rol | 12 |
| Roles predeterminados / catálogo de políticas / bindings del bootstrap | 7 cada una |
| Identidad / miembro / membresía / seller / solicitud aprobada | 7 cada una |

La CTE suma 33.333 ms de ejecución, pero invocarla de nuevo obliga a otro viaje
remoto. No multiplicar 140 por 212 ms como predicción: varias consultas se
ejecutan en paralelo y existen otras esperas.

EXPLAIN ANALYZE de consultas pequeñas representativas:

| Tabla | Filas | Ejecución servidor | Plan |
|---|---:|---:|---|
| rbac_policy | 289 | 0.130 ms | Seq Scan, 9 bloques en caché |
| rbac_role_policy | 464 | 0.160 ms | Seq Scan, 9 bloques en caché |
| vendor_application | 1 | 0.043 ms | Index Scan |
| product | 2 | 0.050 ms | Index Scan |

No se justifica añadir índices indiscriminadamente a partir de estos datos.
En la instantánea de conexiones no había espera por locks; no demuestra que
nunca ocurra bajo carga. El pool max4/min0/idle30s puede añadir cola/reconexión,
pero no se midió todavía su tiempo de adquisición.

La ventana del catálogo registró 45 SQL/29.856 ms, pero los logs revelaron que
se solapaba con el catálogo iniciado por el login anterior. **No usar ese conteo
como coste exacto de una navegación ni como prueba de duplicación espontánea.**

## Hallazgos priorizados

### 1. Caché de permisos de Medusa no activada — confirmado y reproducido

`packages/api/node_modules/@medusajs/framework/dist/policies/has-permission.js:134`
llama `useCache` con TTL, tags y provider, pero sin `enable: true`.
`node_modules/@medusajs/utils/dist/caching/index.js:19` ejecuta directamente el
callback cuando falta esa opción.

Prueba aislada contra la función instalada real, sin infraestructura: tres
comprobaciones iguales y concurrentes, mismo rol/contenedor, producen:

```json
{"results":[true,true,true],"graphCalls":3,"cacheGets":0,"cacheSets":0}
```

El filtro RBAC de campos (`framework/dist/http/utils/policies/rbac-field-filter.js:303`)
comprueba cada ruta de entidad, además del permiso del endpoint. Cada repetición
hidrata roles, bindings y políticas recursivas. Es coherente con los tripletes
SQL observados.

Primera opción segura: compartir una promesa de políticas por request entre
comprobaciones equivalentes. No activar a ciegas una caché global con TTL de
siete días: revisar invalidación, revocaciones y varios procesos primero.

### 2. Bootstrap RBAC y acceso vigente repetidos por endpoint — confirmado

Mercur `api/utils/ensure-seller-middleware.js:36` inicializa/verifica roles por
petición. `modules/seller/utils/ensure-seller-default-roles.js:82` mantiene tres
lecturas; el parche actual solo reduce columnas y paraleliza dos de ellas.

`packages/api/src/lib/vendor-onboarding/native-guards.ts:23` y `access.ts:42`
añaden identidad, miembro, membresía, seller y aprobación. Parte de esos datos
ya se ha obtenido en el middleware nativo. Son controles necesarios, pero no
necesariamente lecturas independientes de los mismos registros.

Reutilizar contexto comprobado por request y sacar la preparación de roles del
camino normal de GET, con inicialización idempotente/versionada y pruebas de
revocación. No eliminar guards ni cambiar permisos por ganar velocidad.

### 3. Cascadas de datos vendor — confirmado en red y código

`apps/vendor/src/features/workspace/data.ts:79`,
`features/workspace/operations.ts:59`,
`app/seller/(workspace)/catalog/[id]/page.tsx:68` y
`features/offers/product-offers.tsx:23` forman la cadena medida de cuatro etapas.

- Perfiles y almacén no dependen de las variantes: pueden comenzar antes.
- El preflight de visibilidad añade unos cinco segundos en esta muestra.
  Consolidarlo solo después de verificar que el endpoint final impone la misma
  visibilidad de catálogo compartido y aislamiento.
- Inventario consulta lista de ubicaciones y luego detalle del único almacén.
  Pedir su proyección necesaria en una lectura elimina otra etapa.
- El inventario por fila ya está agrupado; no persiste aquel N+1 anterior.

### 4. Onboarding repite identidad/acceso y bloquea datos independientes

`packages/api/src/lib/vendor-onboarding/views.ts:26` y `access.ts:13`:
GET de solicitud para comprador con una membresía aprobada ejecuta unas
16 invocaciones de servicio/graph: carga solicitante, solicitud/unread,
comprueba membresía y vuelve a comprobar acceso al construir la respuesta.
No son necesariamente 16 SQL: listAndCount y relaciones pueden amplificarlo.

El POST guarda mediante workflow y después reconstruye esa respuesta completa;
la carga de solicitante ya ocurrió en el paso de mutación. `/options` también
obtiene verificaciones/membresías para devolver opciones relativamente estables.

En web, `app/account/sell/page.tsx:33` espera solicitud y luego categorías,
direcciones y opciones antes del formulario; las novedades empiezan después.
El paso 1 queda condicionado por datos necesarios para pasos posteriores.

Mejora: contexto por request, DTOs según consumidor, datos de pasos bajo demanda
y límites Suspense locales. Guardar un paso intermedio ya utiliza su respuesta
sin recargar siempre todo el wizard: conservar ese comportamiento.

### 5. Segunda consulta admin para indicador — confirmada en navegador

El documento pide la cola `limit=20`; al hidratar, el indicador lanza una Server
Action que pide otra vez identidad y cola `limit=1`.

Medido en la recarga: dos GET `/admin/users/me` de ~0.85 s cada uno, cola de
20 en 2.982 s y cola de 1 en 2.891 s. Navegador: documento de 4.090 s y POST
adicional de 3.781 s, parcialmente concurrentes, no sumarlos directamente.

Fuente: `apps/admin/src/features/vendor-applications/components/pending-applications-provider.tsx:51`
y `pending-action.ts:12`. Es refresco por eventos con throttle de 60 segundos,
no polling continuo. Sembrar el indicador con datos server/reutilizar el conteo
reduce este trabajo sin perder actualización tras una decisión.

### 6. Store: metadatos encadenados y sin reutilización persistente

`apps/web/lib/medusa.ts:88–116`: productos espera regiones **y categorías**, aunque
solo necesita región. `app/page.tsx:26`: header/footer reciben categorías desde
la promesa del catálogo completo, por lo que también esperan productos.

Muestra actual: regiones 1.297 s y categorías 1.651 s en paralelo; después
productos 1.050 s. Desacoplar ambos sentidos y reutilizar región/categorías con
invalidación explícita. No tratar stock, permisos o precios como datos estáticos.

Las promises ya se comparten entre header/footer y tarjetas; favoritos no hacen
una llamada por tarjeta. No se observó una segunda descarga cliente del catálogo.

### 7. Refrescos e invalidaciones amplios — confirmados en código, efecto pendiente de medir

Hay pares `revalidatePath` server + `router.refresh` client en Stripe refresh,
envío/verificación de solicitud y lectura de novedades. Fuentes:
`apps/vendor/src/features/stripe-connect/actions.ts:18` / `account-refresh.tsx:25`;
`apps/web/features/vendor-onboarding/actions.ts:52,116,147` y sus componentes.

Además, mutaciones puntuales invalidan `/seller` layout o `/account` layout y `/`.
Auditar cada acción para usar un solo mecanismo cuando sea suficiente y reducir
el alcance. No se ejecutaron estas mutaciones para medir duplicaciones efectivas.

### 8. N+1 en escrituras de catálogo y uploads secuenciales — confirmado por código

- `packages/api/src/lib/catalog/offer-validation.ts:141`: altas de N ofertas
  ejecutan hasta 4N graph; actualizaciones, 5N. Repiten seller/perfil y recorren
  ofertas secuencialmente. Agrupar variantes, perfiles y restricciones por IDs.
- `product-validation.ts:147`: consulta por atributo existente, hasta 30.
- `apps/vendor/src/features/catalog/image-submission.ts:17`: un upload por
  archivo, secuencial. Editar con seis archivos nuevos implica como mínimo siete
  Server Actions y 15 llamadas Next→API antes del re-render.
- Trayecto imagen: navegador multipart → Next → API JSON/base64 → S3. Hay
  conversión y validación binaria repetida. No medí su CPU ni RTT S3 en esta QA.

Diseñar carga agrupada o concurrencia acotada; no asumir que Promise.all de
Server Actions del cliente elimina su serialización. Mantener protección de
uploads y reutilización de archivos exitosos al reintentar.

### 9. Consultas que crecerán con el catálogo

Los helpers nativos de visibilidad obtienen vínculos `product_seller` globales
en listados sin ID y acciones de creación propias antes de aplicar paginación.
`vendorOnboardingResponse` lee ofertas/acciones completas para checks booleanos.
Reemplazar por consultas de visibilidad y existencia acotadas, sin alterar el
modelo de catálogo compartido de Mercur. La hidratación de atributos nativa ya
está agrupada; no es un N+1 por producto en esa función.

### 10. Timeout e imágenes — riesgos secundarios

`apps/web/lib/catalog-state.ts:99` rechaza tras ocho segundos pero no cancela
la operación original. Pueden seguir peticiones después del error visible y
solaparse con reintentos. Se necesita deadline/abort real compatible con SDK.

`apps/web/components/product-card.tsx:95` usa `unoptimized` para imágenes
externas al backend, incluidas Supabase: riesgo de descargar originales en
tarjetas pequeñas. La muestra de home no descargó imágenes; no se atribuye
un tamaño real ni una latencia medida a este riesgo.

## Redis y tareas de fondo

Ventana sin navegación propia y sin nuevas líneas HTTP del backend:
2026-09-08 04:25:52–04:26:37 UTC, 45.306 s, mismo cliente Redis.

`total_commands_processed`: 10,439 → 10,649, **delta 210**.
INFO commandstats devolvió vacío. Los valores absolutos cambiaron de alcance
entre conexiones anteriores: no convertirlos en consumo facturado ni sumarlos
como un contador mensual. Tampoco interpretar todos los hits/misses como caché
de datos de la aplicación: intervienen colas y scripts.

Fuente instalada explica actividad periódica:

- `pnpm dev` fuerza modo shared: HTTP y workers juntos.
- Event bus + workflow engine mantienen cuatro workers.
- `drainDelay:60` existe, pero BullMQ 5.13.0 limita a diez segundos el bloqueo
  cuando hay trabajo delayed; comprobación de stalled jobs cada 30 segundos.
- Cron de notificaciones cada minuto, evaluación commerce cada 15 minutos y
  limpieza nativa cada 30 minutos. El flag raíz de automatizaciones Stripe es
  false; su job comprueba ese flag antes de hacer consultas de negocio.
- El antiguo loop de 20 notificaciones vacías está corregido: sale al primer
  resultado no enviado. No encontré bucles propios de polling ni duplicación
  demostrada de registro de subscribers.

No se añadieron ni arrancaron workers para la auditoría. No hacer más grande
drainDelay esperando eliminar delayed/stalled checks; no desactivar mecanismos
de fiabilidad silenciosamente. Diseñar un perfil local explícito de Redis y
workers, y medir consumo con las métricas autoritativas de Railway.

## Servicios externos

El flujo exitoso `account.updated` de Stripe contiene tres lecturas de cuenta:
guard previo al ack → subscriber nativo → reconciliación bajo lock. Fuentes:
`packages/api/src/lib/stripe-connect/native-guards.ts:65`, provider Connect
instalado `dist/index.js:207`, subscriber Mercur `payout-webhook.js:14` y
`account-reconciliation.ts:188`.

Reducir lecturas redundantes preservando verificación de firma/binding y una
lectura fresca bajo lock. Confirmado por código; no envié webhooks para medirlo.
No es causa de la navegación normal auditada. Resend usa outbox/idempotencia;
no hubo envíos de prueba. Storage interviene al cargar archivos e imágenes,
no al listar tablas sin medios.

## Plan de optimización y criterios de aceptación

| Orden | Cambio | Impacto esperado | Verificación antes de cerrar |
|---|---|---|---|
| P0 | Añadir correlación temporal/trace-id acotada, spans HTTP/SQL/pool/Redis | Permite atribuir el tiempo residual sin adivinar | Baseline frío/caliente, número de consultas y p50/p95 sin datos sensibles |
| P1.1 | Deduplicar permisos por request y corregir integración de caché Medusa de forma segura | Muy alto, común a múltiples endpoints | Una lectura efectiva por rol/request; revocación y aislamiento multi-seller intactos |
| P1.2 | Contexto de acceso compartido y bootstrap RBAC fuera de GET | Alto, evita repetir lecturas en cada recurso | Sin lecturas de inicialización en navegación estable; pruebas de onboarding/roles |
| P1.3 | Eliminar etapas redundantes de detalle/inventario y adelantar recursos independientes | Alto y medido: varias etapas de 3–5 s | Menos etapas/HTTP; mismas restricciones de visibilidad; tabla/ofertas sin esperas ajenas |
| P1 paralela | Perfil de desarrollo que controle consumo Redis y colocación de servicios | Alto en coste y latencia base | Consumo en reposo medido; no pérdida de jobs/locks; medir red desde despliegue previsto |
| P2.1 | Simplificar DTO/lecturas del onboarding y carga por pasos | Alto en account/sell y guardados | El paso inicial no espera categorías; no repetir carga del solicitante en una operación |
| P2.2 | Sembrar indicador admin y reducir refresh/revalidate redundantes | Medio, fácil de comprobar | Sin POST extra inicial para dato ya disponible; un refresco por mutación |
| P2.3 | Compartir/cachear región/categorías y desacoplar catálogo | Medio, bajo riesgo con invalidación | Categorías no esperan productos ni viceversa; invalidación administrativa correcta |
| P2.4 | Batch de ofertas/atributos y carga agrupada de imágenes | Alto en formularios/lotes | Consultas no crecen 4N/5N por datos compartidos; retries no duplican uploads |
| P3 | Cancelación, imágenes responsive, checks existenciales, scopes Suspense restantes | Medio y prevención de escala | Sin trabajo huérfano; payloads medidos; estados independientes visibles |
| P3 externa | Unificar lecturas de cuenta en webhook Stripe | Menor para navegación, útil para fiabilidad | Firma/orden de eventos/idempotencia preservados y conteo remoto reducido |

No aumentar el pool ni añadir índices/dependencias sin medir. Mantener frontend
sin acceso directo a DB/Redis, workflows nativos, permisos frescos e inventario
consistente. El despliegue local→Supabase/Redis remoto amplifica el problema;
colocar API cerca de ambos servicios puede reducir RTT, pero no sustituye
corregir consultas repetidas.

## Lo que aún no puede afirmarse exactamente

- Milisegundos de cola del pool, ORM, serialización, event loop y Redis por cada
  request: faltan spans internos correlacionados. No llamar «red» a todo el resto.
- Consumo facturado de Redis y reparto por comando/worker: `INFO` no lo expuso.
- Rendimiento de producción, carga concurrente o p95: solo desarrollo actual.
- Tiempo de uploads, Stripe, checkout y emails: se inspeccionó código sin
  producir efectos externos. Tampoco se reprodujeron todas las mutaciones.
- Escalabilidad con miles de productos: la base medida tiene dos productos;
  N+1 de escritura y scans globales son hallazgos de código, no stress tests.

## Referencias de comportamiento

- [Next.js: fetch y memoización](https://nextjs.org/docs/app/api-reference/functions/fetch).
- [Next.js: router.refresh](https://nextjs.org/docs/app/api-reference/functions/use-router).
- [Supabase: observabilidad y fuentes de diagnóstico](https://supabase.com/docs/guides/observability).
- Para los defectos concretos de Mercur/Medusa/BullMQ prevalece la fuente
  instalada citada arriba y la reproducción offline, no documentación de otra versión.
