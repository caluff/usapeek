# QA de captura ajustada y reversión de liquidaciones

> **Informe histórico.** Sus resultados corresponden únicamente a la revisión, fecha y entorno descritos en el cuerpo original. No certifica el estado actual ni el cierre financiero. Consultar la [auditoría de cierre](../develpment/development-completion-audit.md), el [progreso](../develpment/development-progress.md) y las [guías vigentes](../README.md).

Alcance: Mercur 2.3.3 / Medusa 2.18.0, Stripe TEST, USD. No se habilitaron jobs automáticos, modo real ni despliegues. No se modificó el pedido original #5.

## Datos aislados

Etiqueta: `order-finance-extension-2026-09-12`.

| Caso | Tienda A | Tienda B | Pago compartido |
| --- | --- | --- | --- |
| Captura ajustada | #10: `order_01M2BSAKW2C49RGPZE3Q3N7C5N`, 12 USD | #11: `order_01M2BSAT4C3P8RHE3E62DACKPA`, 22 USD | `pay_01M2BSKNRK4NPQ8KNESWSN6EKW` |
| Reembolso posterior a liquidación | #12: `order_01M2BSF13DED9M2EHPFEM3PVCJ`, 12 USD | #13: `order_01M2BSF7F2AQ6PFAS4M89C303V`, 22 USD | Captura inicial de 34 USD |
| Repetición de captura desde el front | #14: `order_01M2BV1SHVA19MWQK4F0BGQT11`, 12 USD | #15: `order_01M2BV1ZYP6RPV03842MXF8VTF`, 22 USD, cancelado en setup nativo | `pay_01M2BV2DTZDJFX3SVN55T6CTPY` |

Liquidación de A: `pout_01M2BSMB0256RCSYVT888NAZMC`; transferencia TEST `tr_3UEyopLYDSAMFoVr0xTbO2Wz`, 10,80 USD; comisión aislada de 1,20 USD. La regla QA está deshabilitada y no es predeterminada. Los pedidos no tienen email y se crearon con notificaciones desactivadas.

## Incidencias encontradas y corregidas

- Las consultas parciales de artículos omitían campos necesarios para calcular los totales y devolvían cero. Se solicitan los campos nativos completos de artículos, detalle, ajustes, impuestos, envío y créditos, además de la versión del pedido. La primera preparación del fixture se detuvo antes de crear sesiones o pagos; se inspeccionó y continuó exclusivamente ese fixture sin duplicarlo.
- El setup de liquidación intentó crear un enlace pedido–liquidación con el orden de módulos invertido. El dinero de prueba ya estaba transferido. Se inspeccionó la liquidación, se verificó la transferencia y se restauró únicamente el enlace vendedor–liquidación usado por el workflow nativo. No se repitió el cobro ni la transferencia. El seeder usa ahora exclusivamente el enlace nativo del workflow.
- La revisión independiente detectó rutas con identificadores codificados y una carrera al desconectar el navegador. Se normalizan las rutas y se reserva el grupo de forma duradera durante los escritores nativos; una desconexión conserva el bloqueo para conciliación.
- La recarga automática de Medusa en Windows se detuvo por intentar terminar un proceso ya inexistente. Se reinició el servidor de desarrollo sin operaciones financieras en curso.
- Stripe rechazó explícitamente `final_capture` en un PaymentIntent sin soporte de multicaptura. Se confirmó que no recibió dinero, se retiró ese parámetro siguiendo la documentación de captura manual y se verificó una captura de 12 USD con liberación de los otros 22 USD. La primera operación se concilió exclusivamente en el fixture identificado; no se abrió un mecanismo general de desbloqueo.
- Una edición concurrente reinició el backend después de recuperar los 9,90 USD restantes de la tienda y antes de reembolsar al comprador. La reserva duradera sobrevivió y bloqueó otras operaciones. Se verificaron ambas reversiones, la ausencia del segundo reembolso tanto en Stripe como en Medusa, y se continuó exclusivamente el paso nativo pendiente mediante `reconcile-finance-extension-qa.ts`. No se repitió la reversión. El QA posterior usa temporalmente el servidor sin watcher, manteniendo `NODE_ENV=development`.

