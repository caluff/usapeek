# Revisión de cierre F01–F12 — 2026-10-03

**Estado03:22UTC: DONE F01–F12 / Phase1–6; Financial Readiness PASS acotado a Stripe TEST, USD y operación manual local.** Fuente root `141082c`, QA `6b7f6d9`, árbol API `bbbc17f3ac12fedf199920d3cb768419e11ddc74`. Esta evidencia actualiza el [progreso](../development-progress.md); no reescribe el FAIL histórico de la auditoría ni certifica producción/live.

## Procedencia y preservación

- Dos checkouts nuevos US/USD mediante SDK y endpoints nativos: `native_sdk_http`, `interface_verified:false`. Sus movimientos Stripe TEST y persistencia se contrastaron con expectativas independientes; no son compras nuevas por UI.
- La UI Stripe TEST del26 de septiembre sí probó decline y3DS cancel/retry sin órdenes duplicadas. Se conserva como evidencia histórica con continuidad de checkout/return, no se atribuye a octubre. [Recorrido histórico](native-checkout-browser-20260922.md).
- Integración real HTTP/PG/Redis:87HTTP+13PG requeridos certificados.86 casos completos se reutilizan por revisión exacta de cinco archivos; Google4/vendor10 son nuevos.314 unitarios extra descubiertos por módulos no se suman a los13PG. Transportes Stripe simulados de esas suites se distinguen del proveedor TEST efectivo.
- 443 archivos API/parches root/QA coinciden,19 sólo por CRLF/LF; cuatro archivos page/report F09 coinciden normalizados. QA visual acredita F09 comprometido con su estiloQA; el build root incluye la UI compartida ajena del usuario.
- Preservación03:12:36UTC:101 archivos iniciales+2 posteriores intactos,55 filas locales del lockfile y reconstrucción exacta al invertir sólo tres deltas propios; sin restaurar datos ni cambios ajenos. Los tres `next-env.d.ts` volvieron a sus bytes originales. Sin instalaciones, cambios de PATH global, push o servicios del usuario detenidos.

Recibos externos actuales:

Base local de los recibos: `C:/Users/dcalu/.codex/tmp/marketplace-closure-20261002/`. El recibo HTTP y las capturas están en su subdirectorio `browser-native-private/`. Los archivos privados permanecen fuera de Git; esta evidencia versiona únicamente resultados agregados y hashes.

| Archivo | SHA256 |
| --- | --- |
| `api-source-continuity-86-oct3-1.json` | `ae23eb74f55cfd1c6361c8329706344e8c1aaae4caeb302a7de47939f261fbad` |
| `root-final-gates-completion-summary-oct3-1.json` | `cb048ceeecbb71a227e45a48c987aa2d2bc4db4404af818a44fbc0c1814ee7f0` |
| `root-final-test5-functional-qualification-oct3-2.json` | `edfe365ca892788359c9d4831d405d88ee79aaa37f3362698e0657e69841085b` |
| `preservation-readonly-oct3-2.json` | `50ba86f81a56ea6c0aa14654506e1bdc610639a2dfb7f1fe2d828de4eba3c4a5` |
| `operational-source-scan-oct3-1.json` | `a6a5d9e27f5c08244be343b14d9d7b7cf771cf97b037466863615c34ce5cedd0` |
| `f09-browser-verification-oct3-2.json` | `5978af97414c5278707a959ab39facde1388ccef305b23a8fce212c27f328688` |
| `api-reporting-http-2.ndjson` | `b8c54a31836907a2d09d9496dc0b6bff8959f06f4d6112dad04ecfc869c33d8d` |
| `redis-eventbus-oct3-post-restart-2.json` | `9d8afebb7024213ed65ff26db9bfa0bd552420a8d238b4963e6d6acdbc8a5945` |

## Checks funcionales y auditorías

