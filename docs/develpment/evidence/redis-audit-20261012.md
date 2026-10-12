# Auditoría de Redis — 12 de octubre de 2026

Estado: auditoría local completada, cambios verificados y comparación antes/después
realizada. La observación del despliegue Railway queda pendiente.

El destino actual es Redis en Railway y Redis local en Docker. Upstash es
únicamente el antecedente del incidente; no se utilizaron sus servicios ni se
aplican sus cuotas o precios a estas mediciones. No se modificó Railway.

## Alcance y método

Se inspeccionaron los consumidores propios, los frontends y los paquetes activos
de Medusa 2.21.2/Mercur 2.3.7, incluidas sus dependencias resueltas: BullMQ 5.13.0,
ioredis nativo 5.11.1, ioredis propio 6.0.0 y connect-redis 5.2.0. Se recorrieron
71 paquetes nativos activos sin atribuir código de versiones históricas retenidas
en `node_modules/.pnpm` al runtime actual.

Las mediciones distinguen:

- **Peticiones serializadas:** comandos que ioredis 5/6 prepara para enviar.
  Un pipeline de dos comandos sigue contando dos; un EVAL cuenta uno. Una caída
  del socket puede impedir su entrega. La calibración local comprobó la
  correspondencia con Redis durante conexiones sanas.
- **Comandos ejecutados:** deltas de `INFO commandstats` y
  `total_commands_processed`, que incluyen las llamadas dentro de Lua. Un
  `EVAL` que ejecuta dos `PING` produjo una petición y tres llamadas ejecutadas.
- **CPU:** tiempo acumulado del proceso Redis. No equivale a latencia HTTP.
- **Memoria:** estado y diferencia de `used_memory`; la variación puede incluir
  claves de fixture, buffers y estructuras de colas.
- **Red:** bytes globales del servidor; los deltas incluyen las respuestas INFO
  del observador. No se presentan como bytes exactos exclusivos de la aplicación.
- **Latencia:** duración local de cada ventana. Las muestras únicas, cron
  concurrentes, calentamiento y fixtures impiden tratarlas como benchmark causal.

INFO es global para todas las bases lógicas de una instancia. Por ello, separar
solamente los números de base no aísla las estadísticas. El baseline nativo usa
Redis y PostgreSQL desechables con TLS, identidad y etiqueta de ownership propias,
en los puertos de QA exigidos por las guardas existentes: 56379 y 55432. Fue
necesario crear esa instancia porque la operativa conserva otras bases y las
pruebas financieras exigen un destino QA aislado. Se reutilizaron las imágenes
locales; no se restauraron datos operativos ni se sustituyó infraestructura.

La instancia QA no tiene healthcheck Redis durante las ventanas. Se descuentan
los dos comandos del observador por muestra. La instrumentación temporal guarda
nombres y cantidades de comandos, nunca argumentos, credenciales ni contenido
comercial. MONITOR se utilizó brevemente sólo con tráfico local controlado.

Los escenarios nativos cargan módulos, rutas, workflows, subscribers, cron y
workers reales en modo `shared`. Los pagos usan un proveedor local para checkout
y transporte Stripe simulado para captura/reembolso; no se contacta Stripe,
Algolia, Resend ni un proveedor de archivos remoto. Cada mutación tiene ventanas
separadas de drenaje de eventos, para no atribuir su trabajo pendiente a la
siguiente petición. Esas ventanas incluyen consultas diagnósticas de la cola y
deben identificarse al comparar costes de extremo a extremo.

La primera inspección del Redis operativo encontró **cero clientes de API**:
el supervisor local de desarrollo seguía abierto pero su proceso hijo había
terminado. Sus 52 comandos AUTH/PING durante 130 segundos eran el healthcheck
Docker; no constituyen una medición de un marketplace vivo. No se usó ese
resultado como baseline de optimización. Las corridas de calibración que
fallaron al preparar el puente IPC/Jest tampoco son mediciones comparativas.

