# F07/F08 y fuentes F09 — liquidación y recuperación

Estado al 2026-09-22: implementación congelada y controles locales aprobados. No constituye Financial Readiness PASS. Esta tarea no ha ejecutado todavía el circuito real Stripe TEST ni el navegador.

## Economía y ejecución

- El snapshot original conserva bruto, comisión y derecho del vendedor. Los refunds usan redondeo acumulativo al centavo sobre ese original, incluso antes de transferir.
- `seller_entitlement_reduced` registra el ajuste económico; `seller_reversed` registra únicamente el reversal confirmado. El principal transferido después de un refund no sustituye al derecho original.
- Caso probado: G=100, C=10, N=90; refund 20 reduce derecho 18; transferencia 72; refund 10 revierte 9 y comisión 1. Resultado: vendedor 63, comisión 7.
- La liquidación manual valida captura nativa y Stripe, reparto del pago compartido, original, ajustes conciliados, actor y cuenta Connect vigente. Congela plan, destino, charge de origen y transfer_group compartido. Derecho cero registra `no_transfer_required` sin enviar una transferencia de cero.
- El inicio del pago impone captura manual y rechaza metadata reservada de operaciones financieras. Conserva parámetros nativos de sesión, método, confirmación e idempotencia.
- El flujo nativo de payout permanece bloqueado fuera de la liquidación planificada. El flujo nuevo reutiliza el paso nativo de creación y su enlace, conservando el contrato Mercur.

## Recuperación

`recover-order-finance.ts` inspecciona por defecto. Ejecutar requiere actor operador existente, motivo, `--execute` y el `--plan-hash` de la inspección vigente. Una inspección cambiada debe revisarse de nuevo.

La recuperación adopta hechos exactos: transfer/payout/enlace, refund Stripe/Refund nativo, credit line y transacción faltantes, reversals confirmados, captura y cancelación de autorización. No supone que la ausencia de un efecto después de un intento autorice repetirlo: la retención de claves idempotentes no garantiza deduplicación indefinida.

La evidencia de captura (`payment_intent_id`, `charge_id`, importe, reparto y `released_refund_ids`) se guarda antes de la contabilidad local. Si ésta falla, la recuperación valida esas referencias y registra la captura nativa con `is_captured: true`; no vuelve a capturar ni deduce los IDs de liberaciones por su importe.

Cada intento financiero conserva plan, resultado previo, actor, motivo, observación, checkpoints y resultado final. Las escrituras comparan propietario, token y estado; un escritor anterior no puede continuar después de una recuperación.

El bloqueo de ejecución no vence por TTL. Su candidato UUID/host/PID se guarda antes de adquirirlo. `--release-stopped-writer` exige el mismo host, prueba ESRCH del proceso y liberación condicional del propietario exacto. Un proceso vivo, permisos insuficientes o un host distinto mantienen el bloqueo.

Para la interrupción anterior a crear una operación, el mismo CLI acepta `lock:<owner UUID>` como segundo argumento. La reserva del grupo vincula el token al candidato en una sola transacción. La limpieza adquiere un nuevo bloqueo durable, verifica que el proceso anterior terminó y libera esa reserva únicamente mediante CAS si no tiene operaciones, revisiones, retenciones ni contexto desconocido. Registra la auditoría en la misma transacción. Esto también permite repetir la inspección después de una interrupción entre liberar el bloqueo anterior y resolver la reserva. No mueve dinero.

## Fuentes de reporting

`recordOrderFinanceProviderFacts` registra observaciones verificadas dentro del flujo financiero. `readOrderFinanceReportingSources` sólo lee persistencia; no consulta Stripe ni escribe. Valida al operador y limita al vendedor a sus pedidos.

La respuesta contiene `facts`, `costs`, `coverage`, `capture_allocations` y `refund_adjustments`:

- Clave única por cuenta, modo y movimiento; una captura y un coste compartidos se cuentan una sola vez.
- `effective_at` distingue fecha efectiva de creación y de conciliación. La captura manual usa `charge.captured`; el refund usa evidencia del estado confirmado. Una fecha desconocida permanece desconocida.
- Cada asignación propia incluye `effective_at`, `effective_source`, `effective_time_status`, `recorded_at` y `reconciled_at`. Cero capturado es `not_applicable` y no hereda la fecha de otra orden.
- El vendedor no recibe importes de la captura compartida, costes globales ni IDs de pedidos ajenos.
- Refund libre conserva `component_attribution: unallocated`; no se inventa una distribución por mercancía, envío o impuestos.
- Costes pendientes o no disponibles no equivalen a cero. Un balance_transaction sólo se registra una vez y puede pasar de pendiente a confirmado.
- `mode` y `data_kind` distinguen TEST/live y ordinary/qa_fixture/unknown. La marca QA proviene de configuración de servidor local verificada, no de metadata del cliente.
- Cobertura persistida y revisión de operaciones detectan observaciones desactualizadas, originales ausentes, fechas desconocidas, movimientos sin atribuir y conciliaciones abiertas.

