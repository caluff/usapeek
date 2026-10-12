# Verificación integral de liberación automática — 2026-10-03

## Estado vigente

**NEEDS VERIFICATION — comprobación bloqueada el 2026-10-06; seguimiento pausado.** El usuario solicita
actualizar documentación vigente y verificar el circuito automático completo.
Se conserva el plazo de 72 horas transcurridas desde la observación servidor
del evento nativo de finalización; no se adelantan relojes ni se reutilizan
pedidos históricos para simular el vencimiento.

El plazo ya venció, pero no se pudo consultar el entorno original. La configuración
actual desactiva la liberación automática y apunta a PostgreSQL de loopback; los
verificadores autorizados están restringidos al proyecto Supabase original.
La liberación del pedido #16 y el funcionamiento actual del cron no están certificados.

El alcance es Stripe TEST/USD: transferencia al saldo Connect, no retiro bancario
ni operación LIVE. Captura, preparación, envío y finalización mantienen sus
flujos nativos. La transferencia deberá ejecutarla el job habitual; no se
sustituirá por el ejecutor manual para acreditar automatización.

## Comprobación al vencimiento — 2026-10-06

Heartbeat recibido a las `2026-10-06T15:58:37.194Z`, después del vencimiento
original `2026-10-06T15:51:00.416Z`. Se ejecutaron exclusivamente los dos
verificadores externos autorizados, sin alterar su fuente ni sus guardas:

- `verify-habitual-automatic-order.cjs --order-id order_01M416TPRT4Q0BVR20YDN7EAH8
  --run-id oct6-normal-after-72h-1`: exit 1 en `argument_validation`, antes de
  crear el directorio de corrida o iniciar el hijo. La configuración actual
  contiene `STRIPE_AUTOMATIC_SETTLEMENT_ENABLED=false`; el driver exige true.
- `inspect-habitual-automatic-settlement-direct.cjs --run-id
  oct6-automatic-readiness-1`: exit 1. El preloader rechazó la configuración
  antes de conectar: `Verified Supabase TLS preload configuration is required`.
  La URL de base actual corresponde a loopback, fuera del destino Supabase
  fijado por ese verificador. `STRIPE_AUTOMATIC_JOBS_ENABLED` sigue false.

No se ejecutaron consultas PostgreSQL/Redis ni GET Stripe en estas corridas,
porque ambas se detuvieron antes de conectar. No se comprobó la presencia de la
API, el cron, transferencias, informes o duplicados; estos fallos de preflight no
demuestran que el dinero se haya liberado ni que siga pendiente. No se cambiaron
configuración, relojes, jobs ni operaciones financieras; el inspector confirmó
`root_env_unchanged:true`. No se relajó TLS ni se consultó otra base como sustituto.

Evidencia privada: `C:/Users/dcalu/.codex/tmp/marketplace-closure-20261002/private/
habitual-api-inspections/oct6-automatic-readiness-1/`, con `finished.json`,
`stderr.log`, `stdout.log` y copias de los dos documentos previas a esta actualización.
El verificador de pedido sólo produjo su error de preflight en la salida del
comando; no generó `proof.json` ni un directorio de corrida.

Se pausó el heartbeat `verificar-liberaci-n-autom-tica-del-pedido-test-16`,
conservando prompt, intervalo y chat de destino. Para continuar se necesita
confirmar dónde reside ahora el pedido TEST #16 y qué entorno debe verificarse.
No se certifica el cierre integral; LIVE y retiro bancario siguen fuera de alcance.

## Preflight ejecutado

Lectura directa con PostgreSQL READ ONLY, TLS verify-full y Redis sin mutaciones,
2026-10-03T15:26:38Z: **PASS**. Flag específico activo, flag general desactivado,
un worker de eventos y uno de jobs; cron natural completado15:26:04UTC y
`automation_ready:true`. Cero relojes de finalización existentes. Las14
operaciones financieras previas conservan su fingerprint.