La comparación final utilizó el mismo escenario congelado, con overlays de los
cinco archivos de runtime antes/después. Antes de cada corrida se vació solamente
la base QA de propiedad exclusiva, se reinició su contenedor Redis y se creó una
base PostgreSQL UUID nueva. Ambas corridas completaron sus 109 ventanas sin
errores Redis, conexiones rechazadas ni expulsiones de claves. El reposo de 130 s
comienza en el mismo segundo del minuto y comprende dos ciclos de cron por minuto;
no incluye los trabajos de 15/30 minutos. Las operaciones posteriores no coinciden
con cron, aunque pueden coincidir con mantenimiento de workers.

## A. Diagnóstico

| Consumidor | Comportamiento y comandos relevantes |
| --- | --- |
| Event bus Redis | Cola `RedisEventBusService:events-queue:*`; worker BullMQ, scripts EVALSHA, BZPOPMIN, mantenimiento de stalled. Eventos agrupados usan RPUSH/EXPIRE/LRANGE/UNLINK. |
| Workflow engine Redis | Estado, retries/timeouts, cron y cleaner: `bull:medusa-workflows:*`, `bull:medusa-workflows-jobs:*`, `bull:workflows-cleaner:*`. GET/SET/UNLINK, Lua de colas y Pub/Sub para observación de workflows. |
| Caching nuevo | Namespace `mc:`; HGET/HSET, índices de tags SADD/SMEMBERS/SREM y EXPIRE/UNLINK. Su feature está apagada por defecto, pero el módulo estaba registrado e invalidaba eventos. |
| Cache legacy | `Modules.CACHE` usa memoria local. `cache-redis` está instalado pero no configurado; no se le atribuye tráfico. |
| Locking Redis | Namespace `medusa_lock:`; adquisición/liberación/renovación con ownership. Actúa durante trabajo y contención, sin un scanner permanente en reposo. |
| Sesiones HTTP | `sess:` con connect-redis; GET/SET EX/EXPIRE/DEL. `saveUninitialized=false`; JWT bearer no implica crear una sesión en cada petición. |
| Antispam propio | Un cliente compartido; EVAL atómico con varios presupuestos por petición. GET/INCR/EXPIRE/PTTL en el script original. |
| Notificaciones propias | Un publisher y un subscriber lazy compartidos; PUBLISH/SUBSCRIBE/UNSUBSCRIBE, versiones y snapshots booleanos con TTL de 300 s. No almacena los pedidos ni importes. |
| Frontends | No conectan a Redis. SDK HTTP hacia Medusa/Mercur; SSE compartido por pestaña de panel, sin polling Redis propio. La búsqueda externa usa Algolia. |
| Infraestructura local | Docker ejecuta redis-cli PING cada 5 s, con AUTH cuando corresponde; se identifica aparte de la aplicación. |

En modo `shared` hay **cuatro workers**: eventos, retries/timeouts, cron y
cleaner. El event bus crea un cliente base y uno bloqueante; workflow engine
crea cuatro base y tres bloqueantes; locking y caching crean uno cada uno, y
HTTP crea otro para sesiones. Los clientes propios se suman a esa topología.
Son construcciones por proceso, no una estimación universal de conexiones TCP:
el modo `server` no ejecuta esos workers y los clientes lazy se conectan cuando
se necesitan. Railway declara API `server` y worker separado, una réplica de
cada uno; no se verificaron las réplicas efectivamente desplegadas.

### Causas identificadas

1. **Mantenimiento de BullMQ incluso sin visitas.** `drainDelay=60` ya estaba
   configurado antes de esta auditoría. Se respeta en una cola vacía sin delayed;
   una cola con tareas futuras limita la espera a 10 s en BullMQ 5.13.0. Además,
   cada worker comprueba stalled cada 30 s. Es tráfico de confiabilidad, no una
   evidencia automática de un bucle defectuoso.
2. **Caching cargado con la feature apagada.** `Cached` sale antes de consultar
   el proveedor cuando `caching=false`, pero la estrategia del módulo registra
   un subscriber wildcard y un interceptor. Invalida tags durante la emisión y
   procesamiento, incluso sin lecturas útiles; el wildcard también hace
   elegibles para cola eventos sin otros consumidores. Es un consumidor
   innecesario en esa configuración.