| Check | Resultado funcional | Protección y límite |
| --- | --- | --- |
| Lint API final4 |PASS,0errores/56warnings |Auditoría estrictaPASS. Lint previo raíz/frontends sigue aplicable por continuidad de fuente. |
| Tipos raíz final3 |PASS |Auditoría estrictaPASS. |
| Tests raíz final5 |PASS,código0,2.482 aserciones |Web193,admin99,vendor138,API2.033 en113 suites,scripts/deployment11,theme8. Auditoría **FAIL conservado**:4 intentos de telemetría rechazados y1 métrica final ausente;105 procesos con salida. Terminalidad CIM comprobada antes del build; no se reconstruye la métrica ausente. |
| Builds web/admin/vendor |PASS,código0,Webpack explícito |Default Turbopack falló por21 bloqueos IPC; ese fallo se conserva. Cada build Webpack tiene14 workers sin hook de salida: trabajadores nativos Next finalizados, SIGINT/CIM documentados. Auditorías FAIL conservadas;0 conexiones bloqueadas en los builds exitosos. |
| Build API QA y tipos después del codegen |PASS |Ambas auditorías estrictasPASS,0 bloqueos y0 cambios protegidos. |
| Contratos y peers |PASS previo aplicable |Sin cambios posteriores que invaliden el alcance; peers requerido por dependencia UI compartida del usuario. |
| Integración aislada |PASS100 requeridos |87HTTP+13PG; fuente, logs, cobertura y guardas verificados. |
| HTTP44 F09 |PASS44/44 |24 respuestas200 private/no-store:3 ámbitos×4 períodos×QA/ordinary;12QA y12ordinary vacío.20 rechazos, incluidos2 forgedseller400not_allowed;0 mutaciones monetarias/0Stripe. Primer intento fallido conservado. |
| UI F09 |PASS acotado |Datos reales, ámbitos, filtros y detalle; lento/error controlados identificados. ReciboUIv2 corrige sólo transcripción del head; observaciones/capturas idénticas y v1 conservado. |
| Runtime QA |PASS de sólo lectura |Reinicio03:17:39 sóloAPI QA;health200 y dos lecturas03:19:07/09 verificanTLS/runid,workerBZPOPMIN/flagsb y backlog0. Sin tocar puertos/servicios habituales. |

La calificación funcional no modifica `passed:false` de las auditorías. La guarda permaneció intacta y bloqueó las cuatro conexiones observadas de workers nativos de telemetría. No se afirma caché global intacta: el agente no leyó/restauró/eliminó su contenido; el código nativo usa config/outbox existentes. Tampoco se afirma intercepción completa del networking Rust. Los fallos de launcher que nunca ejecutaron main no cuentan como checksPASS.

## Economía y reporting actuales

| Medida USD del conjunto nuevo | Resultado |
| --- | ---: |
| Capturas / mercancíaGMV |74,97 /59,97 |
| Refunds monetarios / capturado neto |49,98 /24,99 |
| Comisión bruta / revertida / neta |6,00 /4,00 /2,00 |
| Earnings vendor |22,99 |
| Transfers brutos / reversals / netos |44,14 /21,15 /22,99 |
| Pendiente de liquidación |0,00 |
| Costes únicos pendientes / resultado después de tarifas |31 / `null` |

Tres pedidos pagados; B parcial fue cancelado antes del cobro y recibió captura0. Su autorización liberada24,99 **no es refund monetario**. Agotamiento acumulativo de ambos targetsA mediante centavos+remanente; refunds antes/después de liquidar, replays y cambio10→12 conservaron cuatro originales. No se afirma nueva venta al12, refund único total independiente ni payout bancario.

Costes:21normal+10parcial, pendientes tanto en Stripe como en persistencia. `fee_minor` y neto desconocidos; subtotal confirmado0 no equivale a coste total0. El único `refund_time_unverified` se refiere a release, no a dinero reembolsado;0 movimientos monetarios con tiempo desconocido. [Fuentes y fórmulas](financial-reporting.md).