## Comprobaciones ejecutadas

- `pnpm lint`: correcto, sin errores. La última ejecución de API registró 50 advertencias, principalmente convenciones del linter y scripts operativos; no se aplicó un arreglo global ajeno al alcance.
- `pnpm typecheck`: correcto en las cuatro aplicaciones.
- API, ejecución final: 67 suites, 838 pruebas unitarias correctas; 3 pruebas de preparación de despliegue correctas. Incluye las pruebas concurrentes añadidas por el trabajo de autenticación; no todas corresponden a finanzas.
- Admin: 99 pruebas correctas.
- Vendor: 136 pruebas correctas.
- Lectura real de los fixtures: asignaciones 12/22, autorización compartida 34 para captura ajustada; captura real 34 para liquidación; balances Stripe/Medusa coincidentes y sin bloqueos financieros.
- `pnpm build:api`: compilación completada correctamente tras la corrección de captura.
- `finance:contracts:check`: contrato generado actualizado.

## Operaciones comprobadas

- Admin, #11: cancelación sin captura, reembolso 0 USD y conservación de la autorización compartida.
- Vendor, #12: reembolso parcial de 1 USD, reversión de 0,90 USD y comisión de 0,10 USD, visibles en el historial. Admin, #13: saldo de 22 USD intacto después de esta operación.
- Vendor, #12: cancelación con los 11 USD restantes. La interrupción descrita se concilió; neto total recuperado 10,80 USD, comisión devuelta total 1,20 USD, sin duplicados.
- Admin, #13: cancelación y reembolso de sus 22 USD completados desde el formulario; saldo posterior 0 USD.
- Admin, #10: captura ajustada iniciada desde el formulario, defecto detectado y corregido, conciliación de la operación de prueba y comprobación en el front de 12 USD cobrados a esa tienda.
- Admin, #14: nueva captura ajustada de 12 USD completada íntegramente desde el formulario, excluyendo el pedido #15 de 22 USD ya cancelado. Reembolso posterior de los 12 USD completado desde el mismo panel.
- Vendor, #10: cancelación de la preparación a través del endpoint nativo protegido por la nueva reserva duradera; después, cancelación del pedido y devolución de los 12 USD capturados, completadas desde el formulario.
- Admin, #14: seleccionar nuevamente «Cobrar compra» muestra que la captura ya se realizó y no ofrece botón de envío.
- Vendor: acceso directo al pedido #13 de otra tienda rechazado; no expuso datos del pedido ni finanzas.

## Conciliación final

`pnpm --filter @usapeek/api exec cross-env NODE_ENV=development medusa exec ./src/scripts/inspect-order-finance-extension-qa.ts final` terminó con código 0 después de todas las operaciones.

- Tres compras compartidas, seis pedidos etiquetados; autorización inicial total de 102 USD.
- Cobros efectivos: 12 + 34 + 12 = 58 USD; reembolsos efectivos: los mismos 58 USD.
- Autorización liberada sin cobro: 22 + 22 = 44 USD. Los objetos `Refund` que Stripe usa para esas liberaciones no se sumaron como reembolsos efectivos en Medusa.
- Una transferencia de 10,80 USD; dos reversiones de 0,90 y 9,90 USD, sin duplicados. Comisión devuelta de 0,10 + 1,10 = 1,20 USD.
- Todos los saldos reembolsables en cero; todos los movimientos financieros completados; ningún grupo con reserva activa ni revisión pendiente.
- El pedido #14 permanece preparado y reembolsado, no cancelado: el reembolso no simula una devolución física ni una cancelación logística. Los demás pedidos de estos fixtures están cancelados. No se borraron los datos de QA para conservar la trazabilidad.
- No se habilitaron pagos reales, automatización de cobros/liquidaciones ni un botón general de conciliación. La recuperación excepcional estuvo limitada a los identificadores de prueba inspeccionados.

La comprobación de UI utilizó navegación y formularios reales de Orca y lectura del DOM. La captura de pantalla falló por desconexión del runtime; no se presenta como evidencia visual guardada.