Una relectura final acotada compara el grupo, sus operaciones y resultados, originales, captura y payouts con las revisiones usadas para construir la respuesta. Un cambio concurrente conserva los hechos disponibles pero marca cobertura incompleta (`reporting_read_changed`); un hecho cuya operación no aparece en las revisiones observadas también queda pendiente (`provider_fact_operation_unobserved`). El lector no reintenta ni escribe para disimular la inconsistencia.

Antes de registrar `finalCapture`, una liberación sin evidencia explícita puede permanecer sin atribución. No genera un refund propio ni ajuste por pedido. Después de la recuperación se reclasifica bajo la misma clave canónica. Los agregadores administrativos deben respetar atribución, estado y cobertura.

## Persistencia y validación comprobada

La migración `Migration20260922224024` añade exclusivamente `finance_recovery_attempt`, `finance_provider_fact` y `finance_provider_cost`, con sus índices. Se generó con Medusa instalado y se aplicó con `db:migrate --skip-links --skip-scripts` a una base local desechable `closure_finance_generate_*`. Se verificaron las tres tablas y se eliminó esa base. No se modificó una base remota o compartida.

Ejecución final PostgreSQL real: **7/7 PASS**, con claim concurrente, checkpoint y takeover, rollback ante fallo de auditoría, deduplicación concurrente y fechas de coste, rollback de lote contradictorio, seis candidatos concurrentes con un único token vinculado atómicamente y cleanup bloqueado por operaciones o retenciones. La suite crea y elimina su propia base local con TLS. La ventana DB15 se liberó explícitamente después del resultado.

Validación final: **1475 pruebas unitarias, 86 suites PASS**, más **3 pruebas de preparación de despliegue PASS**. El circuito nativo de inicio verificó primero **10 fallos** y luego **40 PASS**; esas pruebas están incluidas en el total.

Después de esa ejecución completa se corrigió la coherencia concurrente del lector: **83 pruebas enfocadas PASS**, incluidas tres regresiones nuevas, más lint y typecheck API. El helper de configuración QA añadió **11 pruebas de rechazo PASS** para comprobar que un destino remoto/compartido, una URL de base inválida, una clave live o configuración insegura se rechazan antes de consultar o crear cuentas. Su lint y el typecheck API pasaron. Estos resultados son ejecuciones posteriores y no se suman al total anterior como si se hubiera repetido la suite completa.

Controles ejecutados: `pnpm lint:api` sin errores (51 advertencias existentes o de rutas previamente presentes), `pnpm typecheck:api`, `pnpm test:api`, `pnpm build:api`, comprobación del contrato financiero generado, `pnpm peers check` y `git diff --check`. Build usa sólo configuración temporal del importer local, sin proveedores externos. La instalación congelada de pnpm y las pruebas de primitivas nativas verificaron los parches instalados.

Pendientes para cierre: circuito Stripe TEST efectivo con fixtures propios y comprobación de navegador coordinada con F12. Los unitarios y PostgreSQL no sustituyen estas pruebas.

`integration-tests/helpers/configure-native-finance-fixture.ts` inspecciona por defecto el fixture nativo ya existente. El modo explícito `setup` habilita el proveedor de la región mediante el workflow nativo, crea cuentas Express TEST y guarda sus enlaces de onboarding sólo en un archivo privado nuevo fuera del repositorio. No crea pedidos ni pagos. `refresh` reutiliza el workflow autorizado para leer el estado real de Stripe; nunca marca una cuenta activa manualmente. El helper exige base local desechable `closure_browser_*`, TLS, correos y jobs deshabilitados, claves TEST y la marca QA del servidor. Su presencia y sus pruebas de guardas no acreditan una ejecución externa.

`integration-tests/helpers/verify-native-finance-fixture.ts` queda preparado para dos pedidos del mismo checkout creado en la interfaz. Inspecciona por defecto; cada ejecución explícita realiza una fase (`capture`, `refund-before`, `settle`, `refund-after`, o `cancel-before-capture` para un segundo checkout parcial). Requiere fulfillment nativo previo a captura. Verifica pertenencia al manifest, captura por pedido, identidad de refunds y transfers, journal sin incertidumbres y conservación G/C/N mediante un oráculo independiente de enteros. Los refunds por defecto son 2 y 3 USD, sujetos al original real. Guarda request y observaciones en un archivo privado nuevo, append-only con fsync, y repite la misma solicitud únicamente después de comprobar su éxito. Ante una excepción se detiene sin repetir efectos. **41 pruebas enfocadas PASS**, typecheck y formato PASS; lint explícito del helper y su spec: cero errores y tres advertencias QA (errores sanitizados e importe Stripe en centavos). No se ejecutó aún contra Stripe/DB.

