# Automatic settlement — 2026-10-03

## Alcance y estado

El usuario autoriza liberar el dinero tres días después de completar el pedido.
Implementación y verificaciones del backend **PASS**; activación sobre la base
habitual y disponibilidad del worker **PASS, ACTIVA**. Exclusivamente Stripe TEST/USD. No amplía
la certificación histórica manual F01–F12 a producción ni al resto de F17.

Implementación inicialmente integrada localmente en `5d0935b`. La publicación
posterior autorizada agrupó todos los cambios en `e3a28e3`, verificado en
`origin/develop` el2026-10-03. El historial previo se conserva en el respaldo
de [la limpieza](repository-cleanup-20261003.md).

La [verificación integral de una venta nueva](automatic-settlement-e2e-20261003.md)
está iniciada. Los checkpoints siguientes conservan sus resultados y límites
históricos; no certifican por sí solos ese recorrido de72 horas reales.

La liberación es una transferencia del derecho neto del vendedor a su saldo
Connect. El calendario de retiro bancario de Stripe sigue siendo independiente.
La captura del pago conserva el flujo operativo existente.

## Regla y persistencia

- Se esperan **72 horas transcurridas**, incluidos fines de semana, desde la
  primera observación servidor del evento nativo `order.completed`. El subscriber
  consulta el pedido sin caché y registra el reloj mediante un workflow. Medusa
  2.18 no conserva un `completed_at` nativo; no se inventa desde `updated_at`.
- El instante, vencimiento, token y vínculo al original financiero se guardan en
  `order_completion`. Reintentos, concurrencia, reconstrucción del servicio y
  pérdida de respuesta después de COMMIT conservan el primer reloj. CHECK SQL
  exige instantes finitos y 259.200 segundos; trigger impide modificarlo.
- El evento puede llegar tarde y el job puede tener backlog: ambas circunstancias
  prolongan la espera; nunca habilitan una liberación anticipada. Los pedidos
  históricos sin reloj siguen disponibles para revisión manual, sin backfill.
- Se descartó el hook compensable: una respuesta COMMIT perdida podía dejar un
  reloj aunque la finalización nativa se revirtiese. El subscriber post-evento no
  compensa su observación durable. Una ventana excepcional publicación/reversión
  del eventbus se cubre además con `observed_order_updated_at`, exclusivamente
  prueba de versión. Cualquier cambio posterior del pedido, incluido repetir la
  finalización, retiene la liquidación para revisión manual. Ese valor jamás
  inicia el plazo.
