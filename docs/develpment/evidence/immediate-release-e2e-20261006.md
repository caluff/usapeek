# Liberación inmediata — prueba integral Stripe TEST, 2026-10-06

**PASS del circuito financiero Inmediato en QA aislada.** Se guardaron Automático
y cero días mediante el SDK y los endpoints nativos del admin. Se creó una compra
real de prueba, se capturó automáticamente, se preparó, envió, entregó y completó
el pedido mediante los flujos nativos. El cron liberó el neto al vendedor; los
informes coincidieron y otro ciclo conservó una sola transferencia.

Esta prueba detectó y corrigió un defecto de lectura de cantidades. No equivale
a certificar el pedido histórico TEST #16, producción, costes Stripe definitivos
ni retiro bancario. La operación se ejecutó por SDK/API; no se acredita una nueva
prueba visual de checkout ni un clic en el navegador habitual.

## Entorno y alcance

- Run `908dac2be20445ea9d0eb0b5ef94f94d`: base PostgreSQL nueva y exclusiva, Redis
  DB 14 y API QA en 9012. PostgreSQL con CA, hostname y TLS verificados.
- Migraciones y seed nativos; un producto, una compra y un vendedor con cuenta
  Connect TEST ya validada. Sin crear cuentas externas ni aceptar contratos nuevos.
- Cobro clasificado `ordinary`, en TEST/USD, tarjeta `pm_card_visa` y datos
  ficticios. Notificaciones y proveedores ajenos a la prueba desactivados en QA.
- El entorno habitual siguió en Manual. Su `.env` y reloj de TEST #16 conservaron
  sus valores; no se activó su worker, no se liquidó ese pedido ni se migró su base
  durante esta comprobación.
- Sin adelantar relojes, emitir eventos ficticios, invocar jobs manualmente,
  liberar dinero manualmente, reembolsar ni activar LIVE.

## Pedido e importes comprobados

| Dato | Resultado |
| --- | --- |
| Pedido QA, número local 1 | `order_01M496H7Q1TNVQNTTGS73JA1B3` |
| Grupo | `og_01M496H7QFY2VVZR449MQND94B` |
| PaymentIntent TEST | `pi_3UNcoVLYDSAMFoVr0TxYVSrF` |
| Mercancía / envío | USD 19,99 / USD 5,00 |
| Bruto capturado | USD 24,99 |
| Comisión del fixture: 10 % de mercancía, redondeada | USD 2,00 |
| Neto del vendedor | USD 22,99 |
| Transferencia única | `tr_3UNcoVLYDSAMFoVr0lLUf1DW` |
| Payout nativo, pagado y enlazado al vendedor | `pout_01M497CHZ1303KE5AFAT41YWE0` |
| Pendiente en ambos informes | USD 0,00 |

Captura única, completa y automática; estado Stripe `succeeded`, sin reembolsos,
disputas ni reversiones. Los originales y la comisión quedaron congelados.
El destino, la cuenta nativa, el charge de origen, los metadatos y los importes
del transfer coinciden con el plan registrado. Hay una operación de payout
terminada con actor `system:automatic-settlement`, token del reloj y enlace nativo
confirmados; los facts de captura y transferencia están conciliados.

## Reloj, fallo encontrado y corrección

El pedido terminó con cantidades preparada/enviada/entregada iguales a uno.
Su reloj registra `release_delay_days: 0` y los instantes
`completed_at = eligible_at = 2026-10-06T18:10:39.632Z`.
La versión observada conserva `updated_at = 2026-10-06T18:10:39.585Z`.

Los primeros ciclos lo retuvieron correctamente al no poder verificar una
cantidad. Medusa 2.18 forma `item.quantity` desde el detalle versionado; el select
de elegibilidad solicitaba `items.quantity`, pero omitía `items.detail.quantity`.
Una comparación con Query nativo confirmó que la consulta original devolvía
`quantity: undefined`, mientras añadir solamente ese campo devolvía uno con
preparación, envío y entrega completos. Se corrigió
`packages/api/src/lib/order-finance/automatic-settlement.ts` sin relajar sus
schemas, fechas, autorización, exclusión financiera ni validaciones de proveedor.