3. **Cron de integraciones desactivadas.** Los handlers de email y automatización
   comercial retornan sin trabajo cuando sus flags estáticos están apagados,
   aunque el scheduler sigue pagando registro, adquisición y finalización.
4. **Versiones de notificación sin lector.** Sólo `applications-changed` y
   `catalog-changed` tienen snapshots de operador. Los otros tres topics
   incrementaban una versión que ningún consumidor leía.
5. **Creación del presupuesto antispam.** Para una clave ausente, INCR seguido
   de EXPIRE puede sustituirse por SET con EX dentro del mismo script atómico,
   conservando el primer plazo y comprobando todos los límites antes de aceptar.

No se encontró un cliente Redis por render del frontend, un worker Mercur
independiente, un PING periódico propio o un polling Redis de SSE. Mercur aporta
seis subscribers y utiliza el event bus compartido; el artefacto instalado no
contiene los cron de payouts que aparecen en algunas páginas de documentación.

### Decisiones de confiabilidad

Se conservan los cuatro reconciliadores financieros: captura automática,
liquidación automática, conciliación de liquidaciones y proyección financiera.
La elección manual/automática se guarda en Store; un flag de arranque no basta
para declarar que su cron es innecesario. Se conservan los retries de eventos
(cinco intentos, backoff exponencial desde 5 s), stalled checks, recuperación de
delayed, leases y renovaciones de locks financieros.

La invalidación doble del caching habilitado se conserva: protege carreras entre
llenado e invalidación y entre instancias. Cambiar `resave` de sesión sustituiría
habitualmente SET por EXPIRE, ambos un comando; no se presenta como ahorro de
comandos. Un pipeline tampoco reduce el número de comandos y no reemplaza la
atomicidad de Lua.

## B. Consumo medido

Los [datos de la comparación](redis-audit-20261012.metrics.json) conservan los
conteos, recursos, comandos predominantes, runtime y colas de cada fase. En las
tablas, «llamadas» incluye los comandos internos de Lua; «peticiones» cuenta los
comandos serializados por ioredis. Ninguna columna representa facturación.

### Reposo y recursos

| Medición | Antes | Después |
| --- | ---: | ---: |
| Duración de reposo | 130,017 s | 130,015 s |
| Peticiones | 171 | 160 |
| Llamadas ejecutadas | 893 | 804 |
| Peticiones/minuto | 78,91 | 73,84 |
| Llamadas/minuto | 412,10 | 371,03 |
| Tiempo CPU Redis durante la ventana | 558,172 ms | 540,129 ms |
| Red entrante, incluido observador | 100.799 bytes | 53.036 bytes |
| Red saliente, incluido observador | 34.437 bytes | 26.319 bytes |
| Memoria al inicio → final | 2.812.032 → 2.684.928 bytes | 2.578.744 → 2.663.840 bytes |
| Clientes observados, excluido observador | 17 | 14 |
| Workers | 4 | 4 |
| Cron configurados | 7 | 5 |
| Ejecuciones cron en la ventana | 10 | 8 |

Todas las peticiones de ese reposo procedieron del ioredis 5.11.1 nativo; los
servicios propios con ioredis 6 no enviaron comandos. El mantenimiento residual
es principalmente BullMQ. Una ventana adicional de 20 s sin ejecuciones cron
produjo exactamente **12 peticiones y 60 llamadas en ambas versiones**. No se
eliminó ese mecanismo de recuperación. La diferencia observada de tres clientes
no se atribuye íntegramente al único cliente de caching retirado: influyen los
clientes lazy y el estado del escenario.

Comandos más frecuentes, incluyendo Lua:

| Comando | Antes, 130 s | Después, 130 s |
| --- | ---: | ---: |
| EVALSHA | 84 | 84 |
| HMGET | 51 | 48 |
| DEL | 47 | 46 |
| HGET | 46 | 40 |