Recibo privado externo:
`C:/Users/dcalu/.codex/tmp/marketplace-closure-20261002/private/habitual-api-inspections/oct3-e2e-preflight-1/`.

## Criterio de cierre

1. Compra nueva TEST por checkout habitual, con datos ficticios y un pedido propio
   del circuito; original financiero y comisión contrastados.
2. Captura, preparación/envío y finalización nativos; reloj durable y prueba de
   versión coherentes, vencimiento exactamente 259.200 segundos posterior.
3. Antes del vencimiento, ausencia de transferencia; cron activo sin forzarlo.
4. Tras 72 horas reales, una única transferencia creada por el camino automático;
   importe y destino coherentes con el derecho neto y comisión retenida.
5. Persistencia, Stripe TEST e informes admin/vendor coinciden; siguientes ciclos
   del cron no duplican la operación ni la transferencia.

Las pruebas backend y los ciclos vacíos previamente certificados no sustituyen
este criterio. Reiniciar o apagar el equipo puede retrasar la ejecución y la
verificación; no modifica el plazo guardado en PostgreSQL.

## Compra y finalización nativas — PASS parcial

Nueva compra por el checkout habitual `localhost:3000`, con tarjeta 4242 TEST,
contacto ficticio y sin guardar tarjeta ni suscribir avisos de Stripe. Pedido
**#16**, `order_01M416TPRT4Q0BVR20YDN7EAH8`, carrito
`cart_01M4160N91C7D7R6TSS5BE9H06`, grupo `og_01M416TQ6MBWBJAG3CXY3JPJH6`.
Tienda `sel_01M1SJQH2N0X7K3TG29TEY48EC`. Una unidad de mercancía USD 200
y envío USD 20: bruto **USD 220**, comisión original **USD 16**, derecho vendedor
**USD 204**. La comisión se contrasta con el original inmutable; no se recalcula
sobre la tasa vigente ni se confunde con los costes Stripe.

Preparación, envío y entrega simulados mediante controles nativos del vendedor;
captura completa una sola vez desde admin y finalización nativa desde vendor.
Ambos paneles confirman Completado/Pagado/Entregado, con captura USD 220 y
reembolsado USD 0. No se ejecutó liquidación manual, evento artificial ni job
forzado. El contacto ficticio no certifica entrega real de mercancía o correo.

El subscriber observó la finalización en **2026-10-03T15:51:00.416Z** y persistió
el vencimiento **2026-10-06T15:51:00.416Z**, exactamente 72 horas después:
**6 de octubre, 12:51:00.416 en America/Montevideo**. La versión nativa actual 4
es coherente con los cambios logísticos; el original financiero permanece en
versión 1. `updated_at` valida la versión observada, no inicia el plazo.

Comprobación externa a las **15:57:08 UTC**: `passed:true`,
`status:not_due_waiting`, `full_72h_e2e_passed:false`. Una captura ordinaria
confirmada en persistencia y Stripe TEST, cero refunds, cantidades 1/1/1/1,
cero operaciones de liquidación, cero payouts nativos y **cero transferencias
anticipadas**. Las 14 operaciones históricas ajenas conservan el fingerprint
`e71a054480e4ca3c054fdb546454dae1`. PostgreSQL READ ONLY con TLS verificado,
cinco GET Stripe y cero solicitudes prohibidas; `.env` raíz sin cambios.

Recibo privado externo preferido:
`C:/Users/dcalu/.codex/tmp/marketplace-closure-20261002/private/normal-automatic-order-verifications/oct3-normal-before-72h-verified-1/proof.json`.
El anchor inmutable y la captura visual `order16-completed-before72h.jpg` están
en el mismo directorio padre privado. No se incorporan secretos a Git.

