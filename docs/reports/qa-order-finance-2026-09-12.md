# QA de cancelaciones y reembolsos — 12 de septiembre de 2026

> **Informe histórico.** Sus resultados corresponden únicamente a la revisión, fecha y entorno descritos en el cuerpo original. No certifica el estado actual ni el cierre financiero. Consultar la [auditoría de cierre](../develpment/development-completion-audit.md), el [progreso](../develpment/development-progress.md) y las [guías vigentes](../README.md).

## Entorno y alcance

Mercur 2.3.3 / Medusa 2.18.0, aplicaciones locales en 3000/7000/7001, API en 9000, PostgreSQL/Redis configurados y Stripe **TEST**. No se habilitaron pagos reales ni liquidaciones automáticas. Se preservó el pedido original #5 sin modificarlo.

Se crearon mediante workflows nativos dos grupos financieros de prueba de 34 USD, cada uno con un pedido de 12 USD y otro de 22 USD para tiendas distintas. Son fixtures con líneas personalizadas y envío nominal para probar la distribución financiera, no compras completas de catálogo ni pruebas de inventario. Se creó una tienda QA pendiente de aprobación, sin invitar usuarios ni habilitar ventas.

| Caso | Pedido A | Pedido B |
| --- | --- | --- |
| Autorización sin cobro | `order_01M2BJYNZZ8RBGDE55HCVCR9CW` (#6) | `order_01M2BJYVQCHQTXBMPBC77WWFCT` (#7) |
| Captura completa | `order_01M2BK7KGT9ETNPACBG0DDPMG6` (#8) | `order_01M2BK7S6APMWDQ2XDKSZVQC4B` (#9) |

## Evidencia del navegador Orca

Se interactuó con formularios reales de los frontends, no con un endpoint de prueba que omita sus acciones/autorización. La comprobación de pantalla fue mediante DOM; no se declara una revisión visual por capturas de pantalla ni prueba del diálogo de impresión del sistema.

- **Vendedor / #6:** cancelar pedido sin cobro → HTTP 200, pedido cancelado, historial de cancelación por 0 USD. La autorización de la compra siguió activa para #7.
- **Operador / #8:** formulario rechazó 13 USD al tener un máximo de 12. Reembolso parcial de 1 USD → HTTP 200; asignación 12, reembolsado 1, saldo 11 y total nativo 11.
- **Operador / #9:** después del reembolso de A, se comprobaron asignación 22, reembolsado 0 y saldo 22. Reembolso total de 22 USD → HTTP 200; reembolsado 22, saldo 0 y total nativo 0.
- **Operador / #7:** cancelar la última tienda sin cobro → pedido y pago compartido cancelados; historial 0 USD.
- **Seguridad:** abrir #9 desde la sesión del vendedor de A negó tanto el detalle como el panel financiero, sin exponer datos de B.
- **Comprador / comprobante de #8:** mostró crédito 1 USD, total 11 USD y «Reembolsado de este pedido: 1 USD», sin restar dos veces el reembolso. Se mantuvo la distinción entre comprobante y factura fiscal.
- **Vendedor / #8:** cancelación después del reembolso parcial → devolución de los 11 USD restantes, total 0, reembolsado acumulado 12 y pedido cancelado.
- **Operador / #9:** cancelación después del reembolso total → historial de cancelación por 0 USD, sin un segundo reembolso de 22 USD.
- **Comprador / comprobante final de #8:** cancelado, crédito 12 USD, total 0 y reembolsado 12 USD.
- **Carga/errores:** durante reinicios de API se observaron límites de error recuperables; con API disponible las regiones financieras y logísticas resolvieron datos. Los formularios mostraron «Procesando…» y bloquearon interacción durante las operaciones lentas.

## Comprobaciones automatizadas

- `pnpm test`: pasó la batería general; backend **61 suites / 755 pruebas**, más pruebas de preparación de despliegue. Admin 97 y vendor 134 en esa ejecución. También pasaron storefront y theme-sync.
- Finanzas, ejecución específica final: **5 suites / 86 pruebas**. Incluye validación, importes exactos, asignación inmutable, reembolsos parciales/totales entre tiendas, permisos, capturas/estados no admitidos, liquidaciones anteriores, cambios pendientes, identidad de solicitud, concurrencia, errores de proveedor y bloqueo de resultados inciertos.
- Componente de comprador después del ajuste final: **7/7**, incluyendo atribución del reembolso y ausencia de doble descuento.
- `pnpm typecheck`: pasó después de corregir el tipo opcional de `FetchError.status`.
- `pnpm lint`: pasó sin errores, con 22 advertencias (incluye advertencias en scripts QA y excepciones internas; no todas son previas).
- `pnpm build:api`: compilación satisfactoria.
- `pnpm peers check`: sin conflictos.
- `finance:contracts:check`: contrato generado coincide con el esquema.
- Migración `Migration20260912194401` generada con Medusa y aplicada satisfactoriamente.
- Después de corregir la conciliación de autorizaciones: **61 suites / 760 pruebas del backend** y las 3 pruebas de despliegue pasaron; se repitieron satisfactoriamente typecheck y build de API (que incluye lint). La cobertura financiera suma 91 casos tras añadir las cinco regresiones del proveedor.

## Incidencias y correcciones

- La proyección real de Medusa devuelve `BigNumber`: se adaptó su validación sin perder los importes en unidades monetarias.
- Se distinguió en el front el estado del pago compartido de las devoluciones de cada pedido.
- Los errores financieros esperados del backend se muestran en los formularios; los fallos de transporte indican consultar historial antes de crear otra solicitud.
- El recargador de Medusa en Windows perdió su proceso hijo tras varias escrituras (`taskkill: process not found`). Se reinició el `pnpm dev` existente, después de comprobar que las operaciones financieras en curso habían finalizado. No se reinició Orca.
- La conciliación detectó que Stripe registra la liberación de los 34 USD autorizados mediante un objeto `Refund`, con `amount_received = 0`. Se contrastó con la documentación oficial y se corrigió el conciliador para distinguir autorización liberada de devolución de dinero cobrado. Se añadieron cinco pruebas de regresión: la excepción no admite captura, autorización aún activa, liberación parcial ni importe todavía capturable.
- La primera ejecución del diagnóstico final comenzó mientras #9 aún estaba cancelándose y rechazó correctamente su estado pendiente. Se volvió a ejecutar únicamente la lectura; no se repitió ninguna operación financiera.

## Límites

No se probaron cobros reales, reversión de transferencias a vendedores, captura ajustada tras cancelación parcial de una autorización, devolución física de artículos ni correos de reembolso. Estas ramas no están habilitadas por este cambio. Ver [alcance y pendientes](../order-finance.md).

## Conciliación final — satisfactoria

`pnpm --filter @usapeek/api exec medusa exec ./src/scripts/verify-order-finance-qa.ts` terminó con código 0 después de la corrección del caso de autorización liberada.

| Pedido | Estado | Asignado | Dinero reembolsado | Operaciones completas |
| --- | --- | ---: | ---: | ---: |
| #6, A autorizado | Cancelado | 12 USD | 0 USD | 1 |
| #7, B autorizado | Cancelado | 22 USD | 0 USD | 1 |
| #8, A cobrado | Cancelado | 12 USD | 12 USD | 2 |
| #9, B cobrado | Cancelado | 22 USD | 22 USD | 2 |

- Grupo cobrado: Stripe recibió 3400 centavos y devolvió exactamente 100 + 2200 + 1100. Medusa registra captura 34 USD y reembolsos 34 USD, con transacciones negativas de 12 y 22 USD en sus respectivos pedidos.
- Grupo autorizado: Stripe recibió 0, quedó cancelado y sin importe capturable. Su objeto `Refund` de 3400 centavos corresponde a liberación de autorización, no a dinero previamente cobrado. Medusa mantiene captura y reembolso monetario en 0.
- Los cuatro pedidos no tienen operaciones inciertas ni bloqueos financieros pendientes. El diagnóstico no efectuó mutaciones.
- Los fixtures se conservan identificados como QA para inspección; no se borraron registros de auditoría ni se modificó el pedido original del usuario.