Antes también predominaban XADD y ZADD (50 cada uno); después,
ZRANGEBYSCORE y RPOPLPUSH (40 cada uno). Las peticiones serializadas fueron
EVALSHA 84→84, GET/LRANGE/UNLINK 16→14 cada uno, BZPOPMIN 33→34,
EVAL 5→0 e INFO 1→0. Este INFO era de la aplicación, no del observador.

### Consumo por operación

Son ventanas medidas de la acción; el trabajo asíncrono posterior se registra
por separado en el JSON. No son costes universales por endpoint: incluyen el
mantenimiento concurrente y dependen de los datos concretos del fixture.

| Escenario | Peticiones antes → después | Llamadas antes → después |
| --- | ---: | ---: |
| Sin API, 10 s | 0 → 0 | 0 → 0 |
| Arranque de API y workers | 185 → 138 | 445 → 267 |
| Login de operador | 1 → 1 | 10 → 7 |
| Crear producto | 72 → 41 | 246 → 127 |
| Modificar producto | 17 → 12 | 70 → 56 |
| Login de cliente | 1 → 1 | 8 → 7 |
| Renovar autenticación | 0 → 0 | 0 → 0 |
| Lista de catálogo, fría y caliente, cada una | 0 → 0 | 0 → 0 |
| Detalle de producto | 0 → 0 | 0 → 0 |
| Crear carrito | 37 → 15 | 153 → 18 |
| Agregar artículo | 54 → 32 | 169 → 38 |
| Leer carrito | 13 → 11 | 22 → 14 |
| Modificar artículo | 47 → 31 | 131 → 37 |
| Eliminar artículo | 37 → 26 | 116 → 38 |
| Volver a agregar para checkout | 54 → 32 | 169 → 38 |
| Agregar envío | 43 → 27 | 127 → 33 |
| Crear colección de pago | 33 → 23 | 90 → 29 |
| Crear sesión de pago local | 31 → 21 | 72 → 24 |
| Completar checkout | 235 → 165 | 495 → 193 |
| Repetir checkout | 130 → 128 | 142 → 134 |
| Capturar pago | 199 → 59 | 1.003 → 149 |
| Webhook de pago | 3 → 2 | 12 → 11 |
| Repetir webhook | 3 → 2 | 12 → 11 |
| Reembolsar | 122 → 30 | 607 → 33 |
| Repetir reembolso | 4 → 6 | 7 → 15 |
| Cancelar fulfillment | 11 → 11 | 11 → 11 |
| Cancelar pedido | 245 → 69 | 1.221 → 115 |
| Publicar y entregar evento de prueba | 6 → 4 | 47 → 45 |
| Tras apagar API, 10 s | 0 → 0 | 0 → 0 |

El replay de reembolso subió dos peticiones y ocho llamadas por un despertar
concurrente del worker (un EVALSHA y BZPOPMIN adicionales); no se creó otro
reembolso. Se conserva ese resultado para no ocultar variación de fondo.

El drenaje posterior al checkout pasó de 87 a 23 peticiones y de 630 a 107
llamadas (290→191 ms). Sumado a su petición, fueron **322→188 peticiones** y
**1.125→300 llamadas**. Este total incluye sondeos diagnósticos de colas, por lo
que no debe usarse como coste puro de un checkout en producción. Desaparecieron
42 SMEMBERS directos de esa cola posterior, coherente con retirar invalidaciones
de caching cuando su feature está apagada.

### Proyecciones, no consumo real diario

Proyección lineal de la ventana de reposo: `conteo / milisegundos × 60.000 × 1.440`;
el mes usa 30 días. Supone un único proceso shared con cuatro workers y ese
mismo estado todo el día. Excluye visitas, réplicas y cron de 15/30 minutos no
observados, por lo que **no es una previsión completa ni un coste Railway**.