El CLI Medusa 2.18 usa argumentos variádicos y modo estricto. Para transportar opciones del script, pasar **todos** sus argumentos como `--args=<valor>`; un `--execute` suelto se rechaza y ponerlo detrás de `--` no lo entrega al script. Se comprobó el parser instalado sin cargar DB ni proveedores. Tras preparar el entorno aislado autorizado, el formato es:

```text
pnpm --filter @usapeek/api exec medusa exec ./integration-tests/helpers/verify-native-finance-fixture.ts --args=capture --args=order_1 --args=order_2 --args=--execute
pnpm --filter @usapeek/api exec medusa exec ./src/scripts/recover-order-finance.ts --args=order_1 --args=payout:order_1 --args=actor_id "--args=Motivo de conciliación" --args=--execute --args=--plan-hash=<hash> --args=--release-stopped-writer
```

Los identificadores son marcadores de formato, nunca fixtures precargados. Primero debe ejecutarse la inspección sin opciones de ejecución; el hash y la prueba de proceso detenido proceden de esa corrida real.

`integration-tests/helpers/interrupt-native-finance-settlement.ts` prepara el fallo F08 sobre el vendedor intacto del grupo normal, después de completar los dos refunds de F07 en el otro pedido. Conserva `FINANCE_NATIVE_QA_TARGET_ORDER_ID` como el pedido F07 y requiere `FINANCE_NATIVE_QA_INTERRUPT_ORDER_ID` para su hermano, junto con un archivo privado nuevo `FINANCE_NATIVE_QA_INTERRUPT_OUTPUT_PATH`. Inspecciona por defecto, incluso después de recuperar. Para inducir el fallo exige `interrupt` y ambos argumentos explícitos `--execute` y `--crash-after-transfer`, transportados con `--args=`.

El helper sustituye temporalmente el callback de la instancia nativa `payoutProviderService_.createPayout`, cuyo lugar anterior a `super.createPayouts` se verificó en Mercur 2.3.3 instalado. Llama al callback original una sola vez y valida importe, destino, charge, grupo, metadata y modo TEST. Guarda request completo, plan, host/PID y observaciones con append y fsync. Sale deliberadamente con código **86** sólo después del checkpoint `transfer_verified_before_native_persistence`, antes de devolver a la persistencia nativa; conserva así el journal, bloqueo y reserva reales. No cambia producción ni fuerza estados mediante SQL. Una respuesta distinta o fallo de checkpoint se detiene para inspección y no se considera un crash verificado.

La ejecución externa queda pendiente. Deberá comprobar un único transfer sin payout local, usar el CLI general de recuperación con hash vigente y prueba del proceso detenido para adoptar/enlazarlo, y verificar el mismo transfer ID, payout único y reserva liberada. Repetir después la solicitud original completa mediante `settle-order-finance.ts` debe devolver el resultado persistido sin otro transfer. **63 pruebas enfocadas PASS** (22 nuevas de interrupción y las 41 del verificador), typecheck API PASS; lint explícito de los dos archivos nuevos: cero errores y siete advertencias QA (errores de control e importes Stripe en centavos). Estas pruebas son simulaciones del límite de interrupción; no acreditan un transfer real.

La revisión independiente añadió una guarda Redis común a los tres helpers. Antes de consultar o ejecutar workflows, exige `rediss://localhost:56379/15`, sin query/fragmento, certificado CA disponible y validación TLS activa. Contrasta el entorno con `projectConfig.redisUrl` y las conexiones efectivas de módulos y proveedores. La inspección del código instalado confirmó y cerró también `redis.options` heredado, la conexión separada `redis.pubsub` y las opciones adicionales que el caché reenvía a ioredis. Se rechazan opciones de transporte/TLS alternativas; las opciones nativas de trabajos y workers permanecen admitidas. Resultado posterior: **109 pruebas enfocadas PASS en tres suites**, typecheck API PASS y lint sin errores; la última revisión del guard y su spec conserva una advertencia previa por un importe Stripe en centavos. El launcher aislado sigue siendo obligatorio para proteger la carga inicial de Medusa, que sucede antes de invocar un helper. No hubo ejecuciones de DB, Redis ni Stripe durante estos controles.