## QA visual F09

| Caso | Comprobado |
| --- | --- |
| Admin |Ordinario vacío; QA últimos30d concuerda con todos los importes anteriores,31 costes desconocidos y resultado«—». Comisión bruta/revertida/neta separadas. |
| Períodos |Cuatro períodos admin y vendedorA fijan selección/URL. Después de medianocheMontevideo, Hoy tiene flujos0; conserva originales al cutoff y aviso de release sin tiempo confirmado. No se exige cobertura completa sólo porque costes del día sean0. |
| VendedorA/B |A capturado49,98/refunds49,98/earnings0; B24,99/refunds0/earnings22,99/netotransfers22,99. A ve2 pedidos propios, B1pagado; sin IDs ajenos ni tarifas de plataforma. Detalle por pedido A comisión2/2/0 y B2/0/2. |
| Lento5s |Skeleton sólo del informe; título,navegación y estadísticas independientes visibles. Acreditan admin-loading1 y vendor-loading3. |
| Error503/retry |Error local al informe; Reintentar recupera filtros/URL y cifras reales en ambos. URL vendor idéntica después de retry. |
| Móvil390×844 |Filtros dentro de documento375px; tablas en contenedor303px con overflowauto (contenido1300admin/1405vendor); detalles vendedor legibles. Viewport restaurado y proxy passthrough final. |

El indicador independiente de productos propuestos devuelve403 porque al actorQA
le falta `product:read`; se muestra error explícito, no0 inventado. Ese límite de
permisos no es un defectoF09 y no se amplió la autorización para ocultarlo.
Diagnóstico externo:`ADMIN-PROPOSED-PRODUCTS-READONLY-OCT2.md`.

Las respuestas lentas/503 fueron controladas por el proxy local; las cifras tras la recuperación son reales. Sólo estas capturas verificadas se registran en el directorio privado; no se publican imágenes ni datos personales:

| Captura | SHA256 |
| --- | --- |
| `f09-admin-totals-oct3-1.png` | `9ce540c74d9f8a28a3c0cfeb6a2f5607f0b77aa1a5e0ec72c8d52ef51d16b867` |
| `f09-vendor-b-real-oct3-1.png` | `4b4d8f24dfbda16a1df01226b4c9aedea0b2ebfc45c3caf95532c2f2f1e5631c` |
| `f09-admin-loading-oct3-1.png` | `f31d8de4a880cbe1195d4557eea7bae7eaee39ed54311d3e77c56bba15317cdd` |
| `f09-vendor-loading-oct3-3.png` | `2e0019ec3d837c6ebdfd072cf4953692268a8e86ed998286e4c2b78145dbb6f0` |
| `f09-admin-error-oct3-1.png` | `524b9e3f70849b196f50ac7bbefa6d874346ff140f7df2373c12d980c7dcfb84` |
| `f09-vendor-error-oct3-1.png` | `e3267c2300ee3847b5ddfbb8cd3b43232fffa326187b866020f0a11d8d1d4c20` |
| `f09-admin-mobile-controls-oct3-1.png` | `f7ded3c495b15c170ff31ec9585038cb54546f6a3e906b6bcf78b2a5a69f45bb` |
| `f09-admin-mobile-table-oct3-1.png` | `7f622b86abcd77b0594202b6752af399233afe12a507171ebc96d441354c4d96` |
| `f09-vendor-mobile-controls-oct3-2.png` | `8741f33956a13d13e19c3e73e3604c2ce3a313810f6fe579546a3928a80619d2` |
| `f09-vendor-mobile-table-oct3-1.png` | `c091474f0644eeb50df152a87b8fdbe4b07b3348932c942ad0efaa2538a33898` |
| `f09-vendor-mobile-detail-oct3-1.png` | `3776000f0f00d454bb5ce863dfb57af05b7b7ea6f3bd0b7997dcbc233ebdaec9` |
| `f09-vendor-a-detail-oct3-1.png` | `dac8ba421b2df291090483fba11a3b5665aac229cee6105d20c1481bd52c7921` |
| `f09-vendor-b-detail-oct3-1.png` | `0c78c7ec5ad23f4df5f4e6bd4f02929a100389717ecf2bc0cb8ad54da787f83f` |
| `f09-vendor-retry-oct3-1.png` | `e193fe353a412d5492c134bb5d8d36fb20e039a25336de1ff40dd0bb2d4c0f23` |