Tras compilar y reiniciar únicamente la API QA, el cron reservó la operación a
las **18:25:02.610 UTC** y la terminó a las **18:25:04.298 UTC**; Stripe confirma
el transfer creado a las **18:25:04 UTC**. El reloj original no se modificó.
El tiempo consumido diagnosticando el fallo no representa una espera comercial
configurada. Inmediato significa elegibilidad sin días de retención y ejecución
en un ciclo natural, no una transferencia síncrona al completar el pedido.

## Segundo ciclo e informes

- Baseline readonly: **18:26:03.511 UTC**, cursor `automatic-settlements`
  actualizado a **18:26:00.079 UTC**.
- Segunda observación: **18:27:11.745 UTC**, después de 68 segundos; cursor
  actualizado a **18:27:00.073 UTC**, posterior al baseline.
- Reloj, originales, economía y efectos permanecen idénticos: **una operación,
  un payout nativo y un transfer**, incluidas las listas Stripe por ambos scopes.

El avance durable del cursor, el único llamador productivo —cron nativo de un
minuto—, la instancia aislada y los ejecutores revisados sin llamadas manuales al
batch acreditan otro ciclo natural. Es evidencia correlacionada de fuente,
persistencia y ejecución controlada; no se inventa un log DEBUG del scheduler.
Medusa elimina las ejecuciones terminadas de esos jobs sin `retentionTime`, por
lo que la ausencia de una fila retenida no se usa como prueba de fallo.

Cinco GET autenticados mediante SDK verificaron las finanzas del pedido, los
informes admin/vendor y la cola de liquidaciones del vendedor. Filtros Hoy,
TEST/USD, operación ordinaria y `America/Montevideo`; captura, comisión, neto
transferido y pendiente coincidentes. Vendor con cobertura completa y cola vacía.
Admin conserva cobertura parcial únicamente por **dos costes Stripe pendientes
o no disponibles**; los importes principales están confirmados. No se declara
margen definitivo después de tarifas ni abono en banco.

## Verificación y evidencia conservada

- `pnpm lint:api`: PASS, 59 warnings existentes y cero errores.
- `pnpm typecheck:api`: PASS.
- Dos suites existentes de release settings/delay: **40/40 PASS**.
- `pnpm build:api`: PASS; consulta corregida presente en el backend compilado.
- Comparación Query nativa, circuito comercial, verificadores readonly y
  coherencia SDK: PASS. Revisión independiente sin hallazgos restantes.
- `git diff --check` del alcance: PASS.

Recibos privados fuera del repositorio:
`C:/Users/dcalu/.codex/tmp/immediate-release-e2e-20261006/private/`.
Incluyen `flow.ndjson`, `native-plan-diagnostic.json`,
`native-projection-diagnostic.json`, `verification-first.json`,
`verification-baseline.json`, `verification-second.json`,
`report-verification.json`, logs y fuentes de los ejecutores. Las credenciales
generadas permanecen privadas y no se incorporan a Git.

El primer inicio de sesión de pago fue bloqueado por el guard QA al intentar
crear un cliente TEST; se verificaron cero efectos financieros antes de permitir
ese endpoint nativo y retomar el mismo carrito, sin repetir una compra incierta.
Los intentos de diagnóstico y arranque se conservaron; no sustituyen los recibos
PASS finales. Se retiraron los cinco helpers temporales del repositorio tras
verificar sus hashes y archivarlos, y se detuvo la API QA. La base queda como
evidencia, usando los contenedores existentes; no se añadieron contenedores,
dependencias, archivos unitarios, commit ni push en esta comprobación.