| Proyección parcial de reposo | Antes | Después |
| --- | ---: | ---: |
| Peticiones/día | 113.634,37 | 106.326,19 |
| Llamadas/día | 593.423,94 | 534.289,12 |
| Peticiones/30 días | 3.409.031,13 | 3.189.785,79 |
| Llamadas/30 días | 17.802.718,11 | 16.028.673,61 |

SLOWLOG se inspeccionó sin argumentos ni payloads. Una captura de QA
complementaria resultó vacía; no demuestra ausencia de latencia. El Redis
operativo conservaba entradas históricas GET/PUBLISH/EVALSHA e INFO, que no se
atribuyen a las ventanas comparativas. CPU, memoria y duración son muestras
únicas: no permiten concluir una mejora estable de latencia o ausencia de fugas.

## C. Optimizaciones y riesgos

| Archivo, relativo al repositorio | Cambio y justificación |
| --- | --- |
| `packages/api/medusa-config.ts` | Registrar CACHING/caching-redis sólo si la feature nativa está habilitada, con la misma prioridad env/config/default. Evita wildcard e invalidación sin lectores. |
| `packages/api/src/jobs/vendor-application-notifications.ts` | `defineFileConfig.isDisabled` según AUTH_EMAIL_ENABLED. No registra un cron cuyo handler retornaría inmediatamente. |
| `packages/api/src/jobs/evaluate-commerce.ts` | Mismo mecanismo nativo según commerceAutomationEnabled. Conserva handler y validación interna. |
| `packages/api/src/modules/spam-protection/service.ts` | Crear presupuesto ausente con SET EX dentro del Lua atómico; conserva validación conjunta, duplicados, TTL y límites. |
| `packages/api/src/modules/order-notifications/service.ts` | Publicar directamente orders/stores/finance-reporting, que carecen de lector de versión. Applications/catalog y versiones de vendedor conservan su operación atómica. |
| `packages/api/src/scripts/clear-query-cache.ts` | Mantenimiento explícito para reactivar caching sin reutilizar entradas retenidas. Usa invalidación nativa y verifica con SCAN acotado, fallando si quedan claves o falla Redis. |
| `packages/api/scripts/redis-diagnostics.cjs` | Diagnóstico de sólo lectura, limitado a loopback, con contadores, recursos, clientes agregados y SLOWLOG sanitizado. Detecta reinicios/resets. |
| `package.json`, `packages/api/package.json` | Comandos redis:diagnose y redis:cache:clear; ninguna dependencia agregada. |
| `docs/local-development.md` | Uso del diagnóstico, flags, mantenimiento y referencia a esta auditoría. |

Las pruebas agregadas están en `packages/api/src/lib/__tests__/`:
`redis-module-composition.unit.test.ts`, `scheduled-job-registration.unit.test.ts`
y `clear-query-cache.unit.test.ts`; en
`packages/api/src/modules/order-notifications/__tests__/redis-efficiency.integration.spec.ts`;
y en `packages/api/scripts/__tests__/redis-diagnostics.test.cjs`.
Este informe y su JSON son los otros dos archivos de evidencia. El resto del
worktree ya tenía cambios de tareas anteriores; no forma parte de esta auditoría.

### Ahorro aislado de servicios propios

- Antispam: 100 peticiones nuevas con cinco presupuestos, **1.600→1.100 llamadas**
  (−31,25 %), manteniendo 100 EVAL enviados. Presupuestos existentes y rechazos:
  700→700 llamadas. No se debilitan límites ni se renueva el primer TTL.
- Notificaciones: 100 publicaciones por topic sin versión consumida,
  **300→100 llamadas** (−66,67 %), conservando 100 peticiones y las entregas.
  Applications/catalog siguen en 300→300. Cien lecturas concurrentes de snapshot
  ejecutaron una sola función de cálculo y 203 llamadas; lecturas ya cacheadas,
  200 GET. Estas últimas no se modificaron.

### Riesgos y condiciones operativas