Vendor-loading1/2 no acreditan loading y no se usan para ese resultado.

## 17 criterios financieros

| # | Criterio | Estado al corte |
| ---: | --- | --- |
|1 |Cada venta calcula correctamente la comisión |PASS TEST:foundation10,snapshot y centavos; cero/no-rule bloqueados. |
|2 |Usa datos confiables del backend |PASS acotado:precio/escritores/roles/scoping protegidos, sin permisos remotos cambiados. |
|3 |Porcentaje histórico de la venta |PASS TEST:cuatro originales10 conservados tras regla12. |
|4 |Marketplace conserva lo correspondiente |PASS TEST:comisión neta2,00; afterfeesnull explícito. |
|5 |Vendor recibe lo correspondiente |PASS TEST:earnings/netotransfers22,99; sin payout bancario. |
|6 |Refund total |PASS TEST acumulativo, antes/después de liquidar. |
|7 |Refund parcial |PASS TEST:2 antes,3 después y centavos. |
|8 |Refund ajusta comisión |PASS TEST:ajustes/créditos/transacciones/reversals reconciliados. |
|9 |Retries/webhooks no duplican |PASS acotado:replays reales, webhooks con transporte simulado identificado. |
|10 |Valores reconciliables con Stripe |PASS TEST económico/HTTP44;31 costes pendientes honestos. |
|11 |Admin muestraGMV |PASS UI real/HTTP44. |
|12 |Admin muestra marketplace revenue |PASS UI real/HTTP44;comisión y beneficio desconocido separados. |
|13 |Admin distingueGMV e ingresos propios |PASS UI real/HTTP44. |
|14 |Vendor ventas/comisión/ganancias |PASS UI real/HTTP44 A/B y detalle propio. |
|15 |Métricas descuentan refunds |PASS oráculo puro/UI real/HTTP44;release excluido. |
|16 |Tasa futura preserva histórico |PASS TEST:regla/líneas/refunds invariantes. |
|17 |Evidencia/tests críticos |PASS gates funcionales calificados,100integración,HTTP44/UI y readinessQA. |

## 9 tareas Phase6

| # | Tarea | Estado al corte |
| ---: | --- | --- |
|1 |Checkout→Stripe→split/capture/transfer→dashboard |PASS SDK/TEST/UI/HTTP44 con procedencias separadas. |
|2 |Refunds/centavos/tasa/costes/ajustes |PASS TEST; costes desconocidos correctamente conservados. |
|3 |Retries/eventos/fallos/recovery/escritores/scopes |PASS acotado; simulación de proveedor frente a evidencia TEST real identificada. |
|4 |Stock/precio/producto/seller suspendido |PASS commerce16/lifecycle3 conPG/locks reales. |
|5 |3DS/retorno/abandono/expiry/integraciones |PASS acotado:3DS/decline UI Sep26,abandono nuevo,expiry simulado. Sin esperar7días ni certificar Resend/Algolia/S3 activos. |
|6 |UX lento/error/loading/retry/móvil |PASS visual real/controlado identificado para storefront y F09. |
|7 |Checks/builds/integración |PASS funcional con auditorías/calificaciones conservadas; no cambia losFAIL originales. |
|8 |Mocks/placeholders/callbacks afectados |Scan acotadoPASS sin matches; no claim del repositorio entero. |
|9 |DoD final/progreso |PASS17DoD/9Phase6 en alcanceTEST/USD/manual;historia y límites preservados. |

