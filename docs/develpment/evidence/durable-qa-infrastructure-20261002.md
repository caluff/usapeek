# QA aislado persistente — 2026-10-02

## Alcance y pérdida anterior

El usuario autorizó levantar de nuevo la infraestructura aislada después de
reiniciar el equipo. Los contenedores de septiembre ya no existían; PostgreSQL
usaba `tmpfs` y ambos contenedores tenían `--rm`. No se encontró una copia de la
base comercial anterior. La acción exacta que eliminó los contenedores no está
demostrada.

Los manifiestos, recibos y logs originales permanecen intactos en la carpeta de
evidencia de septiembre. Son evidencia de sus ejecuciones, no una base restaurada.
No se ejecutó el plan antiguo de recuperación de escritor ni se reutilizaron sus
UUIDs de movimientos financieros.

## Nuevo entorno y comprobaciones

Preparación externa: `C:/Users/dcalu/.codex/tmp/marketplace-closure-20261002`.
Contenedores `marketplace-closure-20261002-postgres` y
`marketplace-closure-20261002-redis`, con red y volúmenes nuevos etiquetados.

- PostgreSQL17.11 y Redis7.4, únicamente en loopback55432/56379, RedisDB15.
- Volúmenes persistentes para datos y certificados; sin `--rm`. Redis usa AOF y
  `appendfsync always`. CA válida hasta2026-11-01, clientes con verificación TLS.
- Reinicio real de ambos contenedores: mismos IDs y marcadores SQL/Redis
  conservados. Un dump externo se restauró en otra base nueva y conservó la fila
  exacta. Una CA incorrecta fue rechazada por ambos clientes.
- Copias privadas accesibles únicamente por el usuario y SYSTEM. La preparación
  de DACL se corrigió para ser idempotente sin modificar propietario ni SACL;
  creación, repetición, retirada de un permiso ajeno y herencia fueron verificadas.
- El importer valida IDs, etiquetas, red, imágenes, volúmenes, puertos y CA antes
  de inyectar secretos por proceso. Un mutex cooperativo reservaDB15: el proceso
  padre debe seguir vivo mientras espera al servidor o runner. Browser e
  integración que limpia Redis se ejecutan por turnos.
- El Redis habitual del usuario6379 conserva su identidad y ejecución. No se
  modificaron proveedores, bases compartidas ni infraestructura de producción.

Recibos externos: `infrastructure/persistence-d4734ca4da714a18bf373960b255eee9.json`,
`infrastructure/tls-negative-control.json` y
`infrastructure/acl-repair-8ca87a4bca6a479b8bca87925540e08e.json`.

## Datos nativos y cuentas TEST

Nueva base `closure_browser_01adf4ee36c4407e872fea1429a0813e`, creada vacía.
Migraciones Medusa y links nativos: exit0; las tres migraciones del cierre
(`Migration20260919120000`, `Migration20260919221631` y
`Migration20260922224024`) aparecen aplicadas en `native-migrate-1.log`.
Seed nativo: exit0,31 productos,2 vendedores, usuarios y regiónUS/USD en
`native-seed-1.log`. Una copia posterior a la preparación fue exportada y su
inventario validado; esto no afirma que esa copia comercial ya se haya restaurado.

Mercur2.3.3 siempre crea una cuenta externa en su workflow de alta y no ofrece
importación de cuentas existentes. Para esta reconstrucción local de QA se
compuso un helper externo con pasos/workflows nativos, conservando únicamente
los dos identificadores originales de `PayoutAccount` y sus enlaces nuevos.
Un GET fresco de Stripe exige el `metadata.account_id` original exacto; el registro
local nace `PENDING` y `refreshVendorStripeAccountWorkflow` determina el estado
real mediante otro GET y la autorización nativa del vendedor. Solo después de
verificar ambas cuentas se habilita Stripe en la región QA mediante
`updateRegionsWorkflow`, conservando otros proveedores.

Inspección y ejecución local: **PASS**, ambas cuentas TEST `ACTIVE`, locks propios
liberados. `accounts-reuse-inspect-1.ndjson` y `accounts-reuse-execute-1.ndjson`
permanecen en la carpeta privada. El helper no creó cuentas Stripe, enlaces de
onboarding, órdenes, pagos ni historial financiero; no aceptó acuerdos nuevos.
Guardas externas15/15PASS, incluida la carga del exportCJS por el importador
Medusa realmente instalado. El primer intento falló antes de ejecutar el helper
por su export; se corrigió y no se presentó ese fallo como una ejecución válida.

API9010 y frontends3010/7010/7011 arrancados sobre esta nueva base. Stripe es
exclusivamenteTEST; jobs financieros automáticos y proveedores no usados siguen
deshabilitados. Estos resultados habilitan la continuación del QA, no certifican
todavía costes, reporting ni Financial Readiness final.

## Disponibilidad HTTP nativa