Informes en navegador, filtros **Hoy / Operación normal / America/Montevideo**:
admin muestra mercancía USD200, comisión USD16 y pendiente USD204; vendedor
ventas netas USD220, ganancias USD204, transferido USD0 y pendiente USD204.
La cobertura global sigue parcial por históricos sin clasificación y tarifas
no confirmadas; el resultado después de tarifas permanece desconocido. No se
equipara esa cobertura global con el PASS de importes del pedido nuevo.
Snapshots y capturas `admin-before72h.txt`, `vendor-before72h.txt`,
`admin-finance-before72h.jpg` y `vendor-finance-before72h.jpg` quedan privados.

Tras la última actualización documental del backend, inspección readonly
**16:06:00 UTC PASS**: un worker de eventos y uno de jobs, cron natural terminado
16:05:03 UTC, `automation_ready:true`, mismo reloj y prueba de versión.
Recibo `private/habitual-api-inspections/oct3-e2e-docs-final-1/proof.json` bajo el
baseline externo; cero reloj vencido, ningún payout nuevo.

## Corrección de checkout y calificaciones

El GET de carrito/opciones de envío podía chocar con el lock de ownership al
navegar con prefetch y base remota lenta. El transporte reintenta exclusivamente
el conflicto GET de ese lock, como máximo dos veces dentro de un plazo de
30 segundos; los enlaces del checkout evitan prefetch. Mutaciones mantienen
un solo intento y un plazo de 90 segundos. No se relajó el lock backend ni se
repitió compra, captura o solicitud de envío tras timeout.

`pnpm lint:web` y `pnpm typecheck:web` **PASS**; harness externo sobre el
transporte real **14/14 PASS**, incluidos límites, abortos, preservación de
headers y ausencia de reintentos de mutación. Compra nativa posterior **PASS**.
No se añadieron archivos unitarios al repositorio. Evidencia de gates:
`C:/Users/dcalu/.codex/tmp/marketplace-closure-20261002/root-final-gate-runs/cleanup-web-bf9c59e7-745b-41e8-b84b-bfa7e24167dd/`.

El primer verificador externo falló por exigir incorrectamente versión nativa 1;
se corrigió según la fuente instalada de Medusa, conservando original y reloj
inmutables. No fue un defecto de la aplicación ni produjo mutaciones. Los
recibos fallidos se conservan, separados del PASS parcial preferido.

El subscriber de notificación de envío registró fallos/reintentos. La logística,
captura y reloj sí quedaron confirmados; **correo no verificado**. No se atribuye
una causa ni se acredita recepción sin diagnóstico y evidencia independientes.

## Seguimiento y cierre pendiente

Heartbeat local `verificar-liberaci-n-autom-tica-del-pedido-test-16`, cada
24 horas, pausado el 2026-10-06 por el bloqueo documentado arriba. Antes del
vencimiento terminó sin consultas de red ni mutaciones.
Después ejecuta sólo los verificadores externos revisados
`infrastructure/verify-habitual-automatic-order.cjs --order-id order_01M416TPRT4Q0BVR20YDN7EAH8 --run-id <nuevo>`
y `infrastructure/inspect-habitual-automatic-settlement-direct.cjs`, bajo
`C:/Users/dcalu/.codex/tmp/marketplace-closure-20261002/`.

La API/shared y Redis deben estar operativos para ejecutar el job natural; el
equipo y Codex deben estar disponibles para el seguimiento local. Si no están,
se registra la limitación, sin acortar el plazo ni simular éxito. Un diagnóstico
de estado incierto no autoriza repetir dinero, editar SQL o liquidar manualmente.

Pendiente: conciliar una única transferencia automática TEST de **USD 204**
después del vencimiento, actor/token/plan/destino y enlace payout coherentes,
informes admin/vendor actualizados y otro ciclo natural sin duplicados. Sólo
entonces se cambia este estado a PASS integral. LIVE y retiro bancario siguen
fuera de la certificación.

Revisión documental final: 18 Markdown vigentes modificados, 194 enlaces locales
comprobados y cero rotos; `git diff --check` PASS. El cambio ajeno de
`packages/ui/theme.css` se conserva fuera de esta publicación.