## Cambios, migraciones y pendientes

Commits relevantes:fundación `fe806d0`; liquidación/recovery `007c941`,`db02770`,`687ebc7`,`f419d07`; centavo nativo `101cfa8`,`5b488cd`; F09 `cea2775`,`e70e8d4`,`7cd88b3`,`74df35d`,`80c8463`,`12c18fe`,`c23e920`, contratos `d2e6a98`; vendor `130792f`, contratos HTTP `f52417c`,`141082c`; navegación catálogo `0810e8d`. No nuevas dependencias ni migraciones por los últimos fixes.

Migraciones de commerce-automation `Migration20260919120000`(permisos),`Migration20260919221631`(snapshot) y`Migration20260922224024`(journal/facts/costs TEST) aplicadas sólo en QA/bases desechables. Sin Supabase/base compartida. Export/inventario del backup00:37 comprobados; no se afirma restauración comercial. [Infraestructura y procedencia](durable-qa-infrastructure-20261002.md).

F13–F17 permanecen fuera de obligatoriedad:controles admin de estados/logística, mapa documental/limpiezaP2, mantenimiento de warnings/APIs internas/parches, analítica avanzada y automatización. Los jobs financieros siguen deshabilitados; no activar live ni añadir proveedores/despliegue.

El primerHTTP1 falló tras medianoche por exigir `coverage.complete=true` cuando
costes del día son0, aunque el release sin tiempo confirmado mantiene cobertura
parcial legítima. Corrección exclusivamente externa revisada,19 pruebas puras y
regresión causal preservadas; controles estrictos de cobertura,identidad,moneda,
período y privacidad mantenidos. HTTP2 completó44 y fuente sin cambios.

Health200/GET no se usaron como prueba de worker activo. Tras diagnóstico de
startup cerrado y backlog0, se reinició sóloAPI QA; dos lecturasTLS confirmaron
worker bloqueado/polling consistente(97/98s) y backlog0. Opt-out de telemetría
nativo por proceso, sin cambios globales. FrontendsQA7010/7011 restaurados;
puertos y servicios habituales del usuario intactos.

No quedan tareas obligatoriasF01–F12. Próximo trabajo sólo bajo alcance nuevo:
F13–F17,live,payout bancario,despliegue,migración compartida o automatización.
Conservar31 costes desconocidos/resultadonull y auditoríasFAIL calificadas;
no repetir dinero ni borrar evidencia histórica para obtener resultados limpios.

## Cómo revisar el resultado local

El `pnpm run dev` habitual del usuario continúa en los puertos 3000/7000/7001/9000. Los fixtures y movimientos financieros de este cierre pertenecen al entorno QA aislado, no a esa base habitual.

Con los servicios QA de esta sesión activos, abrir:

- Admin: `http://closure-oct2.localhost:7010/dashboard?period=last_30_days&data_kind=qa_fixture`.
- Vendedor: `http://closure-oct2.localhost:7011/seller?period=last_30_days&data_kind=qa_fixture&page=1`.

Las pestañas entregadas conservan las sesiones de prueba. Revisar los cuatro períodos, el conjunto QA, los costes pendientes y el detalle por pedido; el conjunto ordinario de esta base está vacío. Las fechas de estos fixtures son históricas: con el paso del tiempo dejarán de pertenecer a los filtros relativos. Las pruebas visuales y los importes de este documento corresponden al corte indicado, no a una promesa de valores constantes en «Hoy».

No hay storefront QA activo en 3010 al cierre; el storefront habitual del usuario sigue en 3000. No ejecutar migraciones ni movimientos financieros en la base habitual para reproducir esta lectura. Las tres migraciones indicadas quedan pendientes para cualquier entorno compartido, con revisión y autorización específicas.