Mientras caching está apagado pueden permanecer entradas `mc:` antiguas hasta
su TTL, sin invalidarse. **Antes de reactivarlo**, detener API y worker, ejecutar
`pnpm redis:cache:clear` con el mismo Redis y, sólo si termina correctamente,
iniciar ambos con `MEDUSA_FF_CACHING=true`. El comando exige modo server, feature
activa y el proveedor Redis nativo esperado; no es un borrado automático al
arrancar. Debe respetarse también en Railway. Sus guardas y manejo de errores
se probaron unitariamente; no se ejecutó contra el Redis operativo ni Railway.

Los flags estáticos de cron requieren reinicio. Un repetible ya almacenado puede
producir una última activación: el scheduler nativo detecta el handler ausente,
retira el repetible y no reintenta. La prueba on→off→on confirmó cero entregas
cuando está apagado, cero retries y una entrega al habilitarlo otra vez. No se
borraron repetibles compartidos manualmente.

No se cambiaron importes, permisos, contratos financieros, compensaciones,
idempotencia, sesiones, locks, retries ni intervalos de recuperación. No se
actualizaron dependencias durante esta auditoría.

### Validación ejecutada

- `pnpm lint`: correcto, cero errores y 49 advertencias existentes de API.
- `pnpm typecheck`: correcto en el workspace.
- `pnpm test`: 49 suites/411 tests unitarios y 19 tests de herramientas correctos.
- `pnpm build:api`: correcto; conserva las mismas 49 advertencias.
- Integración Redis exclusiva: **23/23** correctas; límites, duplicados, TTL,
  persistencia, rechazo, concurrencia, Pub/Sub, snapshots, CAS y cierre de clientes.
- HTTP catálogo/permisos: **21/21** correctas contra PostgreSQL/Redis QA.
- Comparación nativa: ambas corridas correctas; dos pruebas por corrida y una
  modalidad suplementaria omitida intencionalmente, con cuatro workers activos.
- Transición nativa del cron on→off→on: correcta, sin retries ni claves propias
  residuales tras limpiar el fixture.
- `pnpm redis:diagnose --seconds 5`: correcto en Redis Docker operativo; observó
  sólo AUTH/PING de healthcheck y cero clientes de aplicación.
- El lockfile conserva exactamente su diff anterior a esta auditoría. Se retiraron
  únicamente los dos contenedores, cuatro volúmenes y una red QA con identidad
  y etiqueta de propiedad verificadas; se conservaron las evidencias privadas.

El escenario financiero verificó captura de 70, reembolso de 20 y cancelación
con reembolso del saldo 50; una captura y dos creaciones de reembolso en el
proveedor simulado, sin reembolso del pedido hermano. Webhook y checkout
repetidos conservaron idempotencia; el checkout creó exactamente un pedido y
el replay devolvió el mismo grupo. La prueba valida workflows y persistencia
reales con transporte de pagos simulado; no valida el servicio externo Stripe.

## D. Comparativa

| Métrica | Antes | Después | Reducción |
| --- | ---: | ---: | ---: |
| Peticiones/min en reposo | 78,91 | 73,84 | 6,43 % |
| Llamadas/min en reposo, incluido Lua | 412,10 | 371,03 | 9,96 % |
| Llamadas por lista o detalle de catálogo medidos | 0 | 0 | 0; porcentaje no aplicable |
| Peticiones durante checkout | 235 | 165 | 29,79 % |
| Llamadas durante checkout | 495 | 193 | 61,01 % |
| Peticiones checkout + drenaje instrumentado | 322 | 188 | 41,61 % |
| Llamadas checkout + drenaje instrumentado | 1.125 | 300 | 73,33 % |
| Llamadas de mantenimiento sin cron, 20 s | 60 | 60 | 0 % |
| Llamadas de arranque | 445 | 267 | 40,00 % |
| Llamadas/día, proyección parcial de reposo | 593.423,94 | 534.289,12 | 9,96 % |

La mejora dominante aparece en mutaciones y procesamiento posterior de eventos.
El reposo baja menos porque la mayor parte del mantenimiento de workers sigue
siendo necesaria. No se extrapola la reducción de un checkout a todo el tráfico.

## E. Pendientes y límites