- El reloj es privado al backend: RLS habilitado, cero políticas públicas y
  privilegios de tabla/rutina revocados a PUBLIC, `anon` y `authenticated` cuando
  existen. El propietario conserva acceso. No se agregan funciones
  `SECURITY DEFINER` ni endpoints de modificación del reloj. Se siguió la
  [documentación oficial RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Ejecución financiera

Un job independiente evalúa hasta 25 pedidos vencidos por minuto. Su cursor
durable, separado de otros scanners, avanza también después de pedidos retenidos
y vuelve al inicio cuando termina el recorrido. Excluye antes de LIMIT cualquier
pedido que ya tenga una operación `payout`, incluso incierta o en curso.

Reutiliza el ejecutor manual, bloqueo de compra/carrito, original inmutable,
operación única `payout:<order>` y key Stripe estable. La autoridad automática es
una capacidad interna de tipo Symbol, imposible de fabricar mediante JSON HTTP.
Revalida reloj, versión, estado completed, cantidades preparadas/enviadas, tienda
abierta, cuenta Connect activa, captura completa, devoluciones atribuibles,
disputas y conciliación bajo el bloqueo. Un escritor anterior o fence activo
impide tomar automáticamente una ejecución ambigua. Las incidencias requieren
el flujo manual de conciliación; no se repiten transferencias inciertas.

Se vuelve a verificar el opt-in antes de reservar la operación monetaria. La
automatización no agrega captura automática, reversión automática, retiro
bancario ni activación LIVE. Los handlers nativos de Mercur permanecen cargados;
no se ocupa un nuevo workflow hook.

## Verificación ejecutada

Artefactos privados externos bajo
`C:/Users/dcalu/.codex/tmp/marketplace-closure-20261002/`.

| Comprobación | Resultado y procedencia |
| --- | --- |
| API lint final | PASS, 0 errores/56 warnings existentes; `root-final-gate-runs/automatic-lint-6cb4ef9e-aaa1-4a45-9ac4-edb00597d5ab`. |
| API tipos posterior al build final | PASS; `automatic-typecheck-da537cf3-fe9e-4642-8389-ef4f83d67dee`. |
| API tests completos | PASS, 118 suites/2.115 tests Jest y 11 tests Node; `automatic-test-00b8e416-8f47-4aed-8809-82766b018355`. La última modificación posterior fue SQL de permisos, cubierta por integración real y build final. |
| API build final | PASS; `automatic-build-6489a1f0-e57c-4641-85a3-348e89e12de4`. Incluye la migración final con RLS/ACL. |
| PostgreSQL del módulo | PASS, **13/13**; `private/automatic-settlement-runs/oct3-auto-modules-2`. Repositorios y transacciones reales, TLS verificado, SQL de la migración efectiva. |
| CLI Medusa | PASS; `oct3-auto-migrate-3`, base nueva y vacía, migraciones, links y siete scripts. Ninguna base compartida. |
| Auditoría SQL final | PASS; `oct3-auto-migrate-audit-2`, transacción readonly/TLS, prueba NOT NULL, CHECK exacto, trigger, RLS, ACL PUBLIC y ambos roles API sin acceso. Cero relojes/originales/operaciones en esa base vacía. |
| Preservación | Guards: cero conexiones prohibidas, archivos protegidos intactos y procesos/puertos habituales conservados. `.mercur/routes.d.ts` conserva SHA256 `EAA806EA3E3B349D2858771B05A457573C9AD9EA5304F14B4F8EC0DEB5CCE5B9`. |

Las pruebas cubren 72 horas menos un milisegundo frente al límite exacto, cambio
horario/offset, fechas inválidas, vendedor cerrado, preparación/envío, disputa,
versión cambiada, opt-in revocado antes de claim, concurrencia manual/automática,
transferencia única, replay e incertidumbre sin repetición. La composición usa el
workflow nativo de finalización con hooks Mercur cargados y publicación/reversión
controladas. Las llamadas monetarias de esos tests están simuladas; no prueban
una transferencia Stripe nueva ni 72 horas reales de espera en un worker activo.

Se conservan fallos de feedback sin convertirlos en PASS: cast de Symbol en un
test corregido; primera migración aislada con dos probes UI prohibidos bloqueados
antes de conexión. La segunda y la final se ejecutaron con NODE_ENV=production
en el hijo de migración para omitir esos probes, sin relajar las guardas.

## Base habitual y activación autorizada

El usuario responde «si, te doy autorizacion» a la aplicación de las cuatro
migraciones y activación TEST. No se solicita nuevamente esa autorización.
Antes de la primera aplicación compartida se completó RLS/ACL de las cuatro
tablas financieras creadas después de la migración general de permisos: esa
migración anterior revoca defaults, pero no activa RLS de tablas futuras.
La migración `61545` y su caso SQL ahora verifican las cinco tablas financieras.

Verificación de ese ajuste, sin cambios de lógica monetaria:

- API lint PASS `automatic-lint-69a50f4b-939b-4385-9588-9a562b81b43a`;
  tipos PASS `automatic-typecheck-b2fc7aff-e48b-43d2-aeb9-620f4e4dbffe`;
  build PASS `automatic-build-72e80fc7-c665-4953-bb59-0ad85f890422`.
- PostgreSQL **13/13 PASS** `oct3-auto-modules-3`, smoke CLI PASS
  `oct3-auto-migrate-4`, auditoría SQL readonly/TLS **cinco tablas privadas PASS**
  `oct3-auto-migrate-audit-3`. SHA256 de la migración:
  `F29F6559E0A2D281C8B1A70A61A9240C7A97A882AA97D2AF4CF7A993631F2D30`.
- La CA oficial Supabase Root 2021 se obtuvo por HTTPS de la URL publicada por
  Studio. Una conexión nueva ya verifica cadena, hostname y socket autorizado;
  no se altera la configuración legacy del repositorio ni se relaja TLS.

Los registros siguientes describen el precheck y estado **antes de activar**.

Precheck PostgreSQL directo: certificado `SELF_SIGNED_CERT_IN_CHAIN`, cero
consultas y ningún cambio de TLS. Recibo `oct3-shared-readonly-precheck-1`.
El MCP Supabase instalado permitió continuar por su API con transacciones
`BEGIN TRANSACTION READ ONLY`; no se importaron proveedores ni se escribieron
datos. El project ref se contrastó con el destino exacto del `.env` ignorado.

Ledger habitual completo comparado con las migraciones nativas del smoke final:
cuatro migraciones fuente pendientes, todas financieras. Cinco entradas
históricas adicionales del ledger no están ya en las migraciones instaladas;
no se borran ni se reparan. El catálogo no muestra objetos públicos ajenos al
propietario ni grants de backend no revisados según las guardas de hardening.
Recibo saneado `oct3-shared-mcp-precheck-1/proof.json`.

| Migración pendiente | Efecto |
| --- | --- |
| `Migration20260919120000` | Permisos privados del esquema backend; no tiene reversión automática. |
| `Migration20260919221631` | Originales financieros inmutables. |
| `Migration20260922224024` | Journal de recuperación y hechos/costes del proveedor. |
| `Migration20261003061545` | Reloj privado e inmutable de las 72 horas. |

La base habitual tiene `commerce_operation` y `commerce_scan`; las cinco tablas
financieras nuevas de esta lista están ausentes. No se han aplicado estas cuatro
migraciones allí. No se modificó `.env`: el flag nuevo sigue sin definir y el
general sigue falso. No se realizó push ni se reiniciaron procesos habituales.

Después de autorización específica, revisar nuevamente el conjunto pendiente y
el acceso del backend; aplicar únicamente el alcance financiero revisado por la
vía de migraciones nativas. El CLI instalado permite `--skip-links --skip-scripts`
para evitar tareas ajenas a esta extensión, pero no permite seleccionar módulos
al migrar hacia arriba: no ejecutarlo si aparecen otros pendientes. Conservar
verificación TLS cuando se prepare una conexión nueva; el precheck MCP no
acredita una conexión PostgreSQL directa válida.

Solo después de verificar el esquema, configurar en API/worker
`STRIPE_AUTOMATIC_SETTLEMENT_ENABLED=true`, conservar
`STRIPE_AUTOMATIC_JOBS_ENABLED=false` y reiniciar esos procesos. Verificar worker
activo, evento/clock de un pedido nuevo y retención. La liberación integral real
del nuevo camino y el entorno habitual permanecían **NEEDS VERIFICATION** hasta
su ejecución; las pruebas manuales históricas no sustituyen esa evidencia.

## Activación efectiva — 2026-10-03 07:47 UTC

Las cuatro migraciones autorizadas se aplicaron por CLI nativo a la base
habitual. `oct3-shared-native-migrate-1/finished.json`: exit0, 55 módulos
inspeccionados, únicamente commerce-automation con pendientes, transacción ORM
agrupada, `--skip-links --skip-scripts`, 58 conexiones TLS verificadas, cero
acciones rechazadas y archivos protegidos intactos. No se reparó el ledger
histórico. Los proveedores estaban sin credenciales durante la migración.

Auditoría posterior readonly por MCP Supabase, contrastada con el destino
habitual: las cuatro entradas están en el ledger. Las cinco tablas financieras
tienen RLS, cero políticas públicas y cero ACL PUBLIC; `anon`/`authenticated`
carecen de privilegios y el backend propietario conserva acceso. El reloj tiene
NOT NULL, CHECK259.200segundos y trigger inmutable; su rutina tampoco permite
ejecución pública ni de esos dos roles. Recibos
`oct3-activation-1/schema-verified.json` y `schema-additional-verified.json`.

La revisión del advisor conserva el aviso informativo
[RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
esperado para tablas privadas del backend. Dos funciones de rechazo inmutable
conservan el aviso
[search_path mutable](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable):
se revisaron sus cuerpos, exclusivamente RAISE EXCEPTION, sin consultas,
SQL dinámico ni SECURITY DEFINER. No se agregó una quinta migración ni se
alteraron los permisos revisados. `advisors-reviewed.json` conserva la evaluación.

Se agregó únicamente `STRIPE_AUTOMATIC_SETTLEMENT_ENABLED=true` al `.env`
ignorado, preservando exactamente sus 2.428 bytes anteriores. El flag general
`STRIPE_AUTOMATIC_JOBS_ENABLED=false` se mantiene. Configuración Stripe TEST
verificada; recibo `env-activated.json`. Se cerró el watcher API antiguo detenido
con salida0 y se arrancó únicamente `pnpm run dev:api`, modo shared, con CA
oficial y verificación de cadena/hostname. Health200 a07:44:47UTC; launcher7808,
API9000 PID12496. Vistas3000/7000/7001 y Redis/infraestructura QA conservaron sus
PIDs. `private/habitual-api-runs/oct3-automatic-activated-1/` conserva logs
saneados y recibos del arranque.

Diagnóstico directo final readonly/TLS a07:47:48UTC:
`private/habitual-api-inspections/oct3-activation-after-runtime-3/proof.json`,
**automation_ready:true**. Scheduler nativo registrado, patrón `* * * * *`, un
worker de eventos y uno de jobs, último cron natural completado a07:47:03UTC.
El scanner durable ya avanzó naturalmente. No se inició otro bootstrap, no se
fabricaron eventos/pedidos ni se forzó un job. Las dos inspecciones anteriores
se conservan: su contador de eventos buscaba erróneamente el prefijo `bull`;
el instalado usa `RedisEventBusService`. Se corrigió exclusivamente el helper
externo contra fuentes Medusa/BullMQ, sin cambiar el runtime.

Antes/después del arranque: 14 operaciones financieras, mismo fingerprint
`e71a054480e4ca3c054fdb546454dae1`, cero payouts nuevos, cero relojes y cero
originales. **No se realizó movimiento Stripe para esta activación.**
Preservación readonly a07:47:19UTC PASS:101 archivos+2 posteriores y55 filas
ajenas del lockfile intactas; ninguna restauración. El archivo generado
`.mercur/routes.d.ts` conserva el hash documentado.

Activación y readiness habitual quedan verificadas. El evento de finalización
de un pedido nuevo y la transferencia integral después de 72 horas reales
siguen **NEEDS VERIFICATION**: todavía no existe un reloj normal en esta base.
El comportamiento está cubierto por las pruebas backend citadas; los ciclos
vacíos del cron no equivalen a esa prueba económica. No se aplicó backfill,
no se repitieron movimientos anteriores, no hubo LIVE, retiro bancario,
despliegue ni push. No quedan acciones de activación autorizadas pendientes.