`native-api-ready-1.json` registró el2026-10-02 a las22:50UTC una comprobación
por SDK real: regiónUS/USD,31 productos, cero pedidos y acceso autenticado de
ambos vendedores a su propio ámbito abierto/activo. No hubo llamadas Stripe ni
mutaciones comerciales en esa comprobación.

El usuario abrió una pestaña HTTP nueva y la revisión visual nativa se retomó.
El catálogo mostró31 productos en tres páginas12/12/7; la ficha del producto31
mostró precioUSD19,99, stock20 y el estado explícito de imagen ausente. Un carrito
guest conservó un producto y totalUSD19,99 después de volver desde el primer paso
de checkout y recargar. No se envió dirección ni se llegó al paso de pago en esa
revisión; no se afirma una compra ni una traza de red del carrito guest.

La búsqueda textual devolvió el error explícito previsto con Algolia deshabilitado;
el reintento conservó ese estado y «Explorar catálogo» volvió al catálogo nativo.
El diagnóstico SDK independiente confirmó503 y31 productos disponibles. La UI
detectó además que «Volver al catálogo» desde una ficha apuntaba a `/search`, que
también falla sin Algolia aunque la consulta esté vacía. Esa navegación requiere
corrección F12; no se presenta la búsqueda integrada como verificada.

Capturas privadas: `ui-abandonment-cart-1.jpg`, `ui-search-disabled-1.jpg` y
`ui-browse-link-error-before-1.jpg`. Diagnóstico externo:
`search-readonly-qa-oct2-1.json` y `SEARCH-READONLY-DIAGNOSIS-OCT2.md`.

## Checkout SDK y parada conservadora

El primer intento SDK conservó un carrito de dos vendedores porUSD49,98 y se
detuvo al pedir una proyección no permitida. Se corrigió únicamente el helper;
una lectura posterior verificó dos ofertas, dos envíos, ningún pago ni grupo.
La reanudación reutilizó ese carrito, sin añadir productos o envíos nuevamente.

El2026-10-02 a las23:38UTC creó una única colección/sesión/PaymentIntent, pero
se detuvo por otra guarda del helper: el prefijo nativo es `pay_col`, no `paycol`.
El SDK y el modelo instalado confirman que la respuesta era válida. La lectura
posterior SDK/StripeGET verificó TEST/USD, importe49,98, captura manual,
`requires_payment_method`, cero recibido y cero capturable; no hay grupo de
órdenes ni cart completion. No se volvió a crear o confirmar el pago.

Los recibos `api-normal-execute-1.ndjson` y `api-normal-resume-1.ndjson`, el
manifiesto reservado y las identidades existentes se conservan. Una continuación
deberá fijar ese estado exacto y omitir la creación de sesión. Estas pruebas tienen
procedencia `native_sdk_http` y no se presentan como compras por interfaz.
Guardas repetidas por el coordinador: checkout21/21, fulfillment64/64 y wrappers
financieros38/38PASS; no sustituyen la ejecución financiera real pendiente.

Una copia privada adicional fue exportada a las23:43UTC:730489bytes, inventario
validado, SHA256 `500484f98848f677ee4df61a222d75c7137489c766aef7ec975597eccd5e193b`.
No se afirma restauración de esa copia comercial ni conciliación de costes.

## Continuación nativa: 2026-10-03 00:19 UTC

El checkout normal se finalizó con lecturas nativas del carrito, grupo y pedidos;
reutilizó la sesión existente sin volver a confirmar ni completar la compra.
El checkout parcial creó y verificó un segundo grupo independiente. Ambos
manifiestos terminaron `api_checkout_state=verified`, con procedencia
`native_sdk_http` e `interface_verified=false`. Recibos finales:
`api-normal-finalize-1.ndjson` (SHA256
`d34f2b58154597e0e80747c5ad1bba715cd4b6a71ce4b480788f55e51b90d080`) y
`api-partial-execute-1.ndjson` (SHA256
`f1d42e0395d07f7b97867a275b6aadfeba173feb6dba43db5e5937bdd5dd97df`).

Las inspecciones financieras nativas confirmaron cuatro pedidos autorizados,
sin cobros, devoluciones, transferencias ni problemas financieros. La cancelación
del vendedor B parcial pasó antes del cobro, sin devolución monetaria. Los tres
pedidos activos se prepararon mediante el endpoint nativo de sus vendedores;
las lecturas posteriores verificaron cada preparación y el pago sin cambios.
La interfaz del vendedor A mostró su propio pedido normal como «Preparado» y
«Pago autorizado»; captura privada `ui-vendor-prepared-order-1.jpg`.