## Diagnóstico del worker QA — 2026-09-26

La inspección QA posterior detectó un rechazo previo a cualquier operación económica: Medusa `defineConfig` añade `projectConfig.redisOptions.retryStrategy` incluso cuando la configuración fuente declara sólo la URL. La guarda admite ahora únicamente ese callback nativo, comparando su código con el default del paquete instalado mediante `Function.prototype.toString`, sin ejecutar callbacks desconocidos. No admite otras claves ni extiende la excepción a opciones de módulos. Regresión: **18/18 PASS** con `defineConfig` y `ConfigManager` reales, bloqueo de sockets y cero conexiones TCP/TLS; **109/109 PASS** en las tres suites anteriores. Se mantienen rechazados destinos alternativos, overrides TLS, callbacks sustituidos y suplantación de `toString`.

Una segunda inspección saneada del coordinador confirmó que `MedusaApp` añade metadata SQL `database` a las opciones del event bus durante bootstrap. El loader event-bus-redis ignora esa metadata. La guarda admite la copia nativa sólo en ese módulo exacto, con el símbolo interno de conexión compartida, URL SQL igual al proyecto y opciones coincidentes; la excepción no alcanza providers ni otros transportes Redis. **10/10 PASS** adicionales componen `MedusaAppLoader` y la inyección real, interceptando `bootstrapAll` antes de cargar módulos y bloqueando sockets. Cubren la inyección válida y el rechazo de destinos/TLS alternativos, SQL preconfigurado, URL SQL diferente o ausencia del símbolo nativo.

La revisión del log externo `browser-native-api-test.log` del 22 de septiembre muestra conexión inicial de los módulos Redis, seguida de `connect ETIMEDOUT`, `Connection is closed.` y el rechazo de `bullWorker_.run()` antes de que el HTTP quedara listo. El log no identifica por qué expiró esa conexión ni permite atribuirlo a la caducidad posterior del certificado. Un HTTP saludable no acreditaba el funcionamiento del worker en ese arranque.

Se inspeccionaron Medusa 2.18.0, BullMQ 5.13.0 e ioredis 5.11.1 instalados. El event bus entrega su instancia Redis después de las opciones de queue/worker; BullMQ crea su conexión bloqueante con `duplicate({ connectionName })`, que conserva TLS, destino, credenciales, DB y `lazyConnect`. No existe una rama `NODE_ENV=test` que cierre esa conexión. `drainDelay` no controla el timeout de conexión.

Existe una limitación de inicialización compatible con el error observado: cuando el cliente duplicado está en estado `wait`, `RedisConnection.waitUntilReady()` espera el primer `connect()`. Si éste rechaza, BullMQ conserva esa promesa rechazada incluso ante un `ready` posterior. El worker espera esa promesa antes de entrar en su bucle de reintentos, y el hook Medusa registra el rechazo sin reiniciar el worker. Esto explica cómo un fallo inicial puede persistir, pero no determina la causa del timeout del 22 de septiembre.

La sonda externa `event-bus-startup-probe.cjs`, ejecutada con los paquetes instalados y transporte simulado, comprobó **3/3 PASS**: conservación de opciones al duplicar, persistencia del rechazo tras un `ready` posterior y arranque correcto cuando la primera conexión tiene éxito. Bloqueó las funciones de apertura de sockets y registró **cero intentos de red**. No cargó Medusa ni consultó DB, Redis o Stripe.

El coordinador reinició su API QA el 26 de septiembre. La lectura de `browser-native-api-20260926.log` confirmó arranque limpio en 7575 ms y, a las 15:16:28 según ese log, procesamiento nativo de dos eventos `order.placed` y uno `order_group.created`. Los tres indicaban cero subscribers: acreditan ejecución del procesador de eventos, no efectos de subscribers ni el cierre financiero. No se introdujo un cambio productivo, un ajuste de timeout o una actualización de dependencias por el fallo histórico.

## Compatibilidad y límites

Se mantienen Medusa 2.18.0, Mercur 2.3.3 y Stripe SDK 15.12.0. Los parches reproducibles añaden propagación de metadata de refund, registro nativo de payout conciliado sin volver a transferir y transfer_group explícito para cargos compartidos. El lockfile completo contiene un overlay ajeno y no forma parte de los commits de esta tarea; el coordinador integra sólo su delta de parches.

Una ausencia ambigua, refund pendiente, destino contradictorio o importe no conciliado mantiene el bloqueo. La limpieza anterior a una operación exige la relación durable entre propietario y token; las reservas legacy sin esa relación permanecen retenidas. No se activaron jobs automáticos, pagos live ni payouts bancarios.