- No se midió Railway: sus CPU, memoria, latencia, conexiones, réplicas y carga
  efectiva requieren observación en ese entorno. Las proyecciones locales no
  representan consumo ni coste facturado de Railway.
- No se reproduce retrospectivamente la antigua cuota de Upstash. No hay
  evidencia suficiente para atribuir su agotamiento histórico a una única causa.
- La búsqueda Algolia depende de un proveedor remoto; no se ejecuta en el
  entorno financiero aislado ni se inventan costes Redis de una búsqueda real.
- Los retries y reconexiones pueden elevar tráfico si hay fallos de red o
  reinicios frecuentes. No se ha demostrado una tormenta de reconexiones en el
  baseline sano; debe correlacionarse con logs y métricas del despliegue.
- SSE renueva el stream cada 60 s y vuelve a verificar autorización. Puede
  existir una lectura de recuperación redundante entre unavailable/ready;
  eliminarla requiere medir y probar reconexión, cambios de permisos y pérdida
  de Pub/Sub. No se alarga el stream para evitar esa verificación.
- Los snapshots necesitan dos GET para versión y contenido. Una coalescencia
  más amplia puede reutilizar un epoch obsoleto tras una mutación; no se aplica
  sin una solución demostrada para esa carrera.
- El cleaner conserva su frecuencia de 30 minutos. Borrar failed jobs,
  historiales, claves antiguas o repetibles indiscriminadamente no es una
  optimización segura.
- Para dimensionar Railway, medir al menos un ciclo de 30 minutos en una réplica
  representativa y separar API/worker, carga real y recuperaciones. La ventana
  local corta no mide reconciliación de un catálogo grande ni atrasos de colas.
- No se justifica una migración de arquitectura con esta evidencia. Optimizaciones
  adicionales de snapshots/SSE requieren pruebas de carreras y reconexión antes
  de cambiar su consistencia; el resto del tráfico de BullMQ no se elimina sin
  revisar sus garantías.

## Fuentes y evidencia

La autoridad para los detalles nativos es el código instalado en las versiones
indicadas: `@medusajs/event-bus-redis`, `@medusajs/workflow-engine-redis`,
`@medusajs/caching`, `@medusajs/caching-redis`, `@medusajs/locking-redis`,
`@medusajs/framework/dist/jobs/job-loader.js`, `bullmq/dist/cjs/classes/worker.js`
y sus scripts Lua. En BullMQ 5.13.0 el límite de 10 s de delayed está en
`getBlockTimeout`; el propio código remite al
[problema de recuperación de conexiones](https://github.com/taskforcesh/bullmq/issues/1658).

Se consultaron también las referencias actuales de
[INFO](https://redis.io/docs/latest/commands/info/) y
[SLOWLOG](https://redis.io/docs/latest/commands/slowlog/). SLOWLOG mide ejecución
del servidor y excluye la comunicación con el cliente; sus entradas históricas
no se atribuyen a una ventana actual sin correlación temporal.

El inventario y la evidencia privada se conservan bajo
`C:/Users/dcalu/.codex/tmp/redis-audit-20261012/`. No se incluyen secretos, dumps,
argumentos de comandos ni logs comerciales en Git.

La instrumentación completa reproducible queda en `isolated/`, dentro de esa
carpeta privada: `run-paired.ps1 -Variant before` y `-Variant after`, con el
importador TLS y las guardas de identidad/ownership. Las corridas finales son
`isolated/private/integration-runs/baseline-1791785453788` y
`baseline-1791785887763`. Los overlays congelados y sus SHA se conservan en
`isolated/private/paired-sources/manifest.json`; el fixture tiene SHA-256
`15c018a1770de75d762bfc041343ac811cfa10b5924d2f6b2f45c7e4c6523b54`.
No ejecutar esos fixtures contra una instancia compartida. Los contenedores
QA son desechables; reproducir el escenario exige provisionar de nuevo sus
recursos exclusivos y generar un manifiesto válido. Para observación local
habitual, utilizar `pnpm redis:diagnose --seconds 60`.