Stripe TEST y los workflows nativos verificaron captura normal USD49,98 y
parcial USD24,99; el pedido parcial cancelado recibió captura cero. La liberación
de USD24,99 de la autorización parcial se mantiene separada de los reembolsos
monetarios. El circuito normal A verificó devolución USD2 antes de liquidar,
transferencia USD21,15 y devolución posterior USD3 con reversión USD2,76. El
vendedor B normal permaneció sin devoluciones ni transferencias en ese hito.
Los recibos `api-*-capture-1.ndjson`, `api-normal-refund-before-1.ndjson`,
`api-normal-settle-a-1.ndjson` y `api-normal-refund-after-1.ndjson` terminaron
`verified`; incluyen las comprobaciones nativas de repetición sin duplicación.

Una nueva copia privada se exportó a las00:19:40UTC:772588bytes, inventario
validado, SHA256 `22a4853747c9eb37411bc65acaa581b6b160533fd719fe97b5bbeb5c029d2071`.
No se afirma restauración de esa copia. Siguen pendientes las extensiones de
centavos, liquidación B, observaciones/costes, integración F09, contraste HTTP/UI
y regresión conjunta final. Las fuentes nativas financieras no se modificaron;
el ajuste del launcher para `Path` en Windows pasó20 guardas offline.

## Continuación: 2026-10-03 03:15 UTC

Los pendientes del hito00:19 quedaron resueltos en el circuito económico posterior:
regla10→12/refresh preserva cuatro originales, refunds de centavos y remanentes
agotan ambos targetsA, y B normal liquida22,99 con replay sin duplicación. Total
capturado74,97, mercancía59,97, refunds monetarios49,98, neto24,99, comisión
neta2,00 y earnings/transfers netos22,99; pendiente0. Release24,99 permanece
separado de refunds. No repetir dinero ni identidades históricas.

Observaciones/refresco nativo y contraste final de costes ejecutados:31 costes
únicos pendientes(21normal+10parcial) tanto en Stripe como en persistencia;
tarifas/netos desconocidos y resultado después de tarifas `null`. Subtotal
confirmado0 no equivale a coste total0. El único aviso de tiempo no verificado
corresponde a release; no hay movimiento monetario con tiempo desconocido.
Backup00:37:55UTC exportado/inventariado,800153bytes, SHA256
`a6d6b443ffc005d8abce870a37e4fb15e1cabf69136a2e6a436a409e1965f0dc`;
no se afirma restauración de ese dump.

Integración100 requerida certificada mediante continuidad86 y Google4/vendor10
nuevos. Lint/tipos/tests/builds finales funcionales PASS; tests2.482 aserciones.
Las auditorías estrictas de telemetría y workers frontend conservan FAIL con
calificación funcional/terminalidad nativa explícitas. Frontends usaron Webpack
externo soportado después del falloTurbopackIPC; scripts y guardas intactos.
Build API y tipos posteriores al codegen tienen auditorías estrictasPASS.

UI F09 real y estados lento/error/retry/móvil controlados PASS con sus filtros,
ámbitos y cifras reconciliadas. HTTP44 pendiente:primera expectativa del oráculo
externo falla tras medianoche, sin reconocer cobertura parcial por release cuando
las tarifas del día son0. Corrección externa acotada en revisión; backend coherente.
API QA respondehealth200/GET, pero eventbus worker cerró al startup; reinicio sólo
QA y comprobación de backlog de sólo lectura pendientes.

Preservación03:12:36UTC PASS:101 archivos+2 posteriores,55 filas locales del
lockfile conservadas, sin restauraciones. No se declara Financial Readiness final.
La [matriz de cierre](development-closure-20261003.md) contiene hashes,
calificaciones,17DoD/9Phase6 y la siguiente acción; conserva todos los hitos previos.

## Cierre acotado: 2026-10-03 03:22 UTC

Los pendientes03:15 se verificaron sin cambiar fuente ni operar dinero:el oráculo
externo corregido y revisado conserva controles estrictos;HTTP2 terminó44/44,
24 respuestas200 private/no-store(12QA+12ordinary vacío) y20 rechazos. Recibo
`api-reporting-http-2.ndjson`,SHA256
`b8c54a31836907a2d09d9496dc0b6bff8959f06f4d6112dad04ecfc869c33d8d`.
HTTP1 y su fallo de expectativa tras medianoche permanecen históricos.

API QA reiniciada03:17:39 con opt-out nativo de telemetría por proceso;health200.
LecturasTLS03:19:07/09 verificanrunid,worker bloqueadoBZPOPMIN/flagsb ybacklog0,
sin usarGET exitoso como sustituto de readiness. FrontendsQA restaurados;
servicios/puertos del usuario intactos. Recibo
`redis-eventbus-oct3-post-restart-2.json`,SHA256
`9d8afebb7024213ed65ff26db9bfa0bd552420a8d238b4963e6d6acdbc8a5945`.

F01–F12/Phase1–6 DONE yFinancial Readiness PASS **sóloStripe TEST/USD/manual local**.
Se mantienen31 costesunknown/resultadonull,calificaciones de auditoría,3DSUI
histórico ylímites de proveedores deshabilitados. No certifica live,payout
bancario,producción niF13–F17. La matriz final contiene17DoD/9Phase6 acreditados.
